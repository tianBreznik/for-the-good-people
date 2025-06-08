# Project Documentation

## `server.js`

This file is the main entry point for the Node.js Express server. It handles routing, static file serving, and file uploads.

### Dependencies
- `express`: Web framework for Node.js.
- `path`: Node.js module for working with file and directory paths.
- `express-fileupload`: Middleware for handling file uploads.

### Initialization
- Sets up `initial_path` to the `public` directory.
- Initializes the Express application.
- Serves static files from the `public` directory.
- Uses `express-fileupload` middleware for handling file uploads.

### Routes
- **GET `/`**: Serves `home.html`.
- **GET `/editor`**: Serves `editor.html`.
- **POST `/upload`**: Handles file uploads.
    - Saves uploaded images to `public/uploads/` with a unique name generated using the current date and time.
    - Returns the path to the uploaded image as a JSON response.
- **GET `/admin`**: Serves `dashboard.html`.
- **GET `/:blog`**: Serves `blog.html`.
- **GET `/:blog/editor`**: Serves `editor.html`.
- **404 Handler**: Returns a "404" JSON response for any unmatched routes.

### Server Listening
- The server listens on port `3003`.

## `package.json`

This file defines project metadata, dependencies, and scripts.

### Metadata
- **name**: `bloggin-site`
- **version**: `1.0.0`
- **main**: `server.js`

### Scripts
- **start**: `nodemon server.js` (Starts the server using `nodemon` for automatic restarts on file changes)

### Dependencies
- `express-fileupload`: `^1.2.1`
- `express.js`: `^1.0.0` (Note: This might be a typo and should likely be `express`)
- `nodemon`: `^2.0.12`

## `public/` Directory Structure

This directory contains static assets served by the Express server.

- **`css/`**: Contains CSS stylesheets.
- **`js/`**: Contains client-side JavaScript files.
- **`img/`**: Contains images.
- **`uploads/`**: Contains user-uploaded images.
- **`fonts/`**: Contains custom fonts.
- **`home.html`**: The main landing page.
- **`blog.html`**: Page for displaying blog posts.
- **`dashboard.html`**: Admin dashboard page.
- **`editor.html`**: Page for creating or editing blog posts. 