(function (global) {
    /** Keep in sync with lib/author-profile-limits.js */
    const BIO_MAX_LENGTH = 220;
    const SCALE_AT_MAX_LENGTH = 1;
    const SCALE_AT_MIN_LENGTH = 1.32;

    function bioTextLengthScale(charCount) {
        const len = Math.max(0, Math.min(BIO_MAX_LENGTH, Number(charCount) || 0));
        if (len === 0) return SCALE_AT_MIN_LENGTH;
        const t = len / BIO_MAX_LENGTH;
        return SCALE_AT_MIN_LENGTH - Math.pow(t, 0.82) * (SCALE_AT_MIN_LENGTH - SCALE_AT_MAX_LENGTH);
    }

    function applyBioTextLengthScale(textEl, bio) {
        if (!textEl) return;
        const len = Array.from(String(bio || '').trim()).length;
        textEl.style.setProperty('--bio-text-length-scale', String(bioTextLengthScale(len)));
    }

    global.GppBioTextScale = {
        applyBioTextLengthScale,
        bioTextLengthScale,
    };
})(typeof window !== 'undefined' ? window : globalThis);
