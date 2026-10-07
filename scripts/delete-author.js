#!/usr/bin/env node
/**
 * Safely remove a test author for re-application.
 * Deletes: Auth user, users/{uid}, authorAllowlist, authorApplications.
 * Does NOT delete blogs (reports count only).
 *
 * Usage:
 *   node scripts/delete-author.js tbrez001@campus.goldsmiths.ac.uk
 *   node scripts/delete-author.js tbrez001@campus.goldsmiths.ac.uk --yes
 */
require('dotenv').config();

const {
    getAdmin,
    normalizeEmail,
} = require('../lib/firebase-admin');

async function main() {
    const args = process.argv.slice(2).filter((a) => a !== '--yes');
    const autoYes = process.argv.includes('--yes');
    const email = normalizeEmail(args[0]);

    if (!email) {
        console.error('Usage: node scripts/delete-author.js <email> [--yes]');
        process.exit(1);
    }

    const adminApp = getAdmin();
    const auth = adminApp.auth();
    const db = adminApp.firestore();

    let userRecord = null;
    try {
        userRecord = await auth.getUserByEmail(email);
    } catch (err) {
        if (err.code !== 'auth/user-not-found') throw err;
    }

    const uid = userRecord ? userRecord.uid : null;
    const [allowSnap, appSnap] = await Promise.all([
        db.collection('authorAllowlist').doc(email).get(),
        db.collection('authorApplications').doc(email).get(),
    ]);

    let blogCount = 0;
    if (uid) {
        const blogs = await db.collection('blogs').where('author', '==', uid).limit(20).get();
        blogCount = blogs.size;
        // Some posts store author as @handle / display name — best-effort check only.
    }
    if (userRecord) {
        const handle =
            (userRecord.customClaims && userRecord.customClaims.authorName) ||
            userRecord.displayName ||
            '';
        if (handle) {
            const byName = await db.collection('blogs').where('author', '==', handle).limit(20).get();
            blogCount = Math.max(blogCount, byName.size);
            if (handle.startsWith('@') === false) {
                const byAt = await db.collection('blogs').where('author', '==', `@${handle}`).limit(20).get();
                blogCount = Math.max(blogCount, byAt.size);
            }
        }
    }

    console.log('Will remove:');
    console.log(`  email:              ${email}`);
    console.log(`  Auth user:          ${uid || '(none)'}`);
    console.log(`  users/{uid}:        ${uid ? `users/${uid}` : '(skip)'}`);
    console.log(`  authorAllowlist:    ${allowSnap.exists ? 'yes' : 'no'}`);
    console.log(`  authorApplications: ${appSnap.exists ? 'yes' : 'no'}`);
    console.log(`  blogs (left alone): ~${blogCount} matching (not deleted)`);

    if (!uid && !allowSnap.exists && !appSnap.exists) {
        console.log('Nothing to delete.');
        return;
    }

    if (!autoYes) {
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve) => {
            rl.question('Type DELETE to confirm: ', resolve);
        });
        rl.close();
        if (String(answer || '').trim() !== 'DELETE') {
            console.log('Aborted.');
            process.exit(0);
        }
    }

    const batch = db.batch();
    if (allowSnap.exists) batch.delete(allowSnap.ref);
    if (appSnap.exists) batch.delete(appSnap.ref);
    if (uid) batch.delete(db.collection('users').doc(uid));
    await batch.commit();

    if (uid) {
        await auth.deleteUser(uid);
        console.log(`Deleted Auth user ${uid}`);
    }

    console.log('Done. You can re-apply with this email.');
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
