/**
 * Sign-up and author application forms (site UI). Author access is admin-approved via allowlist.
 */
(function () {
    const NAME_RE = /^[a-z0-9_]{3,24}$/;

    const LOGIN_VIEW_IDS = {
        signin: 'home-login-signin-block',
        signup: 'home-signup-view',
        authorApply: 'home-author-apply-view',
    };

    const VIEW_ARIA_LABELS = {
        signin: 'Sign in',
        signup: 'Create account',
        authorApply: 'Author application',
    };

    function normalizeNameInput(raw) {
        return String(raw || '')
            .trim()
            .replace(/^@+/, '')
            .replace(/\s+/g, '_')
            .toLowerCase();
    }

    function showLoginView(viewKey) {
        Object.keys(LOGIN_VIEW_IDS).forEach((key) => {
            const el = document.getElementById(LOGIN_VIEW_IDS[key]);
            if (el) el.hidden = key !== viewKey;
        });

        const panel = document.querySelector('.home-login-panel');
        if (panel) panel.setAttribute('aria-label', VIEW_ARIA_LABELS[viewKey] || 'Sign in');

        const overlay = document.getElementById('home-login-overlay');
        if (viewKey === 'signin' && overlay && !overlay.hidden && typeof startHomeLoginUi === 'function') {
            startHomeLoginUi();
        }
    }

    function showHomeSignInView() {
        showLoginView('signin');
    }

    function showHomeSignupView() {
        showLoginView('signup');
        const err = document.getElementById('home-signup-error');
        if (err) {
            err.hidden = true;
            err.textContent = '';
        }
        const form = document.getElementById('home-signup-form');
        if (form) form.reset();
        document.getElementById('home-signup-name')?.focus();
    }

    function prefillAuthorApplyForm() {
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        const nameInput = document.getElementById('home-apply-name');
        const emailInput = document.getElementById('home-apply-email');

        if (user) {
            if (emailInput) {
                emailInput.value = user.email || '';
                emailInput.readOnly = !!user.email;
            }
            if (nameInput && typeof getAuthorIdFromUser === 'function') {
                const current = getAuthorIdFromUser(user);
                if (current && current !== 'Anonymous' && !current.startsWith('user_')) {
                    nameInput.value = current;
                }
            }
        } else if (emailInput) {
            emailInput.readOnly = false;
        }
    }

    function showHomeAuthorApplyView() {
        showLoginView('authorApply');

        const err = document.getElementById('home-apply-error');
        const ok = document.getElementById('home-apply-success');
        const form = document.getElementById('home-author-apply-form');
        const submit = document.getElementById('home-apply-submit');

        if (err) {
            err.hidden = true;
            err.textContent = '';
        }
        if (ok) {
            ok.hidden = true;
            ok.textContent = '';
        }
        if (form) {
            form.hidden = false;
            form.reset();
        }
        if (submit) {
            submit.hidden = false;
            submit.disabled = false;
            submit.textContent = 'Submit application';
        }

        prefillAuthorApplyForm();
        document.getElementById('home-apply-name')?.focus();
    }

    function resetHomeLoginViews() {
        showLoginView('signin');
    }

    function setSignupError(message) {
        const err = document.getElementById('home-signup-error');
        if (!err) return;
        err.textContent = message;
        err.hidden = !message;
    }

    function setApplyError(message) {
        const err = document.getElementById('home-apply-error');
        if (!err) return;
        err.textContent = message;
        err.hidden = !message;
    }

    function setApplySuccess(message) {
        const ok = document.getElementById('home-apply-success');
        if (!ok) return;
        ok.textContent = message;
        ok.hidden = !message;
    }

    function setSignupPending(pending) {
        const form = document.getElementById('home-signup-form');
        const submit = document.getElementById('home-signup-submit');
        if (form) form.querySelectorAll('input, button').forEach((el) => { el.disabled = pending; });
        if (submit) submit.textContent = pending ? 'Creating…' : 'Create account';
    }

    function setApplyPending(pending) {
        const form = document.getElementById('home-author-apply-form');
        const submit = document.getElementById('home-apply-submit');
        if (form) form.querySelectorAll('input, button, textarea').forEach((el) => { el.disabled = pending; });
        if (submit) submit.textContent = pending ? 'Submitting…' : 'Submit application';
    }

    async function completeSignupOnServer(user, authorName) {
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/complete-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, authorName }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || 'signup_failed');
            err.code = data.error;
            throw err;
        }
        await user.getIdToken(true);
        return data;
    }

    async function submitAuthorApplicationOnServer({ name, email, message }) {
        const body = { name, email, message };
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        if (user) body.idToken = await user.getIdToken();

        const res = await fetch('/api/auth/author-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || 'application_failed');
            err.code = data.error;
            throw err;
        }
        return data;
    }

    async function handleHomeSignupSubmit(e) {
        e.preventDefault();
        setSignupError('');

        const authorName = normalizeNameInput(document.getElementById('home-signup-name')?.value);
        const email = String(document.getElementById('home-signup-email')?.value || '').trim();
        const password = String(document.getElementById('home-signup-password')?.value || '');

        if (!NAME_RE.test(authorName)) {
            setSignupError('Name: 3–24 characters, letters, numbers, and underscores only.');
            return;
        }
        if (!email) {
            setSignupError('Enter your email.');
            return;
        }
        if (password.length < 6) {
            setSignupError('Password must be at least 6 characters.');
            return;
        }

        setSignupPending(true);
        let createdUser = null;
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            createdUser = cred.user;
            await createdUser.updateProfile({ displayName: authorName });
            if (typeof cacheAuthorIdForUser === 'function') {
                cacheAuthorIdForUser(createdUser.uid, authorName);
            }

            await completeSignupOnServer(createdUser, authorName);

            if (typeof closeHomeLoginOverlay === 'function') closeHomeLoginOverlay();
            if (typeof syncAuthControls === 'function') syncAuthControls(createdUser);
            if (typeof applyHomeEntryAfterSignIn === 'function') applyHomeEntryAfterSignIn();
        } catch (err) {
            if (createdUser) {
                try {
                    await createdUser.delete();
                } catch (deleteErr) {}
            }

            if (err.code === 'auth/email-already-in-use') {
                setSignupError('That email already has an account. Sign in instead.');
            } else if (err.code === 'invalid_author_name') {
                setSignupError('Name: 3–24 characters, letters, numbers, and underscores only.');
            } else if (err.code === 'admin_not_configured') {
                setSignupError('Sign-up is not fully configured on the server. Contact the site admin.');
            } else if (err.code === 'auth/weak-password') {
                setSignupError('Password is too weak. Use at least 6 characters.');
            } else if (err.code === 'auth/invalid-email') {
                setSignupError('Enter a valid email address.');
            } else {
                setSignupError('Could not create account. Try again.');
                console.error(err);
            }
        } finally {
            setSignupPending(false);
        }
    }

    async function handleAuthorApplySubmit(e) {
        e.preventDefault();
        setApplyError('');
        setApplySuccess('');

        const name = normalizeNameInput(document.getElementById('home-apply-name')?.value);
        const email = String(document.getElementById('home-apply-email')?.value || '').trim();
        const message = String(document.getElementById('home-apply-message')?.value || '').trim();

        if (!NAME_RE.test(name)) {
            setApplyError('Name: 3–24 characters, letters, numbers, and underscores only.');
            return;
        }
        if (!email) {
            setApplyError('Enter your email.');
            return;
        }
        if (message.length < 20) {
            setApplyError('Please write at least a few sentences (20+ characters).');
            return;
        }

        setApplyPending(true);
        try {
            const result = await submitAuthorApplicationOnServer({ name, email, message });

            const form = document.getElementById('home-author-apply-form');
            const submit = document.getElementById('home-apply-submit');
            if (form) form.hidden = true;
            if (submit) submit.hidden = true;

            if (result.alreadyApproved) {
                setApplySuccess(
                    'This email is already on the approved authors list. Sign out and sign back in to refresh your access.'
                );
            } else if (result.duplicate) {
                setApplySuccess(
                    'We already have a pending application for this email. The admin will be in touch.'
                );
            } else {
                setApplySuccess(
                    'Application received. If approved, your email will be added to the allowed list — then sign in again to open the editor.'
                );
            }
        } catch (err) {
            if (err.code === 'admin_not_configured') {
                setApplyError('Applications are not configured on the server yet. Contact the site admin.');
            } else if (err.code === 'invalid_name') {
                setApplyError('Name: 3–24 characters, letters, numbers, and underscores only.');
            } else {
                setApplyError('Could not submit application. Try again.');
                console.error(err);
            }
        } finally {
            setApplyPending(false);
        }
    }

    function initHomeSignupForm() {
        document.getElementById('home-login-create-account')?.addEventListener('click', (e) => {
            e.preventDefault();
            showHomeSignupView();
        });
        document.getElementById('home-signup-back')?.addEventListener('click', (e) => {
            e.preventDefault();
            showHomeSignInView();
        });
        document.getElementById('home-signup-form')?.addEventListener('submit', handleHomeSignupSubmit);

        document.getElementById('home-login-apply-author')?.addEventListener('click', (e) => {
            e.preventDefault();
            showHomeAuthorApplyView();
        });
        document.getElementById('home-signup-apply-author')?.addEventListener('click', (e) => {
            e.preventDefault();
            showHomeAuthorApplyView();
        });
        document.getElementById('home-apply-back')?.addEventListener('click', (e) => {
            e.preventDefault();
            showHomeSignInView();
        });
        document.getElementById('home-author-apply-form')?.addEventListener('submit', handleAuthorApplySubmit);
    }

    window.showHomeSignInView = showHomeSignInView;
    window.showHomeSignupView = showHomeSignupView;
    window.showHomeAuthorApplyView = showHomeAuthorApplyView;
    window.resetHomeLoginViews = resetHomeLoginViews;
    window.initHomeSignupForm = initHomeSignupForm;
    window.normalizeNameInput = normalizeNameInput;
})();
