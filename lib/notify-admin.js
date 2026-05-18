const nodemailer = require('nodemailer');

function getNotifyRecipients() {
    const parts = [envValue('ADMIN_NOTIFY_EMAIL'), envValue('ADMIN_NOTIFY_EMAIL_EXTRA')]
        .join(',')
        .split(',')
        .map((addr) => addr.trim())
        .filter(Boolean);
    return [...new Set(parts)];
}

function isMailConfigured() {
    return Boolean(
        getNotifyRecipients().length &&
            envValue('SMTP_HOST') &&
            envValue('SMTP_USER') &&
            envValue('SMTP_PASS')
    );
}

function envValue(key) {
    const raw = process.env[key];
    if (raw == null) return '';
    return String(raw).trim().replace(/^['"]|['"]$/g, '');
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
    });
}

async function sendAuthorApplicationNotification({ name, email, message }) {
    if (!isMailConfigured()) {
        console.warn(
            '[mail] Author application saved but no email sent. Set ADMIN_NOTIFY_EMAIL, SMTP_HOST, SMTP_USER, and SMTP_PASS in .env'
        );
        return { sent: false, skipped: true };
    }

    const siteName = envValue('SITE_NAME') || 'Good People Posting';
    const to = getNotifyRecipients();
    const from = envValue('MAIL_FROM') || envValue('SMTP_USER');
    const handle = name ? `@${name}` : '(no name)';
    const safeMessage = String(message || '').trim();

    const text = [
        `New author application on ${siteName}`,
        '',
        `Name: ${handle}`,
        `Email: ${email}`,
        '',
        'Message:',
        safeMessage,
        '',
        `Firestore: authorApplications / ${email}`,
        'If approved, add this email to authorAllowlist, then ask them to sign in again.',
    ].join('\n');

    const html = `
        <p><strong>New author application</strong> on ${siteName}</p>
        <p><strong>Name:</strong> ${handle}<br>
        <strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Message:</strong></p>
        <pre style="font-family: sans-serif; white-space: pre-wrap;">${safeMessage.replace(/</g, '&lt;')}</pre>
        <p style="color:#666;font-size:13px;">Firestore: <code>authorApplications / ${email}</code><br>
        If approved, add this email to <code>authorAllowlist</code>, then ask them to sign in again.</p>
    `;

    const transporter = getTransporter();
    const info = await transporter.sendMail({
        from,
        to,
        replyTo: email,
        subject: `[${siteName}] New author application — ${handle}`,
        text,
        html,
    });

    console.log(
        `[mail] Sent author application notification → ${to.join(', ')} (from ${from}, id ${info.messageId || 'n/a'})`
    );

    return { sent: true, messageId: info.messageId, to, from };
}

module.exports = {
    getNotifyRecipients,
    isMailConfigured,
    sendAuthorApplicationNotification,
};
