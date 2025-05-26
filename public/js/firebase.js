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

const logoutUser = () => {
    // console.log("logout")
    // console.log(location);
    auth.signOut();
    location.replace("/");
}
