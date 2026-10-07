const crypto = require('crypto');

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function envValue(key) {
    const raw = process.env[key];
    if (raw == null) return '';
    return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

function getApproveSecret() {
    return envValue('ADMIN_APPROVE_SECRET');
}

function isApproveSecretConfigured() {
    return getApproveSecret().length >= 16;
}

function getPublicSiteUrl() {
    const fromEnv = envValue('PUBLIC_SITE_URL') || envValue('SITE_URL');
    if (fromEnv) return fromEnv.replace(/\/$/, '');
    if (envValue('NODE_ENV') === 'production') return 'https://goodpeople.build';
    return 'http://localhost:3008';
}

function base64urlEncode(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function base64urlDecode(str) {
    const padded = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, 'base64');
}

function signPayload(payloadObject) {
    const secret = getApproveSecret();
    if (!secret || secret.length < 16) {
        const err = new Error('approve_secret_missing');
        err.code = 'approve_secret_missing';
        throw err;
    }
    const payload = base64urlEncode(JSON.stringify(payloadObject));
    const sig = crypto.createHmac('sha256', secret).update(payload).digest();
    return `${payload}.${base64urlEncode(sig)}`;
}

/**
 * @param {'approve'|'reject'} action
 * @param {string} email
 * @param {{ ttlMs?: number }} [options]
 */
function createAuthorApplicationActionToken(action, email, options = {}) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        const err = new Error('invalid_email');
        err.code = 'invalid_email';
        throw err;
    }
    if (action !== 'approve' && action !== 'reject') {
        const err = new Error('invalid_action');
        err.code = 'invalid_action';
        throw err;
    }
    const ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_TTL_MS;
    const exp = Date.now() + ttlMs;
    return signPayload({ v: 1, action, email: normalizedEmail, exp });
}

function verifyAuthorApplicationActionToken(token) {
    const secret = getApproveSecret();
    if (!secret || secret.length < 16) {
        const err = new Error('approve_secret_missing');
        err.code = 'approve_secret_missing';
        throw err;
    }
    const parts = String(token || '').split('.');
    if (parts.length !== 2) {
        const err = new Error('invalid_token');
        err.code = 'invalid_token';
        throw err;
    }
    const [payloadPart, sigPart] = parts;
    const expected = crypto.createHmac('sha256', secret).update(payloadPart).digest();
    let given;
    try {
        given = base64urlDecode(sigPart);
    } catch (_) {
        const err = new Error('invalid_token');
        err.code = 'invalid_token';
        throw err;
    }
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        const err = new Error('invalid_token');
        err.code = 'invalid_token';
        throw err;
    }

    let data;
    try {
        data = JSON.parse(base64urlDecode(payloadPart).toString('utf8'));
    } catch (_) {
        const err = new Error('invalid_token');
        err.code = 'invalid_token';
        throw err;
    }

    if (!data || data.v !== 1 || (data.action !== 'approve' && data.action !== 'reject')) {
        const err = new Error('invalid_token');
        err.code = 'invalid_token';
        throw err;
    }
    if (!data.email || typeof data.email !== 'string') {
        const err = new Error('invalid_token');
        err.code = 'invalid_token';
        throw err;
    }
    if (!data.exp || Date.now() > Number(data.exp)) {
        const err = new Error('token_expired');
        err.code = 'token_expired';
        throw err;
    }

    return {
        action: data.action,
        email: data.email.trim().toLowerCase(),
        exp: Number(data.exp),
    };
}

function buildAuthorApplicationActionUrls(email) {
    if (!isApproveSecretConfigured()) return null;
    const base = `${getPublicSiteUrl()}/api/admin/author-application`;
    const approve = createAuthorApplicationActionToken('approve', email);
    const reject = createAuthorApplicationActionToken('reject', email);
    return {
        approveUrl: `${base}?token=${encodeURIComponent(approve)}`,
        rejectUrl: `${base}?token=${encodeURIComponent(reject)}`,
    };
}

module.exports = {
    isApproveSecretConfigured,
    getPublicSiteUrl,
    createAuthorApplicationActionToken,
    verifyAuthorApplicationActionToken,
    buildAuthorApplicationActionUrls,
};
