const nodemailer = require('nodemailer');

function getNotifyRecipients() {
    const parts = [envValue('ADMIN_NOTIFY_EMAIL'), envValue('ADMIN_NOTIFY_EMAIL_EXTRA')]
        .join(',')
        .split(',')
        .map((addr) => addr.trim())
        .filter(Boolean);
    return [...new Set(parts)];
}

function envValue(key) {
    const raw = process.env[key];
    if (raw == null) return '';
    return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

function isProduction() {
    return envValue('NODE_ENV') === 'production';
}

function isResendConfigured() {
    return Boolean(envValue('RESEND_API_KEY') && getNotifyRecipients().length);
}

function isSmtpConfigured() {
    return Boolean(
        getNotifyRecipients().length &&
            envValue('SMTP_HOST') &&
            envValue('SMTP_USER') &&
            envValue('SMTP_PASS')
    );
}

function isMailConfigured() {
    if (!getNotifyRecipients().length) return false;
    if (isProduction()) return isResendConfigured();
    return isResendConfigured() || isSmtpConfigured();
}

function getMailMode() {
    if (isResendConfigured()) return 'resend';
    if (isProduction()) return 'none';
    if (isSmtpConfigured()) return 'smtp';
    return 'none';
}

function getTransporter() {
    const port = Number(envValue('SMTP_PORT') || 587);
    const secure = envValue('SMTP_SECURE') === 'true' || port === 465;

    return nodemailer.createTransport({
        host: envValue('SMTP_HOST'),
        port,
        secure,
        auth: {
            user: envValue('SMTP_USER'),
            pass: envValue('SMTP_PASS'),
        },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
    });
}

function buildApplicationEmail({ name, email, message, duplicate }) {
    const siteName = envValue('SITE_NAME') || 'Good People Posting';
    const handle = name ? `@${name}` : '(no name)';
    const safeMessage = String(message || '').trim();
    const subject = duplicate
        ? `[${siteName}] Author application (resubmission) — ${handle}`
        : `[${siteName}] New author application — ${handle}`;

    const text = [
        `New author application on ${siteName}`,
        '',
        `Name: ${handle}`,
        `Email: ${email}`,
        '',
        'Message:',
        safeMessage,
    ].join('\n');

    const html = `
        <p><strong>New author application</strong> on ${siteName}</p>
        <p><strong>Name:</strong> ${handle}<br>
        <strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Message:</strong></p>
        <pre style="font-family: sans-serif; white-space: pre-wrap;">${safeMessage.replace(/</g, '&lt;')}</pre>
    `;

    return { subject, text, html };
}

const RESEND_DEFAULT_FROM = 'Good People Posting <onboarding@resend.dev>';

/** Domains Resend will reject unless verified in the Resend dashboard. */
function isLikelyUnverifiedResendFrom(from) {
    const match = String(from || '').match(/<([^>]+)>/);
    const addr = (match ? match[1] : from).trim().toLowerCase();
    const domain = addr.split('@')[1] || '';
    return ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'].includes(domain);
}

function normalizeReplyTo(email, name) {
    const raw = String(email || '').trim();
    const angleMatch = raw.match(/<([^>]+)>/);
    const addr = (angleMatch ? angleMatch[1] : raw).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        return null;
    }
    const displayName = String(name || '')
        .trim()
        .replace(/[<>"\n\r]/g, '')
        .slice(0, 80);
    if (displayName) {
        return `${displayName} <${addr}>`;
    }
    return addr;
}

function getFromAddress(mode) {
    if (mode === 'resend') {
        const resendFrom = envValue('RESEND_FROM');
        if (resendFrom && !isLikelyUnverifiedResendFrom(resendFrom)) {
            return resendFrom;
        }
        const mailFrom = envValue('MAIL_FROM');
        if (mailFrom && !isLikelyUnverifiedResendFrom(mailFrom)) {
            return mailFrom;
        }
        if (resendFrom || mailFrom) {
            console.warn(
                '[mail] MAIL_FROM/RESEND_FROM uses an unverified domain for Resend — using onboarding@resend.dev. Verify goodpeople.build at https://resend.com/domains and set RESEND_FROM=Good People Posting <notifications@goodpeople.build>'
            );
        }
        return RESEND_DEFAULT_FROM;
    }

    return (
        envValue('MAIL_FROM') ||
        envValue('SMTP_USER') ||
        RESEND_DEFAULT_FROM
    );
}

async function sendViaResend({ to, from, replyTo, subject, text, html }) {
    const apiKey = envValue('RESEND_API_KEY');
    const payload = { from, to, subject, text, html };
    if (replyTo) {
        payload.reply_to = replyTo;
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(body.message || `Resend HTTP ${response.status}`);
        err.code = body.name || 'resend_send_failed';
        throw err;
    }
    return body;
}

async function sendViaSmtp({ to, from, replyTo, subject, text, html }) {
    const transporter = getTransporter();
    return transporter.sendMail({ from, to, replyTo, subject, text, html });
}

async function sendAuthorApplicationNotification({ name, email, message, duplicate = false }) {
    const mode = getMailMode();
    if (mode === 'none') {
        const hint = isProduction()
            ? 'Set RESEND_API_KEY on Railway (SMTP is blocked there). See RAILWAY.md.'
            : 'Set ADMIN_NOTIFY_EMAIL and RESEND_API_KEY or SMTP_* in .env';
        console.warn(`[mail] Author application saved but no email sent. ${hint}`);
        return { sent: false, skipped: true };
    }

    const to = getNotifyRecipients();
    const from = getFromAddress(mode);
    const { subject, text, html } = buildApplicationEmail({ name, email, message, duplicate });
    const replyTo = normalizeReplyTo(email, name);
    if (!replyTo) {
        console.warn(`[mail] No reply_to — applicant email invalid or missing: "${email}"`);
    }

    const info =
        mode === 'resend'
            ? await sendViaResend({ from, to, replyTo, subject, text, html })
            : await sendViaSmtp({ from, to, replyTo: replyTo || undefined, subject, text, html });

    const messageId = info?.id || info?.messageId || 'n/a';
    console.log(
        `[mail] Sent author application notification (${mode}) → ${to.join(', ')} (from ${from}, id ${messageId})`
    );

    return { sent: true, messageId, to, from, transport: mode };
}

module.exports = {
    getNotifyRecipients,
    getMailMode,
    isMailConfigured,
    isResendConfigured,
    isSmtpConfigured,
    sendAuthorApplicationNotification,
};
