const path = require('path');
const admin = require('firebase-admin');

const PROJECT_ID = 'good-people-posting';
let initialized = false;

function initFirebaseAdmin() {
    if (initialized) return admin;

    const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (jsonEnv) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(jsonEnv)),
            projectId: PROJECT_ID,
        });
    } else if (pathEnv) {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const serviceAccount = require(path.resolve(pathEnv));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: PROJECT_ID,
        });
    } else {
        const defaultPath = path.join(__dirname, '..', 'firebase-service-account.json');
        try {
            // eslint-disable-next-line import/no-dynamic-require, global-require
            const serviceAccount = require(defaultPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: PROJECT_ID,
            });
        } catch (e) {
            throw new Error(
                'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or add firebase-service-account.json at the project root.'
            );
        }
    }

    initialized = true;
    return admin;
}

function getAdmin() {
    return initFirebaseAdmin();
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizeAuthorName(raw) {
    const name = String(raw || '')
        .trim()
        .replace(/^@+/, '')
        .replace(/\s+/g, '_')
        .toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(name)) return '';
    return name;
}

async function isEmailAuthorAllowlisted(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    const snap = await getAdmin().firestore().collection('authorAllowlist').doc(normalized).get();
    return snap.exists;
}

async function completeUserSignup({ uid, email, authorName }) {
    const normalizedName = normalizeAuthorName(authorName);
    if (!normalizedName) {
        const err = new Error('invalid_author_name');
        err.code = 'invalid_author_name';
        throw err;
    }

    const grantedAuthor = await isEmailAuthorAllowlisted(email);

    const claims = {
        authorName: normalizedName,
        accountRole: grantedAuthor ? 'author' : 'reader',
    };
    if (grantedAuthor) claims.role = 'real person';

    const adminApp = getAdmin();
    await adminApp.auth().setCustomUserClaims(uid, claims);
    await adminApp.auth().updateUser(uid, { displayName: normalizedName });
    await adminApp.firestore().collection('users').doc(uid).set(
        {
            authorName: normalizedName,
            email: normalizeEmail(email),
            accountRole: claims.accountRole,
            approvedAuthor: grantedAuthor,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return {
        authorName: normalizedName,
        accountRole: claims.accountRole,
        grantedAuthor,
    };
}

function normalizeAvatarPath(raw) {
    const path = String(raw || '').trim();
    const preset = path.match(/^\/?pfps\/([A-Za-z0-9_.-]+)$/);
    if (preset) {
        const file = preset[1];
        const allowed = new Set([
            'IMG_0633.jpg',
            'IMG_7131.jpg',
            'IMG_8737.jpg',
            'IMG_8739.JPG',
            'IMG_8740.JPG',
            'IMG_8741.JPG',
            'IMG_8743.JPG',
            'IMG_8744.JPG',
            'IMG_8745.PNG',
            'IMG_8747.JPG',
            'IMG_8748.jpg',
            'IMG_8749.jpg',
            'IMG_8750.jpg',
            'IMG_8751.jpg',
            'IMG_8753.jpg',
            'IMG_8755.jpg',
            'IMG_9128.jpg',
        ]);
        if (!allowed.has(file)) return '';
        return `/pfps/${file}`;
    }
    // User-uploaded profile pictures (via /upload → public/uploads/).
    const uploaded = path.match(/^\/?uploads\/([A-Za-z0-9_.-]+)$/);
    if (uploaded) return `/uploads/${uploaded[1]}`;
    return '';
}

async function submitAuthorApplication({ name, email, message, uid, avatar }) {
    const normalizedEmail = normalizeEmail(email);
    const trimmedMessage = String(message || '').trim();
    if (!normalizedEmail || !trimmedMessage) {
        const err = new Error('missing_fields');
        err.code = 'missing_fields';
        throw err;
    }
    if (trimmedMessage.length < 20) {
        const err = new Error('message_too_short');
        err.code = 'message_too_short';
        throw err;
    }

    if (await isEmailAuthorAllowlisted(normalizedEmail)) {
        return { ok: true, alreadyApproved: true };
    }

    const slugName = normalizeAuthorName(name);
    const displayName = slugName || String(name || '').trim().slice(0, 48);
    if (!displayName) {
        const err = new Error('invalid_name');
        err.code = 'invalid_name';
        throw err;
    }

    const avatarPath = normalizeAvatarPath(avatar);
    if (!avatarPath) {
        const err = new Error('invalid_avatar');
        err.code = 'invalid_avatar';
        throw err;
    }

    const adminApp = getAdmin();
    const ref = adminApp.firestore().collection('authorApplications').doc(normalizedEmail);
    const existing = await ref.get();
    if (existing.exists && existing.data().status === 'pending') {
        return { ok: true, duplicate: true };
    }

    await ref.set(
        {
            name: displayName,
            email: normalizedEmail,
            message: trimmedMessage.slice(0, 2000),
            avatar: avatarPath,
            status: 'pending',
            uid: uid || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return { ok: true };
}

async function findUidForEmail(email, preferredUid) {
    const adminApp = getAdmin();
    if (preferredUid) {
        try {
            const existing = await adminApp.auth().getUser(preferredUid);
            if (existing) return existing.uid;
        } catch (_) {}
    }
    try {
        const byEmail = await adminApp.auth().getUserByEmail(normalizeEmail(email));
        return byEmail.uid;
    } catch (_) {
        return null;
    }
}

function publicSiteOrigin() {
    const raw = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
    return raw || 'http://localhost:3008';
}

/**
 * Ensure a Firebase Auth user exists for this email.
 * Prefer accounts created at apply time (with password). Fallback create is passwordless (legacy).
 */
async function ensureAuthUserForEmail(email, { displayName, preferredUid } = {}) {
    const normalizedEmail = normalizeEmail(email);
    let uid = await findUidForEmail(normalizedEmail, preferredUid || null);
    if (uid) {
        return { uid, created: false };
    }

    const createPayload = {
        email: normalizedEmail,
        emailVerified: true,
        disabled: false,
    };
    const name = String(displayName || '').trim().slice(0, 80);
    if (name) createPayload.displayName = name;

    try {
        const created = await getAdmin().auth().createUser(createPayload);
        return { uid: created.uid, created: true };
    } catch (err) {
        // Race: another process created the account between lookup and create.
        if (err && (err.code === 'auth/email-already-exists' || err.code === 'auth/uid-already-exists')) {
            uid = await findUidForEmail(normalizedEmail, preferredUid || null);
            if (uid) return { uid, created: false };
        }
        throw err;
    }
}

async function generateSetPasswordLink(email) {
    const normalizedEmail = normalizeEmail(email);
    const firebaseLink = await getAdmin().auth().generatePasswordResetLink(normalizedEmail, {
        url: `${publicSiteOrigin()}/?login=1`,
        handleCodeInApp: false,
    });
    return toSitePasswordResetUrl(firebaseLink);
}

/** Rewrite Firebase-hosted action URL → our /reset page (same oobCode). */
function toSitePasswordResetUrl(firebaseLink) {
    try {
        const parsed = new URL(String(firebaseLink || ''));
        const oobCode = parsed.searchParams.get('oobCode');
        if (!oobCode) return String(firebaseLink || '');
        const url = new URL('/reset', `${publicSiteOrigin()}/`);
        url.searchParams.set('mode', 'resetPassword');
        url.searchParams.set('oobCode', oobCode);
        return url.toString();
    } catch (_) {
        return String(firebaseLink || '');
    }
}

/**
 * Password reset via our SMTP/Resend (Firebase's built-in Auth emails often never arrive).
 * Always returns ok for unknown emails (no enumeration).
 */
async function requestPasswordResetEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        const err = new Error('invalid_email');
        err.code = 'invalid_email';
        throw err;
    }

    let exists = false;
    try {
        await getAdmin().auth().getUserByEmail(normalizedEmail);
        exists = true;
    } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
    }

    if (!exists) {
        console.log(`[mail] Password reset requested for unknown email (${normalizedEmail}) — no mail sent`);
        return { ok: true, sent: false };
    }

    const resetUrl = await generateSetPasswordLink(normalizedEmail);
    const { sendPasswordResetEmail } = require('./notify-admin');
    const mailResult = await sendPasswordResetEmail({
        email: normalizedEmail,
        resetUrl,
    });

    return { ok: true, sent: Boolean(mailResult && mailResult.sent) };
}

async function grantAuthorAccessFromApplication(email, applicationData = {}) {
    const normalizedEmail = normalizeEmail(email);
    const authorName =
        normalizeAuthorName(applicationData.name) ||
        normalizeAuthorName(applicationData.authorName) ||
        '';
    const avatarPath = normalizeAvatarPath(applicationData.avatar) || null;
    const displayHint =
        authorName ||
        String(applicationData.name || applicationData.authorName || '').trim() ||
        normalizedEmail;

    const { uid, created } = await ensureAuthUserForEmail(normalizedEmail, {
        displayName: displayHint,
        preferredUid: applicationData.uid || null,
    });

    const userRecord = await getAdmin().auth().getUser(uid);
    const existingClaims = userRecord.customClaims || {};
    const resolvedName =
        authorName ||
        normalizeAuthorName(existingClaims.authorName) ||
        normalizeAuthorName(userRecord.displayName) ||
        `user_${uid.slice(0, 8)}`;

    const claims = {
        ...existingClaims,
        authorName: resolvedName,
        accountRole: 'author',
        role: 'real person',
    };
    await getAdmin().auth().setCustomUserClaims(uid, claims);
    await getAdmin().auth().updateUser(uid, { displayName: resolvedName });

    const userDoc = {
        authorName: resolvedName,
        email: normalizedEmail,
        accountRole: 'author',
        approvedAuthor: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (avatarPath) userDoc.avatar = avatarPath;

    await getAdmin().firestore().collection('users').doc(uid).set(userDoc, { merge: true });

    if (avatarPath) {
        await getAdmin()
            .firestore()
            .collection('authorProfiles')
            .doc(resolvedName)
            .set(
                {
                    authorName: resolvedName,
                    uid,
                    avatar: avatarPath,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
    }

    let setPasswordUrl = null;
    if (created) {
        try {
            setPasswordUrl = await generateSetPasswordLink(normalizedEmail);
        } catch (linkErr) {
            console.warn(
                '[auth] Could not generate set-password link for',
                normalizedEmail,
                linkErr.message || linkErr
            );
        }
    }

    return {
        uid,
        authorName: resolvedName,
        avatar: avatarPath,
        created,
        setPasswordUrl,
    };
}

async function approveAuthorApplication(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        const err = new Error('invalid_email');
        err.code = 'invalid_email';
        throw err;
    }

    const adminApp = getAdmin();
    const appRef = adminApp.firestore().collection('authorApplications').doc(normalizedEmail);
    const appSnap = await appRef.get();
    const applicationData = appSnap.exists ? appSnap.data() || {} : {};

    const allowRef = adminApp.firestore().collection('authorAllowlist').doc(normalizedEmail);
    const allowSnap = await allowRef.get();
    const alreadyAllowlisted = allowSnap.exists;

    await allowRef.set(
        {
            email: normalizedEmail,
            source: 'email_link',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            ...(alreadyAllowlisted ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
        },
        { merge: true }
    );

    const granted = await grantAuthorAccessFromApplication(normalizedEmail, applicationData);

    await appRef.set(
        {
            email: normalizedEmail,
            status: 'approved',
            reviewedVia: 'email_link',
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            uid: granted.uid || applicationData.uid || null,
            authUserCreated: Boolean(granted.created),
        },
        { merge: true }
    );

    let acceptanceEmailSent = false;
    let welcomeEmailSent = false;
    try {
        const { sendAuthorAcceptedEmail } = require('./notify-admin');
        const mailResult = await sendAuthorAcceptedEmail({
            email: normalizedEmail,
            name: granted.authorName || applicationData.name || '',
            // Legacy only: passwordless account created on approve.
            setPasswordUrl: granted.created ? granted.setPasswordUrl || '' : '',
        });
        acceptanceEmailSent = Boolean(mailResult && mailResult.sent);
        // Same mail carries the set-password CTA when needed.
        welcomeEmailSent = Boolean(acceptanceEmailSent && granted.created && granted.setPasswordUrl);
    } catch (mailErr) {
        console.warn(
            '[mail] Could not send author acceptance email',
            mailErr.message || mailErr
        );
    }

    return {
        ok: true,
        action: 'approve',
        email: normalizedEmail,
        alreadyAllowlisted,
        authorName: granted.authorName || applicationData.name || null,
        avatar: granted.avatar || applicationData.avatar || null,
        uid: granted.uid,
        claimsUpdated: Boolean(granted.uid),
        authUserCreated: Boolean(granted.created),
        acceptanceEmailSent,
        welcomeEmailSent,
        setPasswordUrl: granted.created ? granted.setPasswordUrl : null,
    };
}

async function rejectAuthorApplication(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        const err = new Error('invalid_email');
        err.code = 'invalid_email';
        throw err;
    }

    const adminApp = getAdmin();
    const appRef = adminApp.firestore().collection('authorApplications').doc(normalizedEmail);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
        const err = new Error('application_not_found');
        err.code = 'application_not_found';
        throw err;
    }

    const data = appSnap.data() || {};
    if (data.status === 'approved') {
        const err = new Error('already_approved');
        err.code = 'already_approved';
        throw err;
    }

    await appRef.set(
        {
            status: 'rejected',
            reviewedVia: 'email_link',
            reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return {
        ok: true,
        action: 'reject',
        email: normalizedEmail,
        authorName: data.name || null,
    };
}

function normalizeProfileUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.length > 200) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w.-]+\.[\w.-]+/i.test(s)) return `https://${s}`;
    return '';
}

function normalizeStatusEmoji(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    // One visible emoji / short cluster (avoid long strings).
    const chars = Array.from(s);
    if (chars.length > 8) return '';
    return chars.join('');
}

function normalizeCaptureUrl(raw) {
    const s = String(raw || '').trim();
    if (!s || s.length > 500) return '';
    const withProto = /^https?:\/\//i.test(s) ? s : /^[\w.-]+\.[\w.-]+/i.test(s) ? `https://${s}` : '';
    if (!withProto) return '';
    let u;
    try {
        u = new URL(withProto);
    } catch (_) {
        return '';
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (!u.hostname) return '';
    return u.toString().slice(0, 500);
}

function sanitizeAuthorProfileInput(body = {}) {
    const bio = String(body.bio || '')
        .trim()
        .slice(0, 600);
    const location = String(body.location || '')
        .trim()
        .slice(0, 80);
    const website = normalizeProfileUrl(body.website);
    const statusEmoji = normalizeStatusEmoji(body.statusEmoji);
    const socialLinks = Array.isArray(body.socialLinks)
        ? body.socialLinks
              .slice(0, 4)
              .map((u) => normalizeProfileUrl(u))
              .filter(Boolean)
        : [];
    const captureUrl = normalizeCaptureUrl(body.captureUrl);
    const avatar = normalizeAvatarPath(body.avatar);
    const out = {
        bio,
        location,
        website,
        socialLinks,
        captureUrl,
        statusEmoji,
    };
    if (avatar) out.avatar = avatar;
    return out;
}

function authorProfileDocId(authorName) {
    const strict = normalizeAuthorName(authorName);
    if (strict) return strict;
    // Legacy blog handles may include characters signup no longer allows (e.g. dots).
    return String(authorName || '')
        .trim()
        .replace(/^@+/, '')
        .toLowerCase()
        .slice(0, 48);
}

async function getAuthorProfile(authorName) {
    const handle = authorProfileDocId(authorName);
    if (!handle) return null;
    const adminApp = getAdmin();
    const snap = await adminApp.firestore().collection('authorProfiles').doc(handle).get();
    const data = snap.exists ? snap.data() || {} : {};
    let avatar = normalizeAvatarPath(data.avatar);
    if (!avatar) {
        try {
            const usersSnap = await adminApp
                .firestore()
                .collection('users')
                .where('authorName', '==', handle)
                .limit(1)
                .get();
            if (!usersSnap.empty) {
                avatar = normalizeAvatarPath(usersSnap.docs[0].data().avatar);
            }
        } catch (_) {
            /* ignore lookup failures — profile still returns without avatar */
        }
    }
    return {
        authorName: handle,
        ...data,
        ...(avatar ? { avatar } : {}),
    };
}

async function updateAuthorProfileForUser({ uid, authorName, profile }) {
    const handle = normalizeAuthorName(authorName);
    if (!handle) {
        const err = new Error('invalid_author_name');
        err.code = 'invalid_author_name';
        throw err;
    }
    if (!uid) {
        const err = new Error('unauthorized');
        err.code = 'unauthorized';
        throw err;
    }

    const clean = sanitizeAuthorProfileInput(profile || {});
    const adminApp = getAdmin();
    const payload = {
        ...clean,
        authorName: handle,
        uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await adminApp.firestore().collection('authorProfiles').doc(handle).set(payload, { merge: true });
    const userUpdate = {
        authorName: handle,
        profile: clean,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (clean.avatar) userUpdate.avatar = clean.avatar;
    await adminApp.firestore().collection('users').doc(uid).set(userUpdate, { merge: true });

    return { authorName: handle, ...clean };
}

module.exports = {
    getAdmin,
    normalizeAuthorName,
    normalizeEmail,
    completeUserSignup,
    submitAuthorApplication,
    approveAuthorApplication,
    rejectAuthorApplication,
    requestPasswordResetEmail,
    getAuthorProfile,
    updateAuthorProfileForUser,
    sanitizeAuthorProfileInput,
};
