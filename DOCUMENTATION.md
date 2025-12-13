# Projektna Documentacija

Aplikacija za bloganje, ustvarjanje in vzdrzevanje skupnosti ter deljenje dobrih
v kakršnikoli obliki. Good People Posting za ljudi in lokalno skupnosti, 
raztrosene po svetu. Dobri ljudje in dobre ideje brez meja. Modrosti v 
vsakodnevnem deljenju in v poljudni obliki.


```
  __  _   _   _     _   _  _   _      _    _   _   __ ___ ___       __ 
 /__ / \ / \ | \   |_) |_ / \ |_) |  |_   |_) / \ (_   |   |  |\ | /__ 
 \_| \_/ \_/ |_/   |   |_ \_/ |   |_ |_   |   \_/ __)  |  _|_ | \| \_|
```

## `server.js`

 Vstopna točka za Node.js Express server. Skrbi za routing, serviranje statičnih fajlov in nalaganje fajlov.

### Inicializacija
- Postavi `initial_path` in ga poveže s `public` direktorijem.
- Inicializira Express aplikacijo.
- Servira statične fajle iz `public` direktorija.
- Uporablja `express-fileupload` vmesnik ki skrbi za nalaganje fajlov.

### Poti
- **GET `/`**: Servira `home.html`.
- **GET `/editor`**: Servira `editor.html`.
- **POST `/upload`**: Poskrbi za nalaganje fajlov.
    - Shrani naložene imedže na `public/uploads/` z edinstveno generiranim imenom na podlagi datuma in trenutnega časa.
    - Vrne pot do naloženega imedža kot JSON odgovor.
- **GET `/admin`**: Servira `dashboard.html`.
- **GET `/:blog`**: Servira `blog.html`.
- **GET `/:blog/editor`**: Servira `editor.html`.
- **404 Handler**: Vrne "404" JSON odgovor za nedefinirane poti.

### Server Posluša
- Server posluša na vhodu `3003`.

## `package.json`

Ta fajl definira metapodatke projekta, odvisnosti in skripte.

### Metadata
- **Ime**: `real-people`
- **Verzija**: `1.0.0`
- **Vstopna točka**: `server.js`

### Skriptne Bližnjice
- **start**: `nodemon server.js` (vzpovstavi server z `nodemon` za avtomatske posodobitve ob spremembah fajlov)

### Odvisnosti
- `express`: spletni framework za vzpovstavljanje serverjev Node.js, `^1.0.0`
- `path`: Node.js modul za delo s potmi fajlov in mapic.
- `express-fileupload`: express server vmesnik za posredovanje fajlov na server,`^1.2.1`
- `nodemon`: `^2.0.12`

## `public/` Struktura Direktorija

This directory contains static assets served by the Express server.

- **`css/`**: Vsebuje CSS stilske šablone.
- **`js/`**: Vsebuje JavScript fajle za client stran.
- **`img/`**: Vsebuje imedže.
- **`uploads/`**: Vsebuje uporabniško naložene imedže.
- **`fonts/`**: Vsebuje custom fonte.
- **`home.html`**: Glavna vstopna stran.
- **`blog.html`**: Stran za renderiranje blog zapisov.
- **`dashboard.html`**: Adminova urejevalna stran.
- **`editor.html`**: Urejevalna stran za pisanje in urejanje blogov. 