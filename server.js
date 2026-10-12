require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const fileupload = require('express-fileupload');
const {
    getAdmin,
    completeUserSignup,
    submitAuthorApplication,
    approveAuthorApplication,
    rejectAuthorApplication,
    normalizeAuthorName,
    requestPasswordResetEmail,
    getAuthorProfile,
    updateAuthorProfileForUser,
} = require('./lib/firebase-admin');
const {
    sendAuthorApplicationNotification,
    isMailConfigured,
    getNotifyRecipients,
    getMailMode,
} = require('./lib/notify-admin');
const {
    verifyAuthorApplicationActionToken,
    isApproveSecretConfigured,
    getPublicSiteUrl,
} = require('./lib/admin-action-token');

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
app.use(express.urlencoded({ extended: false }));
app.use(express.static(initial_path));
app.use(fileupload());

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function wantsJson(req) {
    const accept = String(req.get('accept') || '');
    return accept.includes('application/json') || String(req.get('x-requested-with') || '') === 'fetch';
}

/**
 * Admin approve/reject UI — matches home stone texture.
 * mode: confirm | result | error
 * Confirm auto-POSTs via JS (mail scanners prefetch GET without JS).
 */
function renderAdminActionPage({
    title,
    statusCode = 200,
    mode = 'result',
    action = null,
    email = '',
    handle = '',
    token = '',
    message = '',
    detailHtml = '',
    redirectHomeMs = 0,
}) {
    const isReject = action === 'reject';
    const brand = 'GOOD PEOPLE';
    const displayHandle = handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '';
    const primaryLabel = isReject ? 'Reject writer' : 'Approve writer';
    const workingLabel = isReject ? 'Rejecting…' : 'Approving…';
    const eyebrow =
        mode === 'confirm'
            ? workingLabel
            : mode === 'error'
              ? 'Something went wrong'
              : isReject
                ? 'Rejected'
                : 'Approved';

    const mainBlock =
        mode === 'confirm'
            ? `
        ${email ? `<p class="email">${escapeHtml(email)}</p>` : ''}
        <p class="lead">${escapeHtml(workingLabel)}</p>
        <form id="admin-action-form" method="POST" action="/api/admin/author-application">
          <input type="hidden" name="token" value="${escapeHtml(token)}" />
          <noscript>
            <button type="submit" class="btn ${isReject ? 'btn-reject' : 'btn-approve'}">${escapeHtml(primaryLabel)}</button>
          </noscript>
        </form>
        <p class="hint">Returning you to the site…</p>
      `
            : `
        ${displayHandle ? `<p class="handle">${escapeHtml(displayHandle)}</p>` : ''}
        ${email ? `<p class="email">${escapeHtml(email)}</p>` : ''}
        ${message ? `<p class="lead">${escapeHtml(message)}</p>` : ''}
        ${detailHtml || ''}
        <p class="hint">${
            redirectHomeMs > 0
                ? 'Taking you back to the site…'
                : '<a class="home" href="/">Back to site</a>'
        }</p>
      `;

    const script =
        mode === 'confirm'
            ? `<script>
(function () {
  var form = document.getElementById('admin-action-form');
  if (!form) return;

  function run() {
    fetch(form.action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Requested-With': 'fetch' },
      body: new FormData(form),
      credentials: 'same-origin'
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, data: data || {} };
      }).catch(function () {
        return { ok: res.ok, data: {} };
      });
    }).then(function (result) {
      var data = result.data || {};
      if (result.ok && data.redirect) {
        window.location.replace(data.redirect);
        return;
      }
      if (result.ok) {
        var body = '';
        if (data.handle) body += '<p class="handle">' + String(data.handle).replace(/</g, '&lt;') + '</p>';
        if (data.email) body += '<p class="email">' + String(data.email).replace(/</g, '&lt;') + '</p>';
        body += '<p class="lead">' + String(data.message || 'Done.').replace(/</g, '&lt;') + '</p>';
        if (data.setPasswordUrl) {
          var url = String(data.setPasswordUrl).replace(/"/g, '&quot;').replace(/</g, '&lt;');
          body += '<p class="meta-link"><a href="' + url + '">' + url + '</a></p>';
        }
        body += '<p class="hint"><a class="home" href="/">Back to site</a></p>';
        document.querySelector('.panel-body').innerHTML = body;
        document.querySelector('.eyebrow').textContent = data.action === 'reject' ? 'Rejected' : 'Approved';
        document.title = data.action === 'reject' ? 'Application rejected' : 'Writer approved';
        return;
      }
      var msg = data.message || 'Could not complete this action.';
      document.querySelector('.panel-body').innerHTML =
        '<p class="lead">' + msg.replace(/</g, '&lt;') + '</p>' +
        '<p class="hint"><a class="home" href="/">Back to site</a></p>';
      document.querySelector('.eyebrow').textContent = 'Something went wrong';
      document.title = 'Action failed';
    }).catch(function () {
      form.submit();
    });
  }

  run();
})();
</script>`
            : redirectHomeMs > 0
              ? `<script>setTimeout(function(){ window.location.replace('/'); }, ${Number(redirectHomeMs) || 1800});</script>`
              : '';

    return {
        statusCode,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #1a1a1a;
      --paper: rgba(255,255,255,0.92);
      --muted: rgba(26,26,26,0.62);
      --line: rgba(26,26,26,0.14);
      --approve: #1a1a1a;
      --reject: #8b1e1e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      font-family: Poppins, Helvetica, Arial, sans-serif;
      color: var(--ink);
      background-color: #8c8c8c;
      background-image: url(https://textures.neocities.org/textures/stone-and-brick/GRYCON7.JPG);
      background-size: auto;
    }
    .shell {
      width: min(420px, 100%);
      animation: rise 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .brand {
      font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
      font-size: clamp(28px, 8vw, 40px);
      letter-spacing: 0.02em;
      line-height: 0.95;
      margin: 0 0 14px;
      text-shadow: 0 1px 0 rgba(255,255,255,0.35);
    }
    .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      box-shadow: 0 18px 50px rgba(0,0,0,0.18);
      padding: 22px 20px 18px;
    }
    .eyebrow {
      margin: 0 0 10px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .lead { margin: 0 0 8px; font-size: 15px; line-height: 1.45; }
    .handle {
      margin: 0 0 4px;
      font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif;
      font-size: 28px;
      letter-spacing: 0.01em;
      line-height: 1;
    }
    .email { margin: 0 0 16px; font-size: 13px; color: var(--muted); word-break: break-all; }
    .hint { margin: 16px 0 0; font-size: 12px; color: var(--muted); }
    form { margin: 18px 0 0; }
    .btn {
      appearance: none;
      width: 100%;
      border: 1px solid transparent;
      padding: 12px 14px;
      font: 600 14px/1 Poppins, Helvetica, Arial, sans-serif;
      cursor: pointer;
      transition: transform 120ms ease, opacity 120ms ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn:disabled { opacity: 0.55; cursor: wait; transform: none; }
    .btn-approve { background: var(--approve); color: #fff; }
    .btn-reject { background: #fff; color: var(--reject); border-color: rgba(139,30,30,0.45); }
    a.home { color: inherit; }
    .meta-link { word-break: break-all; font-size: 12px; margin: 8px 0 0; }
    .meta-link a { color: var(--ink); }
  </style>
</head>
<body>
  <div class="shell">
    <p class="brand">${escapeHtml(brand)}</p>
    <div class="panel">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <div class="panel-body">
        ${mainBlock}
      </div>
    </div>
  </div>
  ${script}
</body>
</html>`,
    };
}

function sendAdminActionPage(res, page) {
    res.status(page.statusCode).type('html').send(page.html);
}

function buildApproveResultPayload(result) {
    let message;
    if (result.acceptanceEmailSent && result.authUserCreated && result.setPasswordUrl) {
        message = 'Approved. Acceptance email sent (includes set-password link for legacy apply).';
    } else if (result.acceptanceEmailSent) {
        message = 'Approved. Acceptance email sent — they can sign in with their apply password.';
    } else if (result.authUserCreated && result.setPasswordUrl) {
        message = 'Approved, but acceptance email did not send. Share this set-password link:';
    } else if (result.claimsUpdated) {
        message = 'Approved, but acceptance email did not send. They can still sign in with their apply password.';
    } else {
        message = 'Allowlist updated.';
    }

    const detailHtml =
        result.authUserCreated && result.setPasswordUrl && !result.acceptanceEmailSent
            ? `<p class="meta-link"><a href="${escapeHtml(result.setPasswordUrl)}">${escapeHtml(result.setPasswordUrl)}</a></p>`
            : '';

    return {
        message,
        detailHtml,
        handle: result.authorName ? `@${result.authorName}` : '',
        email: result.email,
        redirect:
            result.authUserCreated && result.setPasswordUrl && !result.acceptanceEmailSent
                ? null
                : '/?admin=approved',
    };
}

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

/** Public author profile (bio panel). */
app.get('/api/author-profile/:name', async (req, res) => {
    try {
        const profile = await getAuthorProfile(req.params.name);
        if (!profile) {
            return res.status(404).json({ error: 'not_found' });
        }
        return res.json({ ok: true, profile });
    } catch (err) {
        if (err.message && err.message.includes('Firebase Admin is not configured')) {
            return res.status(503).json({ error: 'admin_not_configured' });
        }
        console.error('author-profile get', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/** Update own author profile (GitHub-style bio fields). */
app.post('/api/author-profile', async (req, res) => {
    try {
        const { idToken, profile } = req.body || {};
        if (!idToken) {
            return res.status(401).json({ error: 'unauthorized' });
        }
        const decoded = await getAdmin().auth().verifyIdToken(idToken);
        let handle = normalizeAuthorName(decoded.authorName || '');
        if (!handle) {
            const userSnap = await getAdmin().firestore().collection('users').doc(decoded.uid).get();
            handle = normalizeAuthorName((userSnap.data() || {}).authorName || '');
        }
        const role = decoded.role || decoded.accountRole || '';
        const isAuthor =
            role === 'real person' ||
            decoded.accountRole === 'author' ||
            Boolean(handle);
        if (!isAuthor || !handle) {
            return res.status(403).json({ error: 'forbidden' });
        }
        const saved = await updateAuthorProfileForUser({
            uid: decoded.uid,
            authorName: handle,
            profile: profile || {},
        });
        return res.json({ ok: true, profile: saved });
    } catch (err) {
        if (err.code === 'invalid_author_name') {
            return res.status(400).json({ error: 'invalid_author_name' });
        }
        if (err.message && err.message.includes('Firebase Admin is not configured')) {
            return res.status(503).json({ error: 'admin_not_configured' });
        }
        console.error('author-profile save', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

app.post('/api/auth/password-reset', async (req, res) => {
    try {
        const email = String((req.body && req.body.email) || '').trim();
        const result = await requestPasswordResetEmail(email);
        // Same response whether or not the account exists.
        return res.json({ ok: true, sent: Boolean(result.sent) });
    } catch (err) {
        if (err.code === 'invalid_email') {
            return res.status(400).json({ error: 'invalid_email' });
        }
        if (err.message && err.message.includes('Firebase Admin is not configured')) {
            return res.status(503).json({ error: 'admin_not_configured' });
        }
        console.error('password-reset', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

app.post('/api/auth/author-application', async (req, res) => {
    try {
        const { name, email, message, idToken, avatar } = req.body || {};
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
            avatar,
        });

        if (result.alreadyApproved) {
            console.log(`[mail] No email — ${resolvedEmail} is already on authorAllowlist`);
        } else if (result.ok) {
            // Respond before SMTP — a slow/blocked mail connection must not hang the form.
            sendAuthorApplicationNotification({
                name: resolvedName,
                email: resolvedEmail,
                message,
                avatar,
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
        if (err.code === 'invalid_avatar') {
            return res.status(400).json({ error: 'invalid_avatar' });
        }
        if (err.message && err.message.includes('Firebase Admin is not configured')) {
            return res.status(503).json({ error: 'admin_not_configured' });
        }
        console.error('author-application', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/** Email approve/reject: bounce to home; home runs the action (JS) with full-screen status. */
app.get('/api/admin/author-application', async (req, res) => {
    try {
        const token = String(req.query.token || '');
        const verified = verifyAuthorApplicationActionToken(token);
        const admin = verified.action === 'approve' ? 'approve' : 'reject';

        let handle = '';
        try {
            const snap = await getAdmin()
                .firestore()
                .collection('authorApplications')
                .doc(String(verified.email || '').trim().toLowerCase())
                .get();
            if (snap.exists) {
                const data = snap.data() || {};
                handle = normalizeAuthorName(data.name) || normalizeAuthorName(data.authorName) || '';
            }
        } catch (_) {}

        const params = new URLSearchParams({
            admin,
            token,
        });
        if (handle) params.set('handle', handle);
        return res.redirect(303, `/?${params.toString()}`);
    } catch (err) {
        const reason =
            err.code === 'token_expired'
                ? 'expired'
                : err.code === 'approve_secret_missing'
                  ? 'config'
                  : 'invalid';
        return res.redirect(303, `/?admin=error&reason=${encodeURIComponent(reason)}`);
    }
});

app.post('/api/admin/author-application', async (req, res) => {
    try {
        const token = String((req.body && req.body.token) || req.query.token || '');
        const verified = verifyAuthorApplicationActionToken(token);
        const result =
            verified.action === 'approve'
                ? await approveAuthorApplication(verified.email)
                : await rejectAuthorApplication(verified.email);

        if (verified.action === 'approve') {
            const payload = buildApproveResultPayload(result);
            if (wantsJson(req)) {
                return res.json({
                    ok: true,
                    action: 'approve',
                    message: payload.message,
                    redirect: payload.redirect,
                    email: payload.email,
                    handle: payload.handle,
                    setPasswordUrl:
                        result.authUserCreated && result.setPasswordUrl && !result.welcomeEmailSent
                            ? result.setPasswordUrl
                            : null,
                });
            }
            // Prefer bouncing straight home; only stay if admin must copy a password link.
            if (payload.redirect) {
                return res.redirect(303, payload.redirect);
            }
            const page = renderAdminActionPage({
                title: 'Writer approved',
                mode: 'result',
                action: 'approve',
                email: payload.email,
                handle: payload.handle,
                message: payload.message,
                detailHtml: payload.detailHtml,
            });
            return sendAdminActionPage(res, page);
        }

        if (wantsJson(req)) {
            return res.json({
                ok: true,
                action: 'reject',
                message: 'Application rejected.',
                redirect: '/?admin=rejected',
                email: result.email,
                handle: result.authorName ? `@${result.authorName}` : '',
            });
        }
        return res.redirect(303, '/?admin=rejected');
    } catch (err) {
        let message = 'Could not complete this action.';
        let statusCode = 400;
        if (err.code === 'token_expired') {
            message = 'This link has expired.';
        } else if (err.code === 'invalid_token') {
            message = 'This link is invalid.';
        } else if (err.code === 'application_not_found') {
            message = 'No application found for that email.';
        } else if (err.code === 'already_approved') {
            message = 'This writer was already approved — reject is blocked.';
        } else if (err.message && err.message.includes('Firebase Admin is not configured')) {
            message = 'Firebase Admin is not configured on the server.';
            statusCode = 503;
        } else {
            console.error('admin author-application', err);
            statusCode = 500;
        }
        if (wantsJson(req)) {
            return res.status(statusCode).json({ ok: false, message });
        }
        const page = renderAdminActionPage({
            title: 'Action failed',
            statusCode,
            mode: 'error',
            message,
        });
        return sendAdminActionPage(res, page);
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

app.get('/reset', (req, res) => {
    res.sendFile(path.join(initial_path, 'reset.html'));
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
    if (isApproveSecretConfigured()) {
        console.log(`[mail] Email approve/reject links ON → ${getPublicSiteUrl()}`);
    } else {
        console.warn(
            '[mail] Email approve/reject links OFF — set ADMIN_APPROVE_SECRET (16+ chars) and PUBLIC_SITE_URL.'
        );
    }
});
