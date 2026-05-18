const AUTH_RETURN_ORIGIN_KEY = 'authReturnOrigin';
/** Dev server port (see server.js); used when OAuth redirect drops the port on LAN. */
const DEFAULT_DEV_PORT = '3008';

function isPrivateLanHost(hostname) {
    return /^(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(hostname);
}

function saveAuthReturnOrigin() {
    try {
        sessionStorage.setItem(AUTH_RETURN_ORIGIN_KEY, window.location.origin);
    } catch (e) {}
}

function getSavedAuthReturnOrigin() {
    try {
        return sessionStorage.getItem(AUTH_RETURN_ORIGIN_KEY) || '';
    } catch (e) {
        return '';
    }
}

function getAppOrigin() {
    const saved = getSavedAuthReturnOrigin();
    if (saved) {
        try {
            return new URL(saved).origin;
        } catch (e) {}
    }
    if (window.location.port) return window.location.origin;
    const host = window.location.hostname;
    if (isPrivateLanHost(host)) {
        return `${window.location.protocol}//${host}:${DEFAULT_DEV_PORT}`;
    }
    return window.location.origin;
}

/** OAuth redirect often returns to http://192.168.x.x/ with no port — restore :3008 before Firebase runs. */
function restoreAuthReturnOriginIfNeeded() {
    const { hostname, port, protocol, pathname, search, hash } = window.location;
    if (port) return false;
    if (!isPrivateLanHost(hostname)) return false;

    let targetOrigin = '';
    const saved = getSavedAuthReturnOrigin();
    if (saved) {
        try {
            const u = new URL(saved);
            if (u.hostname === hostname && u.port) targetOrigin = u.origin;
        } catch (e) {}
    }
    if (!targetOrigin) {
        targetOrigin = `${protocol}//${hostname}:${DEFAULT_DEV_PORT}`;
    }
    if (targetOrigin === window.location.origin) return false;

    window.location.replace(`${targetOrigin}${pathname}${search}${hash}`);
    return true;
}

if (restoreAuthReturnOriginIfNeeded()) {
    // Navigating away; defer Firebase init until the correct origin loads.
} else {
    saveAuthReturnOrigin();

    const firebaseConfig = {
        apiKey: "AIzaSyCIT0l2HWC3b1cUjhNxSABuHeGEQ3R0ekU",
        authDomain: "good-people-posting.firebaseapp.com",
        projectId: "good-people-posting",
        storageBucket: "good-people-posting.firebasestorage.app",
        messagingSenderId: "501187372232",
        appId: "1:501187372232:web:df3c3280f12686f0d471fd"
    };

    firebase.initializeApp(firebaseConfig);

    let db = firebase.firestore();
    let auth = firebase.auth();
    window.db = db;
    window.auth = auth;
    window.saveAuthReturnOrigin = saveAuthReturnOrigin;
    window.getAppOrigin = getAppOrigin;

    const authorIdByUid = {};

    function cacheAuthorIdForUser(uid, authorName) {
        if (!uid || !authorName) return;
        authorIdByUid[uid] = authorName;
    }

    function clearAuthorIdCache(uid) {
        if (uid) delete authorIdByUid[uid];
        else Object.keys(authorIdByUid).forEach((k) => delete authorIdByUid[k]);
    }

    /**
     * Stable author key for Firestore (blogs.author, comments.user).
     * Prefer chosen @handle from sign-up (claims / cache / displayName).
     */
    function getAuthorIdFromUser(user) {
        if (!user) return 'Anonymous';
        if (authorIdByUid[user.uid]) return authorIdByUid[user.uid];
        if (user.displayName) {
            const fromName = user.displayName.trim().replace(/^@+/, '').replace(/\s+/g, '_');
            if (fromName) return fromName.slice(0, 24);
        }
        if (user.email) {
            const local = user.email.split('@')[0].trim();
            if (local) return local;
        }
        return `user_${user.uid.slice(0, 8)}`;
    }

    function refreshAuthorIdFromToken(user) {
        if (!user) return Promise.resolve();
        return user.getIdTokenResult().then((result) => {
            const name = result.claims && result.claims.authorName;
            if (name) cacheAuthorIdForUser(user.uid, name);
        }).catch(() => {});
    }

    const AUTH_PROVIDER_ICONS = {
        twitter: '/icons/auth-twitter.svg',
        apple: '/icons/auth-apple.svg',
    };

    /** Enable matching providers in Firebase Console → Authentication → Sign-in method. */
    function getAuthSignInOptions() {
        return [
            {
                provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
                requireDisplayName: true,
            },
            firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            {
                provider: 'apple.com',
                iconUrl: AUTH_PROVIDER_ICONS.apple,
            },
            {
                provider: 'twitter.com',
                iconUrl: AUTH_PROVIDER_ICONS.twitter,
            },
        ];
    }

    function getAuthUiConfig(overrides) {
        return Object.assign(
            {
                signInFlow: 'popup',
                signInOptions: getAuthSignInOptions(),
            },
            overrides || {}
        );
    }

    window.getAuthorIdFromUser = getAuthorIdFromUser;
    window.cacheAuthorIdForUser = cacheAuthorIdForUser;
    window.clearAuthorIdCache = clearAuthorIdCache;
    window.refreshAuthorIdFromToken = refreshAuthorIdFromToken;
    window.getAuthSignInOptions = getAuthSignInOptions;
    window.getAuthUiConfig = getAuthUiConfig;

    const logoutUser = () => {
        clearAuthorIdCache();
        auth.signOut();
        location.replace(`${getAppOrigin()}/`);
    };
    window.logoutUser = logoutUser;
}
