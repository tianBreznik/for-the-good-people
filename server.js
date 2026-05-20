require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const fileupload = require('express-fileupload');
const { getAdmin, completeUserSignup, submitAuthorApplication } = require('./lib/firebase-admin');
const {
    sendAuthorApplicationNotification,
    isMailConfigured,
    getNotifyRecipients,
    getMailMode,
} = require('./lib/notify-admin');

let initial_path = path.join(__dirname, 'public');
const uploadsDir = path.join(initial_path, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
app.use(express.json());
app.use(express.static(initial_path));
app.use(fileupload());

app.post('/api/auth/complete-signup', async (req, res) => {
    try {
        const { idToken, authorName } = req.body || {};
        if (!idToken || !authorName) {
            return res.status(400).json({ error: 'missing_fields' });
        }

        const decoded = await getAdmin().auth().verifyIdToken(idToken);
        const email = decoded.email;
        if (!email) {
            return res.status(400).json({ error: 'email_required' });
        }

        const result = await completeUserSignup({
            uid: decoded.uid,
            email,
            authorName,
        });

        return res.json({ ok: true, ...result });
    } catch (err) {
        if (err.code === 'invalid_author_name') {
            return res.status(400).json({ error: 'invalid_author_name' });
        }
        if (err.message && err.message.includes('Firebase Admin is not configured')) {
            return res.status(503).json({ error: 'admin_not_configured' });
        }
        console.error('complete-signup', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

app.post('/api/auth/author-application', async (req, res) => {
    try {
        const { name, email, message, idToken } = req.body || {};
        let uid = null;
        let resolvedEmail = email;
        let resolvedName = name;

        if (idToken) {
            const decoded = await getAdmin().auth().verifyIdToken(idToken);
            uid = decoded.uid;
            resolvedEmail = decoded.email || resolvedEmail;
            resolvedName = resolvedName || decoded.name || '';
        }

        const result = await submitAuthorApplication({
            name: resolvedName,
            email: resolvedEmail,
            message,
            uid,
        });

        if (result.alreadyApproved) {
            console.log(`[mail] No email — ${resolvedEmail} is already on authorAllowlist`);
        } else if (result.ok) {
            // Respond before SMTP — a slow/blocked mail connection must not hang the form.
            sendAuthorApplicationNotification({
                name: resolvedName,
                email: resolvedEmail,
                message,
                duplicate: Boolean(result.duplicate),
            }).catch((mailErr) => {
                console.error('author-application email failed', mailErr);
            });
            if (result.duplicate) {
                console.log(`[mail] Resending notification for duplicate pending application: ${resolvedEmail}`);
            }
        }

        return res.json({ ok: true, ...result });
    } catch (err) {
        if (err.code === 'missing_fields') {
            return res.status(400).json({ error: 'missing_fields' });
        }
        if (err.code === 'message_too_short') {
            return res.status(400).json({ error: 'message_too_short' });
        }
        if (err.code === 'invalid_name') {
            return res.status(400).json({ error: 'invalid_name' });
        }
        if (err.message && err.message.includes('Firebase Admin is not configured')) {
            return res.status(503).json({ error: 'admin_not_configured' });
        }
        console.error('author-application', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

const faviconSvg = path.join(initial_path, 'favicon.svg');
const faviconPng = path.join(initial_path, 'favicon.png');
const faviconIco = path.join(initial_path, 'favicon.ico');

app.get('/favicon.svg', (req, res) => {
    res.type('image/svg+xml');
    res.sendFile(faviconSvg);
});

app.get('/favicon.png', (req, res) => {
    res.type('image/png');
    res.sendFile(faviconPng);
});

app.get('/favicon.ico', (req, res) => {
    res.type('image/x-icon');
    res.sendFile(faviconIco);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(initial_path, 'home.html'));
});

app.get('/editor', (req, res) => {
    res.sendFile(path.join(initial_path, 'editor.html'));
});

app.post('/upload', (req, res) => {
    let file = req.files.image;
    let date = new Date();
    let imagename = date.getDate() + date.getTime() + file.name;
    let uploadPath = 'public/uploads/' + imagename;

    file.mv(uploadPath, (err, result) => {
        if (err) {
            throw err;
        } else {
            res.json(`uploads/${imagename}`);
        }
    });
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(initial_path, 'dashboard.html'));
});

app.get('/:blog', (req, res) => {
    res.sendFile(path.join(initial_path, 'blog.html'));
});

app.get('/:blog/editor', (req, res) => {
    res.sendFile(path.join(initial_path, 'editor.html'));
});

app.use((req, res) => {
    res.json('404');
});

const PORT = Number(process.env.PORT) || 3008;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`listening on http://${HOST}:${PORT} (reachable from other devices on your LAN)`);
    const mailMode = getMailMode();
    if (isMailConfigured()) {
        console.log(
            `[mail] Author application notifications (${mailMode}) → ${getNotifyRecipients().join(', ')}`
        );
    } else {
        console.warn(
            '[mail] Author application emails OFF — production needs RESEND_API_KEY (Railway blocks SMTP). See RAILWAY.md.'
        );
    }
});
