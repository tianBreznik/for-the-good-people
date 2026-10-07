(function () {
    const form = document.getElementById('password-reset-form');
    const errEl = document.getElementById('reset-error');
    const okEl = document.getElementById('reset-success');
    const submit = document.getElementById('reset-submit');
    const hint = document.getElementById('reset-email-hint');

    function setError(message) {
        if (okEl) {
            okEl.hidden = true;
            okEl.textContent = '';
        }
        if (!errEl) return;
        errEl.textContent = message || '';
        errEl.hidden = !message;
    }

    function setSuccess(message) {
        if (errEl) {
            errEl.hidden = true;
            errEl.textContent = '';
        }
        if (!okEl) return;
        okEl.textContent = message || '';
        okEl.hidden = !message;
    }

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode') || 'resetPassword';
    const oobCode = params.get('oobCode') || '';

    if (mode !== 'resetPassword' || !oobCode) {
        setError('This reset link is invalid or incomplete.');
        if (form) form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
        return;
    }

    const authApi = window.auth;
    if (!authApi) {
        setError('Auth is not available. Refresh and try again.');
        return;
    }

    authApi
        .verifyPasswordResetCode(oobCode)
        .then((email) => {
            if (hint && email) {
                hint.hidden = false;
                hint.textContent = `for ${email}`;
            }
        })
        .catch(() => {
            setError('This reset link is invalid or has expired. Request a new one from sign in.');
            if (form) form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
        });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const password = String(document.getElementById('reset-password')?.value || '');
        const confirm = String(document.getElementById('reset-password-confirm')?.value || '');

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.textContent = 'Saving…';
        }
        form.querySelectorAll('input').forEach((el) => { el.disabled = true; });

        try {
            await authApi.confirmPasswordReset(oobCode, password);
            setSuccess('Password updated. Taking you to sign in…');
            window.setTimeout(() => {
                window.location.replace('/?login=1');
            }, 1200);
        } catch (err) {
            form.querySelectorAll('input').forEach((el) => { el.disabled = false; });
            if (submit) {
                submit.disabled = false;
                submit.textContent = 'Save password';
            }
            if (err.code === 'auth/expired-action-code' || err.code === 'auth/invalid-action-code') {
                setError('This reset link is invalid or has expired. Request a new one from sign in.');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak. Use at least 6 characters.');
            } else {
                setError('Could not update password. Try again.');
                console.error(err);
            }
        }
    });
})();
