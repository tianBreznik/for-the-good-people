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

async function submitAuthorApplication({ name, email, message, uid }) {
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
            status: 'pending',
            uid: uid || null,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return { ok: true };
}

module.exports = {
    getAdmin,
    normalizeAuthorName,
    completeUserSignup,
    submitAuthorApplication,
};
