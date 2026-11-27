# Real-Time Facial Recognition and Emotion Detection

A client-side real-time facial recognition, expression analysis, and age/gender estimation web application powered by `face-api.js` and TensorFlow.js models running locally in the browser.

## Features

- **Fast Local ML Inference:** Defaults to `TinyFaceDetector` + `faceLandmark68TinyNet` (~1.05 MB payload) with an on-demand toggle for `SSD MobileNet v1` accuracy mode.
- **Temporal Smoothing & Decoupled Tracking:** Smooths age, gender confidence, and expression probabilities across frames with throttled `requestAnimationFrame` scheduling.
- **Live & Snapshot Analysis:** Capture portraits at the countdown cue or anytime via **Retake**, switch between **Live** camera tracking and **Snapshot** inspection, or **Upload** any local photo (works even without a webcam).
- **Multi-Camera Support:** Automatically exposes a camera selector when multiple video devices are available.
- **Playful Intro (Skippable):** Includes an optional hacking-themed prank sequence (purely visual entertainment, skippable anytime via **Skip Intro** or `Esc`).

## How to Run Locally

No npm installation or build step is required. A local static HTTP server is needed for browser `fetch()` model loading and `getUserMedia` camera access (see [startup.md](./startup.md) for details):

```powershell
git clone https://github.com/Chauhan-Aman/Facial-Recognition.git
cd Facial-Recognition
python -m http.server 8000
```

Then open `http://localhost:8000/` in your browser.
