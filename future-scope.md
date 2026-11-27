# Future Scope & Next-Stage Roadmap

With core bugs resolved, ML inference optimized, the UI redesigned, and legacy assets cleaned up (see `improvements.md`), this document captures high-value enhancements for future iterations.

---

## 1. True Identity Recognition (1:N Face Matching)

- **Opt-In Subject Enrollment (`IndexedDB` / `localStorage`)**
  - Weight files for `face_recognition_model` (~6.46 MB) already exist in `./models/`.
  - Add an optional **Identity Mode** (lazy-loaded only when enabled) that lets users enroll labeled faces locally, compute 128-d descriptors via `.withFaceDescriptor()`, and match live faces using `faceapi.FaceMatcher` with a configurable distance threshold.
  - Display matched subject names (e.g., `Aman · 0.42`) alongside age, gender, and expression signals.

---

## 2. Next-Generation Inference & Runtime Performance

- **Modern Runtime / WebGPU & Web Worker Offloading**
  - Evaluate migrating from legacy `face-api.min.js` to `@vladmandic/face-api` or MediaPipe Tasks Vision (`FaceLandmarker`) to support newer TensorFlow.js WebGL/WebGPU backends and WebAssembly SIMD.
  - Move frame preprocessing and inference onto a dedicated Web Worker with `OffscreenCanvas` so UI animations and interactions stay locked at 60 FPS even during heavy multi-face detection.
- **Adaptive Input Resolution Scaling**
  - Automatically scale `TinyFaceDetectorOptions.inputSize` (`320` -> `224` -> `160`) when frame latency crosses a target budget (e.g., `> 65 ms`) on lower-powered laptops or mobile devices, and step back up when GPU headroom returns.
- **Model Directory Pruning**
  - Remove unused `./models/mtcnn_model-*` (~1.99 MB) — and `./models/face_recognition_model-*` (~6.46 MB) if identity matching is not planned — to minimize repository and hosting footprint.

---

## 3. Biometric Features & Inspector Enhancements

- **Overlay Rendering on Snapshots & Uploaded Photos**
  - Add a synced overlay canvas over `#screenshot` so multi-face uploaded photos or frozen snapshots visually highlight `Face 1`, `Face 2`, etc., matching the active `#face-tabs` selection.
- **Landmark-Based Liveness & Gaze Signals**
  - Reuse the 68 facial landmarks already computed each frame to calculate Eye Aspect Ratio (blink detection) and approximate head orientation (yaw/pitch) for basic anti-spoofing / engagement indicators.
- **Session Timeline & Annotated Export**
  - Track emotion changes over a session in memory and allow exporting an annotated PNG snapshot (video frame + precision overlay) or a JSON telemetry summary.

---

## 4. Offline Support & Automated Testing

- **Progressive Web App (PWA) & Model Caching**
  - Add a Service Worker + Web App Manifest to cache `./models/*` weights and static assets locally for instant repeat startups and full offline usage.
- **Automated Browser E2E Verification**
  - Add Playwright tests using Chromium's `--use-fake-device-for-media-stream` flag to automatically verify camera initialization, `TinyFace` vs. `SSD` switching, `Skip Intro` / `Replay Intro`, `Live` / `Snapshot` readout updates, and `Photo Mode` upload fallback across desktop and mobile viewports.

