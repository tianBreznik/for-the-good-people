let ul = document.querySelectorAll('.links-container');

auth.onAuthStateChanged((user) => {
    if (user) {
        console.log(user);

        user.getIdTokenResult()
            .then((idTokenResult) => {
                console.log(idTokenResult.claims.role);
                if(idTokenResult.claims.role == "real person"){
                    ul[0].innerHTML = '' +
                        '<li class="link-item"><a href="#" onclick="goHome()"class="link" id="nav-text">home</a></li>' +
                        '<li class="link-item"><a href="/editor" class="link" id="nav-text">Editor</a></li>' +
                        '<li class="link-item"><a href="/admin" class="link" id="nav-text">Dashboard</a></li>' +
                        '<li class="link-item"><a href="#" onclick="logoutUser()" class="link" id="nav-text">Logout</a></li>';
                }
                else{
                    ul[0].innerHTML = '' +
                        '<li class="link-item"><a href="/" class="link" id="nav-text">home</a></li>' +
                        '<li class="link-item"><a href="#" onclick="logoutUser()" class="link" id="nav-text">Logout</a></li>';
                }
                console.log(idTokenResult.claims);
        })
    }
    else {
        ul[0].innerHTML +=
            '<li class="link-item"><a href="/admin" class="link">Login</a></li>';

    }
})

function goHome() {
    console.log('goHome');
    let stateObj = { id: "100" };
    window.history.pushState(stateObj,
        "Editor", "/editor.html");
}










