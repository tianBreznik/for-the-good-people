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

/** Outbound mail for applicants (does not require ADMIN_NOTIFY_EMAIL). */
function getApplicantMailMode() {
    if (envValue('RESEND_API_KEY')) return 'resend';
    if (!isProduction() && envValue('SMTP_HOST') && envValue('SMTP_USER') && envValue('SMTP_PASS')) {
        return 'smtp';
    }
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

function buildApplicationEmail({ name, email, message, avatar, duplicate, approveUrl, rejectUrl }) {
    const siteName = envValue('SITE_NAME') || 'Good People Posting';
    const handle = name ? `@${name}` : '(no name)';
    const safeMessage = String(message || '').trim();
    const avatarLine = avatar ? String(avatar).trim() : '';
    const subject = duplicate
        ? `[${siteName}] Author application (resubmission) — ${handle}`
        : `[${siteName}] New author application — ${handle}`;

    const actionText =
        approveUrl && rejectUrl
            ? [
                  '',
                  'Click a link — done (opens the site and finishes automatically):',
                  `Approve: ${approveUrl}`,
                  `Reject:  ${rejectUrl}`,
                  '',
                  'Links expire in 7 days.',
              ]
            : [
                  '',
                  '(Approve links unavailable — set ADMIN_APPROVE_SECRET and PUBLIC_SITE_URL on the server.)',
              ];

    const text = [
        `New author application on ${siteName}`,
        '',
        `Name: ${handle}`,
        `Email: ${email}`,
        avatarLine ? `Avatar: ${avatarLine}` : null,
        '',
        'Message:',
        safeMessage,
        ...actionText,
    ].filter((line) => line !== null).join('\n');

    const actionHtml =
        approveUrl && rejectUrl
            ? `
        <p style="margin: 20px 0 8px;">
            <a href="${approveUrl}" style="display:inline-block;padding:10px 16px;background:#1a7f37;color:#fff;text-decoration:none;font-weight:600;margin-right:8px;">Approve writer</a>
            <a href="${rejectUrl}" style="display:inline-block;padding:10px 16px;background:#b42318;color:#fff;text-decoration:none;font-weight:600;">Reject</a>
        </p>
        <p style="font-size:12px;color:#555;">Clicking a link finishes the review and returns you to the site. Links expire in 7 days.</p>
    `
            : `<p style="font-size:12px;color:#555;">Approve links unavailable — set <code>ADMIN_APPROVE_SECRET</code> and <code>PUBLIC_SITE_URL</code>.</p>`;

    const html = `
        <p><strong>New author application</strong> on ${siteName}</p>
        <p><strong>Name:</strong> ${handle}<br>
        <strong>Email:</strong> <a href="mailto:${email}">${email}</a>${
            avatarLine ? `<br><strong>Avatar:</strong> ${avatarLine.replace(/</g, '&lt;')}` : ''
        }</p>
        <p><strong>Message:</strong></p>
        <pre style="font-family: sans-serif; white-space: pre-wrap;">${safeMessage.replace(/</g, '&lt;')}</pre>
        ${actionHtml}
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

async function sendAuthorApplicationNotification({ name, email, message, avatar, duplicate = false }) {
    const mode = getMailMode();
    if (mode === 'none') {
        const hint = isProduction()
            ? 'Set RESEND_API_KEY on Railway (SMTP is blocked there). See RAILWAY.md.'
            : 'Set ADMIN_NOTIFY_EMAIL and RESEND_API_KEY or SMTP_* in .env';
        console.warn(`[mail] Author application saved but no email sent. ${hint}`);
        return { sent: false, skipped: true };
    }

    let approveUrl = '';
    let rejectUrl = '';
    try {
        const { buildAuthorApplicationActionUrls, isApproveSecretConfigured } = require('./admin-action-token');
        if (isApproveSecretConfigured()) {
            const urls = buildAuthorApplicationActionUrls(email);
            if (urls) {
                approveUrl = urls.approveUrl;
                rejectUrl = urls.rejectUrl;
            }
        } else {
            console.warn(
                '[mail] ADMIN_APPROVE_SECRET missing or too short — email sent without approve/reject links'
            );
        }
    } catch (linkErr) {
        console.warn('[mail] Could not build approve links', linkErr.message || linkErr);
    }

    const to = getNotifyRecipients();
    const from = getFromAddress(mode);
    const { subject, text, html } = buildApplicationEmail({
        name,
        email,
        message,
        avatar,
        duplicate,
        approveUrl,
        rejectUrl,
    });
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

    return { sent: true, messageId, to, from, transport: mode, hasActionLinks: Boolean(approveUrl) };
}

function buildAuthorWelcomeEmail({ name, email, setPasswordUrl }) {
    const siteName = envValue('SITE_NAME') || 'Good People Posting';
    const handle = name ? `@${String(name).replace(/^@+/, '')}` : email;
    const subject = `[${siteName}] You’re approved — set your password`;
    const text = [
        `You’re approved to write on ${siteName}.`,
        '',
        `Handle: ${handle}`,
        `Email: ${email}`,
        '',
        'Your application did not include a password yet. Set one to sign in:',
        setPasswordUrl,
        '',
        'If you did not apply, you can ignore this email.',
    ].join('\n');
    const html = `
        <p>You’re approved to write on <strong>${siteName}</strong>.</p>
        <p><strong>Handle:</strong> ${handle}<br>
        <strong>Email:</strong> ${email}</p>
        <p>Your application did not include a password yet. Set one so you can sign in:</p>
        <p style="margin:20px 0">
            <a href="${setPasswordUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;font-weight:600;">Set password</a>
        </p>
        <p style="font-size:12px;color:#555;">If you did not apply, you can ignore this email.</p>
    `;
    return { subject, text, html };
}

function publicSiteOriginForMail() {
    const raw = (envValue('PUBLIC_SITE_URL') || envValue('SITE_URL')).replace(/\/+$/, '');
    if (raw) return raw;
    if (isProduction()) return 'https://goodpeople.build';
    return 'http://localhost:3008';
}

/**
 * Acceptance email copy — edit subject / text / html here.
 * Optional setPasswordUrl is only for legacy applications that had no password on apply.
 */
function buildAuthorAcceptedEmail({ name, email, setPasswordUrl = '' }) {
    const siteName = envValue('SITE_NAME') || 'Good People Posting';
    const siteUrl = publicSiteOriginForMail();
    const handle = name ? `@${String(name).replace(/^@+/, '')}` : '';
    const subject = `[${siteName}] ${handle} let's post.`;

    const passwordLines = setPasswordUrl
        ? [
              '',
              'Your application did not include a password yet. Set one here:',
              setPasswordUrl,
          ]
        : [
              '',
              'Sign in with the email and password you set when you applied!',
              siteUrl,
          ];

    const text = [
        `You’re in!`,
        '',
        `We can't wait to see what you write on ${siteName}.`,
        handle ? `as: ${handle}` : null,
        `Email: ${email}`,
        ...passwordLines,
    ]
        .filter((line) => line !== null)
        .join('\n');

    // White fill + black outline (Impact). No chip background.
    const impactStyle =
        "font-family:Impact,Haettenschweiler,'Arial Narrow Bold',sans-serif;font-weight:400;letter-spacing:0.02em;text-transform:uppercase;color:#ffffff;-webkit-text-fill-color:#ffffff;-webkit-text-stroke:1px #000000;text-shadow:0 0 1px #000,1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;";
    const impactWrapStyleRed =
        'display:inline-block;line-height:1.1;vertical-align:baseline;color:red;';
    const impactWrapStyleBlack =
        'display:inline-block;line-height:1.1;vertical-align:baseline;color:black;';
    const impactSiteName = `<strong style="${impactWrapStyleBlack}">${siteName}</strong>`;
    const impactOpenLabel = `<span style="${impactStyle}">Open ${siteName}</span>`;

    const passwordHtml = setPasswordUrl
        ? `
        <p>Your application did not include a password yet. Set one so you can sign in:</p>
        <p style="margin:20px 0">
            <a href="${setPasswordUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;font-weight:600;">Set password</a>
        </p>
    `
        : `
        <p>Sign in with the email and password you chose when you applied!</p>
        <p style="margin:20px 0">
            <a href="${siteUrl}" style="display:inline-block;padding:10px 16px;background:#111;text-decoration:none;">${impactOpenLabel}</a>
        </p>
    `;

    const html = `
        <p><u>You’re in</u>.</p>
        <p>We can't wait to see what you write on ${impactSiteName}.</p>
        <p>${handle ? `<strong>as:</strong> ${handle}<br>` : ''}
        <strong>email:</strong> ${email}</p>
        <p>Keep posting for all the <span style="${impactWrapStyleRed}"><strong>good people</strong></span>.</p>
        ${passwordHtml}
    `;

    return { subject, text, html };
}

async function sendAuthorApprovedWelcome({ email, name, setPasswordUrl }) {
    const to = normalizeEmailAddress(email);
    if (!to || !setPasswordUrl) {
        return { sent: false, skipped: true };
    }

    const mode = getApplicantMailMode();
    if (mode === 'none') {
        console.warn(
            '[mail] Author approved but welcome email not sent — set RESEND_API_KEY (or local SMTP_*).'
        );
        return { sent: false, skipped: true };
    }

    const from = getFromAddress(mode);
    const { subject, text, html } = buildAuthorWelcomeEmail({ name, email: to, setPasswordUrl });

    const info =
        mode === 'resend'
            ? await sendViaResend({ from, to: [to], subject, text, html })
            : await sendViaSmtp({ from, to, subject, text, html });

    const messageId = info?.id || info?.messageId || 'n/a';
    console.log(
        `[mail] Sent author welcome / set-password (${mode}) → ${to} (from ${from}, id ${messageId})`
    );
    return { sent: true, messageId, to, from, transport: mode };
}

async function sendAuthorAcceptedEmail({ email, name, setPasswordUrl = '' }) {
    const to = normalizeEmailAddress(email);
    if (!to) {
        return { sent: false, skipped: true };
    }

    const mode = getApplicantMailMode();
    if (mode === 'none') {
        console.warn(
            '[mail] Author approved but acceptance email not sent — set RESEND_API_KEY (or local SMTP_*).'
        );
        return { sent: false, skipped: true };
    }

    const from = getFromAddress(mode);
    const { subject, text, html } = buildAuthorAcceptedEmail({
        name,
        email: to,
        setPasswordUrl,
    });

    const info =
        mode === 'resend'
            ? await sendViaResend({ from, to: [to], subject, text, html })
            : await sendViaSmtp({ from, to, subject, text, html });

    const messageId = info?.id || info?.messageId || 'n/a';
    console.log(
        `[mail] Sent author acceptance (${mode}) → ${to} (from ${from}, id ${messageId})`
    );
    return { sent: true, messageId, to, from, transport: mode };
}

function buildPasswordResetEmail({ email, resetUrl }) {
    const siteName = envValue('SITE_NAME') || 'Good People Posting';
    const subject = `[${siteName}] Reset your password`;
    const text = [
        `Reset your ${siteName} password.`,
        '',
        `Email: ${email}`,
        '',
        'Open this link to choose a new password:',
        resetUrl,
        '',
        'If you did not ask for this, you can ignore this email.',
    ].join('\n');
    const html = `
        <p>Reset your <strong>${siteName}</strong> password.</p>
        <p><strong>Email:</strong> ${email}</p>
        <p style="margin:20px 0">
            <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;font-weight:600;">Reset password</a>
        </p>
        <p style="font-size:12px;color:#555;">If you did not ask for this, you can ignore this email.</p>
    `;
    return { subject, text, html };
}

async function sendPasswordResetEmail({ email, resetUrl }) {
    const to = normalizeEmailAddress(email);
    if (!to || !resetUrl) {
        return { sent: false, skipped: true };
    }

    const mode = getApplicantMailMode();
    if (mode === 'none') {
        console.warn(
            '[mail] Password reset not sent — set RESEND_API_KEY (or local SMTP_*).'
        );
        return { sent: false, skipped: true };
    }

    const from = getFromAddress(mode);
    const { subject, text, html } = buildPasswordResetEmail({ email: to, resetUrl });

    const info =
        mode === 'resend'
            ? await sendViaResend({ from, to: [to], subject, text, html })
            : await sendViaSmtp({ from, to, subject, text, html });

    const messageId = info?.id || info?.messageId || 'n/a';
    console.log(
        `[mail] Sent password reset (${mode}) → ${to} (from ${from}, id ${messageId})`
    );
    return { sent: true, messageId, to, from, transport: mode };
}

function normalizeEmailAddress(email) {
    const addr = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return '';
    return addr;
}

module.exports = {
    getNotifyRecipients,
    getMailMode,
    isMailConfigured,
    isResendConfigured,
    isSmtpConfigured,
    sendAuthorApplicationNotification,
    sendAuthorApprovedWelcome,
    sendAuthorAcceptedEmail,
    sendPasswordResetEmail,
};
