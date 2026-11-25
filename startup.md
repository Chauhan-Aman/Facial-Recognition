# Project Startup Guide

This is a client-side static web application using `face-api.js` and local TensorFlow.js model weights in `./models/`.

## Why a Local Server Is Required

Opening `index.html` directly via `file://` will fail because:
1. Browsers block `fetch()` requests to local model manifest/shard files (`./models/*`) due to CORS restrictions on `file://` origins.
2. `navigator.mediaDevices.getUserMedia()` (webcam access) requires a secure context (`http://localhost` or `https://`).

---

## How to Start the Project

### Option 1: Python Built-in HTTP Server (Used Here)
From the project root (`Facial-Recognition/`):

```powershell
python -m http.server 8000
```

Then open in your browser:
- `http://localhost:8000/`

Stop the server anytime with `Ctrl + C` in the terminal.

### Option 2: Node.js (`npx`)
If you prefer Node.js:

```powershell
npx serve . -l 8000
```
or:
```powershell
npx http-server -p 8000
```

Then open `http://localhost:8000/`.

### Option 3: VS Code Live Server
1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` and select **Open with Live Server**.

---

## Browser Requirements & Notes

- **Camera Permission:** Allow webcam access when prompted by your browser. If denied, `#no-permission-message` will be displayed.
- **Current Known Startup Issue:** In `index.html` (lines 30–32), `<video id="video-feed">` is currently commented out and replaced with a static `<img id="video-feed">` tag, so live camera frames will not render until that is fixed (see `improvements.md`).

