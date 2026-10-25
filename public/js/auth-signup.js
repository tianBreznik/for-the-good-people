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

    let avatarMenuOutsideHandler = null;

    function avatarFiles() {
        return Array.isArray(window.AUTHOR_AVATAR_FILES) ? window.AUTHOR_AVATAR_FILES : [];
    }

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
        closeAvatarMenu();
        showLoginView('signin');
        const err = document.getElementById('home-signin-error');
        if (err) {
            err.hidden = true;
            err.textContent = '';
        }
        const ok = document.getElementById('home-signin-success');
        if (ok) {
            ok.hidden = true;
            ok.textContent = '';
        }
        document.getElementById('home-signin-email')?.focus();
    }

    function setSigninError(message) {
        const err = document.getElementById('home-signin-error');
        const ok = document.getElementById('home-signin-success');
        if (ok && message) {
            ok.hidden = true;
            ok.textContent = '';
        }
        if (!err) return;
        err.textContent = message;
        err.hidden = !message;
    }

    function setSigninSuccess(message) {
        const ok = document.getElementById('home-signin-success');
        const err = document.getElementById('home-signin-error');
        if (err && message) {
            err.hidden = true;
            err.textContent = '';
        }
        if (!ok) return;
        ok.textContent = message;
        ok.hidden = !message;
    }

    function setSigninPending(pending) {
        const form = document.getElementById('home-signin-form');
        const submit = document.getElementById('home-signin-submit');
        const forgot = document.getElementById('home-signin-forgot');
        if (form) form.querySelectorAll('input, button').forEach((el) => { el.disabled = pending; });
        if (submit) submit.textContent = pending ? 'Signing in…' : 'Sign in';
        if (forgot) forgot.disabled = pending;
    }

    const HOME_LOGIN_NEXT_KEY = 'homeLoginNext';

    function consumeHomeLoginNext() {
        try {
            const next = sessionStorage.getItem(HOME_LOGIN_NEXT_KEY) || '';
            sessionStorage.removeItem(HOME_LOGIN_NEXT_KEY);
            if (next === '/editor' || next === '/admin') return next;
        } catch (_) {}
        return '';
    }

    function finishClientSignIn(user) {
        if (user && typeof refreshAuthorIdFromToken === 'function') {
            refreshAuthorIdFromToken(user);
        }
        const next = consumeHomeLoginNext();
        if (typeof closeHomeLoginOverlay === 'function') closeHomeLoginOverlay();
        if (typeof applyHomeEntryAfterSignIn === 'function') applyHomeEntryAfterSignIn();
        if (typeof syncAuthControls === 'function') syncAuthControls(user);
        if (next) {
            window.location.assign(next);
        }
    }

    async function handleHomeSigninSubmit(e) {
        e.preventDefault();
        setSigninError('');
        setSigninSuccess('');

        const email = String(document.getElementById('home-signin-email')?.value || '').trim();
        const password = String(document.getElementById('home-signin-password')?.value || '');

        if (!email) {
            setSigninError('Enter your email.');
            return;
        }
        if (!password) {
            setSigninError('Enter your password.');
            return;
        }

        setSigninPending(true);
        try {
            const cred = await auth.signInWithEmailAndPassword(email, password);
            finishClientSignIn(cred.user);
        } catch (err) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-login-credentials' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setSigninError('Wrong email or password. If you have not registered yet, use Create account.');
            } else if (err.code === 'auth/too-many-requests') {
                setSigninError('Too many attempts. Wait a moment and try again.');
            } else if (err.code === 'auth/invalid-email') {
                setSigninError('Enter a valid email address.');
            } else {
                setSigninError('Could not sign in. Try again.');
                console.error(err);
            }
        } finally {
            setSigninPending(false);
        }
    }

    async function handleHomeForgotPassword(e) {
        e.preventDefault();
        setSigninError('');
        setSigninSuccess('');

        const email = String(document.getElementById('home-signin-email')?.value || '').trim();
        if (!email) {
            setSigninError('Enter your email above, then tap Forgot password.');
            document.getElementById('home-signin-email')?.focus();
            return;
        }

        const forgot = document.getElementById('home-signin-forgot');
        if (forgot) {
            forgot.disabled = true;
            forgot.textContent = 'Sending…';
        }
        try {
            const res = await fetch('/api/auth/password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (data.error === 'invalid_email') {
                    setSigninError('Enter a valid email address.');
                } else if (data.error === 'admin_not_configured') {
                    setSigninError('Password reset is not configured on the server.');
                } else {
                    setSigninError('Could not send reset email. Try again.');
                }
                return;
            }
            setSigninSuccess('Password reset email sent. Check your inbox (and spam).');
        } catch (err) {
            setSigninError('Could not send reset email. Try again.');
            console.error(err);
        } finally {
            if (forgot) {
                forgot.disabled = false;
                forgot.textContent = 'Forgot password?';
            }
        }
    }

    function showHomeSignupView() {
        closeAvatarMenu();
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
        const passwordFields = document.getElementById('home-apply-password-fields');
        const passwordInput = document.getElementById('home-apply-password');
        const passwordConfirm = document.getElementById('home-apply-password-confirm');

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
            if (passwordFields) passwordFields.hidden = true;
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.required = false;
            }
            if (passwordConfirm) {
                passwordConfirm.value = '';
                passwordConfirm.required = false;
            }
        } else {
            if (emailInput) emailInput.readOnly = false;
            if (passwordFields) passwordFields.hidden = false;
            if (passwordInput) passwordInput.required = true;
            if (passwordConfirm) passwordConfirm.required = true;
        }
    }

    async function ensureApplyAuthUser({ email, password, authorName }) {
        const existing = typeof auth !== 'undefined' ? auth.currentUser : null;
        if (existing) {
            const existingEmail = String(existing.email || '').trim().toLowerCase();
            if (existingEmail && existingEmail !== String(email || '').trim().toLowerCase()) {
                const err = new Error('email_mismatch');
                err.code = 'email_mismatch';
                throw err;
            }
            return { user: existing, created: false };
        }

        let createdUser = null;
        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            createdUser = cred.user;
            await createdUser.updateProfile({ displayName: authorName });
            if (typeof cacheAuthorIdForUser === 'function') {
                cacheAuthorIdForUser(createdUser.uid, authorName);
            }
            await completeSignupOnServer(createdUser, authorName);
            return { user: createdUser, created: true };
        } catch (err) {
            if (createdUser) {
                try {
                    await createdUser.delete();
                } catch (_) {}
            }

            if (err.code === 'auth/email-already-in-use') {
                try {
                    const cred = await auth.signInWithEmailAndPassword(email, password);
                    if (typeof cacheAuthorIdForUser === 'function') {
                        cacheAuthorIdForUser(cred.user.uid, authorName);
                    }
                    return { user: cred.user, created: false };
                } catch (signInErr) {
                    if (
                        signInErr.code === 'auth/wrong-password' ||
                        signInErr.code === 'auth/invalid-credential' ||
                        signInErr.code === 'auth/invalid-login-credentials'
                    ) {
                        const mismatch = new Error('account_password_mismatch');
                        mismatch.code = 'account_password_mismatch';
                        throw mismatch;
                    }
                    throw signInErr;
                }
            }
            throw err;
        }
    }

    function normalizeApplyAvatarPath(raw) {
        const path = String(raw || '').trim();
        const preset = path.match(/^\/?pfps\/([A-Za-z0-9_.-]+)$/);
        if (preset) {
            if (!avatarFiles().includes(preset[1])) return '';
            return `/pfps/${preset[1]}`;
        }
        const uploaded = path.match(/^\/?uploads\/([A-Za-z0-9_.-]+)$/);
        if (uploaded) return `/uploads/${uploaded[1]}`;
        return '';
    }

    function getSelectedAvatar() {
        return normalizeApplyAvatarPath(document.getElementById('home-apply-avatar')?.value || '');
    }

    async function uploadApplyAvatarImage(file) {
        if (!file || !String(file.type || '').startsWith('image/')) {
            throw new Error('not_an_image');
        }
        const formData = new FormData();
        formData.append('image', file);
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error((data && data.error) || 'upload_failed');
        }
        const raw = typeof data === 'string' ? data : data.url || data.path || '';
        const path = normalizeApplyAvatarPath(
            String(raw).startsWith('http') || String(raw).startsWith('/') ? raw : `/${raw}`
        );
        if (!path) throw new Error('invalid_avatar');
        return path;
    }

    function ensureApplyAvatarCustomOption(menu, path) {
        const clean = normalizeApplyAvatarPath(path);
        if (!menu || !clean || clean.startsWith('/pfps/')) return;
        let btn = menu.querySelector('.home-apply-avatar-option[data-avatar-custom="1"]');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'home-apply-avatar-option';
            btn.setAttribute('role', 'option');
            btn.dataset.avatarCustom = '1';

            const img = document.createElement('img');
            img.alt = 'Uploaded';
            img.decoding = 'async';

            const label = document.createElement('span');
            label.className = 'home-apply-avatar-option-name';
            label.textContent = 'Uploaded';

            btn.appendChild(img);
            btn.appendChild(label);
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const p = normalizeApplyAvatarPath(btn.dataset.avatar);
                if (!p) return;
                setSelectedAvatar(p);
                setApplyError('');
                closeAvatarMenu();
            });

            const uploadCell = menu.querySelector('.home-apply-avatar-upload');
            if (uploadCell && uploadCell.nextSibling) {
                menu.insertBefore(btn, uploadCell.nextSibling);
            } else {
                menu.appendChild(btn);
            }
        }
        btn.dataset.avatar = clean;
        const img = btn.querySelector('img');
        if (img) img.src = clean;
    }

    function setSelectedAvatar(path) {
        const clean = normalizeApplyAvatarPath(path);
        const hidden = document.getElementById('home-apply-avatar');
        const img = document.getElementById('home-apply-avatar-trigger-img');
        const text = document.getElementById('home-apply-avatar-trigger-text');
        const menu = document.getElementById('home-apply-avatar-menu');

        if (hidden) hidden.value = clean || '';

        if (clean) {
            if (img) {
                img.src = clean;
                img.hidden = false;
            }
            if (text) text.textContent = 'Selected';
            if (menu) ensureApplyAvatarCustomOption(menu, clean);
        } else {
            if (img) {
                img.removeAttribute('src');
                img.hidden = true;
            }
            if (text) text.textContent = 'Choose a picture…';
        }

        if (menu) {
            menu.querySelectorAll('.home-apply-avatar-option').forEach((el) => {
                if (el.classList.contains('home-apply-avatar-upload')) return;
                const on = el.dataset.avatar === clean;
                el.classList.toggle('is-selected', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }
    }

    function closeAvatarMenu() {
        const menu = document.getElementById('home-apply-avatar-menu');
        const trigger = document.getElementById('home-apply-avatar-trigger');
        const wrap = document.getElementById('home-apply-avatar-dropdown');
        if (menu) menu.hidden = true;
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (wrap) wrap.classList.remove('is-open');
        if (avatarMenuOutsideHandler) {
            document.removeEventListener('click', avatarMenuOutsideHandler, true);
            avatarMenuOutsideHandler = null;
        }
    }

    function openAvatarMenu() {
        const menu = document.getElementById('home-apply-avatar-menu');
        const trigger = document.getElementById('home-apply-avatar-trigger');
        const wrap = document.getElementById('home-apply-avatar-dropdown');
        if (!menu || !trigger) return;
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        if (wrap) wrap.classList.add('is-open');
        if (!avatarMenuOutsideHandler) {
            avatarMenuOutsideHandler = (e) => {
                if (e.target.closest && e.target.closest('#home-apply-avatar-dropdown')) return;
                closeAvatarMenu();
            };
            document.addEventListener('click', avatarMenuOutsideHandler, true);
        }
    }

    function toggleAvatarMenu() {
        const menu = document.getElementById('home-apply-avatar-menu');
        if (!menu) return;
        if (menu.hidden) openAvatarMenu();
        else closeAvatarMenu();
    }

    function renderAvatarMenu() {
        const menu = document.getElementById('home-apply-avatar-menu');
        if (!menu) return;
        menu.innerHTML = '';
        const selected = getSelectedAvatar();

        const uploadCell = document.createElement('button');
        uploadCell.type = 'button';
        uploadCell.className = 'home-apply-avatar-option home-apply-avatar-upload';
        uploadCell.setAttribute('role', 'option');
        uploadCell.setAttribute('aria-label', 'Upload a profile picture');
        uploadCell.setAttribute('aria-selected', 'false');
        uploadCell.innerHTML =
            '<span class="home-apply-avatar-upload-plus" aria-hidden="true">+</span>' +
            '<span class="home-apply-avatar-option-name">Upload</span>';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.hidden = true;
        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            uploadCell.disabled = true;
            try {
                const path = await uploadApplyAvatarImage(file);
                ensureApplyAvatarCustomOption(menu, path);
                setSelectedAvatar(path);
                setApplyError('');
                closeAvatarMenu();
            } catch (err) {
                console.error('Avatar upload', err);
                setApplyError('Failed to upload image. Please try again.');
            } finally {
                uploadCell.disabled = false;
            }
        });
        uploadCell.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileInput.click();
        });
        menu.appendChild(uploadCell);
        menu.appendChild(fileInput);

        if (selected) ensureApplyAvatarCustomOption(menu, selected);

        avatarFiles().forEach((file) => {
            const path = `/pfps/${file}`;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'home-apply-avatar-option';
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-selected', selected === path ? 'true' : 'false');
            btn.dataset.avatar = path;
            if (selected === path) btn.classList.add('is-selected');

            const img = document.createElement('img');
            img.src = path;
            img.alt = file;
            img.decoding = 'async';
            img.loading = 'lazy';

            const label = document.createElement('span');
            label.className = 'home-apply-avatar-option-name';
            label.textContent = file;

            btn.appendChild(img);
            btn.appendChild(label);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedAvatar(path);
                setApplyError('');
                closeAvatarMenu();
            });

            menu.appendChild(btn);
        });
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

        setSelectedAvatar('');
        renderAvatarMenu();
        closeAvatarMenu();
        prefillAuthorApplyForm();
        document.getElementById('home-apply-name')?.focus();
    }

    function resetHomeLoginViews() {
        closeAvatarMenu();
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
        const trigger = document.getElementById('home-apply-avatar-trigger');
        if (form) form.querySelectorAll('input, button, textarea').forEach((el) => { el.disabled = pending; });
        if (trigger) trigger.disabled = pending;
        if (submit) submit.textContent = pending ? 'Submitting…' : 'Submit application';
        if (pending) closeAvatarMenu();
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

    async function submitAuthorApplicationOnServer({ name, email, message, avatar }) {
        const body = { name, email, message, avatar };
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        if (user) body.idToken = await user.getIdToken();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        let res;
        try {
            res = await fetch('/api/auth/author-application', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeoutId);
        }
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
            setSignupError('Username: 3–24 characters, letters, numbers, and underscores only.');
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
                setSignupError('Username: 3–24 characters, letters, numbers, and underscores only.');
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
        closeAvatarMenu();

        const name = normalizeNameInput(document.getElementById('home-apply-name')?.value);
        const email = String(document.getElementById('home-apply-email')?.value || '').trim();
        const password = String(document.getElementById('home-apply-password')?.value || '');
        const passwordConfirm = String(document.getElementById('home-apply-password-confirm')?.value || '');
        const message = String(document.getElementById('home-apply-message')?.value || '').trim();
        const avatar = getSelectedAvatar();
        const alreadySignedIn = Boolean(typeof auth !== 'undefined' && auth.currentUser);

        if (!NAME_RE.test(name)) {
            setApplyError('Username: 3–24 characters, letters, numbers, and underscores only.');
            return;
        }
        if (!email) {
            setApplyError('Enter your email.');
            return;
        }
        if (!alreadySignedIn) {
            if (password.length < 6) {
                setApplyError('Password must be at least 6 characters.');
                return;
            }
            if (password !== passwordConfirm) {
                setApplyError('Passwords do not match.');
                return;
            }
        }
        if (!avatar) {
            setApplyError('Choose a profile picture.');
            return;
        }
        if (message.length < 20) {
            setApplyError('Please write at least a few sentences (20+ characters).');
            return;
        }

        setApplyPending(true);
        try {
            const { user } = await ensureApplyAuthUser({ email, password, authorName: name });
            if (typeof syncAuthControls === 'function') syncAuthControls(user);

            const result = await submitAuthorApplicationOnServer({ name, email, message, avatar });

            const form = document.getElementById('home-author-apply-form');
            const submit = document.getElementById('home-apply-submit');
            if (form) {
                form.querySelectorAll('input, textarea, button.home-apply-avatar-trigger').forEach((el) => {
                    if (el.id === 'home-apply-back') return;
                    el.disabled = true;
                });
            }
            if (submit) submit.hidden = true;

            if (result.alreadyApproved) {
                setApplySuccess(
                    'This email is already approved. Sign out and sign back in to refresh your access.'
                );
            } else if (result.duplicate) {
                setApplySuccess(
                    'We already have a pending application for this email. The admin will be in touch.'
                );
            } else {
                setApplySuccess(
                    'Application received. If approved, sign in with this email and password to write.'
                );
            }
        } catch (err) {
            if (err.code === 'email_mismatch') {
                setApplyError('You’re signed in with a different email. Sign out, then apply again.');
            } else if (err.code === 'account_password_mismatch') {
                setApplyError('That email already has an account. Use the correct password, or sign in first.');
            } else if (err.code === 'auth/email-already-in-use') {
                setApplyError('That email already has an account. Sign in first, then apply.');
            } else if (err.code === 'auth/weak-password') {
                setApplyError('Password is too weak. Use at least 6 characters.');
            } else if (err.code === 'auth/invalid-email') {
                setApplyError('Enter a valid email address.');
            } else if (err.code === 'admin_not_configured') {
                setApplyError('Applications are not configured on the server yet. Contact the site admin.');
            } else if (err.code === 'invalid_name' || err.code === 'invalid_author_name') {
                setApplyError('Username: 3–24 characters, letters, numbers, and underscores only.');
            } else if (err.code === 'invalid_avatar') {
                setApplyError('Choose a profile picture from the list.');
            } else if (err.name === 'AbortError') {
                setApplyError('Request timed out. Your application may still have been saved — try again only if you do not see a confirmation.');
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
        document.getElementById('home-signin-form')?.addEventListener('submit', handleHomeSigninSubmit);
        document.getElementById('home-signin-forgot')?.addEventListener('click', handleHomeForgotPassword);
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
        document.getElementById('home-apply-avatar-trigger')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleAvatarMenu();
        });
    }

    window.showHomeSignInView = showHomeSignInView;
    window.showHomeSignupView = showHomeSignupView;
    window.showHomeAuthorApplyView = showHomeAuthorApplyView;
    window.resetHomeLoginViews = resetHomeLoginViews;
    window.initHomeSignupForm = initHomeSignupForm;
    window.normalizeNameInput = normalizeNameInput;
})();
