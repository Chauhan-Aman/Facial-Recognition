# Facial Recognition — Analysis & Improvement Roadmap

This document captures the current bottlenecks, bugs, and optimization plan for achieving maximum runtime efficiency, accuracy control, and maintainability.

---

## 1. Critical Bugs (Fix First)

- [x] **Restore `<video>` element in `index.html`**
  - **Current:** `<video id="video-feed">` is commented out (`index.html:30`) and replaced with `<img id="video-feed" src="./images/trial-images/oldManSerious2.png">` (`index.html:32`). Assigning `videoFeedEl.srcObject = stream` in `scripts/Script.js:24` does not stream webcam video onto an `<img>`, and loads a ~1.17 MB PNG on startup.
  - **Fix:** Restore `<video id="video-feed" autoplay muted playsinline></video>` (add `muted` and `playsinline` for reliable autoplay across browsers). Optionally move static test images into a dedicated "Demo Image Mode" selector.

- [x] **Eliminate duplicate `getUserMedia()` calls**
  - **Current:** Both `scripts/Script.js:7` and `scripts/transitions.js:2` independently request `navigator.mediaDevices.getUserMedia({ video: true })`, opening two separate camera handles and leaking the second stream.
  - **Fix:** Acquire the camera stream once in a single initialization module/entry point and coordinate transitions via promises/events instead of a second `getUserMedia` call.

- [x] **Fix CSS `display` conflict on `#anaylzeResults`**
  - **Current:** `css/styles.css:49-57` sets `display: none` and then immediately overrides it with `display: flex`.
  - **Fix:** Control visibility cleanly with a class (e.g., `.is-hidden` / `display: none` by default until the analysis phase begins) and fix the `anaylzeResults` spelling typo if refactoring selectors.

- [x] **Fix `#predictive-results` multi-face & `\b` delimiter bug**
  - **Current:** `scripts/Script.js:76-83` encodes output with `\b` backspace characters and overwrites `predictiveResults.textContent` inside `resizedData.forEach(...)`, so only the last detected face persists, while `scripts/transitions.js:48-108` parses `\b` character-by-character and appends `#line-*` nodes without clearing old ones.
  - **Fix:** Pass structured prediction objects directly to the UI renderer and update/reuse dedicated DOM nodes.

---

## 2. ML Model & Inference Efficiency (Biggest Speed & Load Gains)

| Model | Current Usage | Size on Disk | Optimization |
|---|---|---|---|
| `faceRecognitionNet` | Loaded & executed every frame (`.withFaceDescriptors()`) | ~6.46 MB | **Remove** unless 1:1 face matching against known identities is added |
| `ssdMobilenetv1` | Loaded & executed every frame | ~5.64 MB | **Default to `tinyFaceDetector`** (~196 KB, ~29x smaller, much faster) with an optional Accuracy Mode toggle |
| `faceLandmark68Net` | Loaded & executed every frame | ~365 KB | **Switch to `faceLandmark68TinyNet`** (~82 KB, already in `./models/`) |
| `ageGenderNet` | Loaded & executed every frame | ~437 KB | Keep; consider running at a lower cadence than bounding-box tracking |
| `faceExpressionNet` | Loaded & executed every frame | ~336 KB | Keep; consider running at a lower cadence or only when a face is detected |

- [x] **Remove unused `faceRecognitionNet` & `.withFaceDescriptors()`**
  - Eliminates ~6.46 MB of model downloads on startup and removes heavy 128-d descriptor inference on every frame (`scripts/Script.js:30, 57`).
- [x] **Use `TinyFaceDetector` + `faceLandmark68TinyNet` by default**
  - Reduces initial model payload from ~13.2 MB down to ~1.05 MB (>90% reduction) and significantly improves FPS on CPU/integrated GPUs.
  - Expose a **Speed vs. Accuracy** toggle (`TinyFaceDetector` vs. `SSD MobileNet v1`) and tune `TinyFaceDetectorOptions` (`inputSize: 320` or `416`, `scoreThreshold: 0.5`).
- [x] **Replace overlapping `setInterval(..., 200)` with a non-overlapping loop**
  - **Current:** `scripts/Script.js:53-92` fires every 200 ms without waiting for the previous `await faceapi.detectAllFaces(...)` to finish, causing queued frames and WebGL/main-thread contention on slower devices.
  - **Fix:** Use a self-scheduling `requestAnimationFrame` (or async loop with `setTimeout` after inference completes), guard with `video.readyState >= 2 && !video.paused`, and **pause inference** whenever the webcam feed is hidden (e.g., during the `hack-video.mp4` sequence or when the browser tab is backgrounded via `document.hidden`).
- [x] **Decouple lightweight tracking from heavy attribute prediction**
  - Run face detection + landmarks every frame (or target ~15–20 FPS) while running `ageGenderNet` / `faceExpressionNet` every N frames (or smoothing predictions with a rolling average to stop jittery age/gender/emotion numbers).

---

## 3. Rendering, DOM & Asset Efficiency

- [x] **Cache Canvas Contexts & DOM References**
  - **Current:** `canvas.getContext("2d")` and `document.getElementById('predictive-results')` are queried inside the detection loop every tick (`scripts/Script.js:61, 81`), and `new faceapi.draw.DrawTextField(...)` is instantiated per face per tick.
  - **Fix:** Cache `canvasCtx`, `screenshotCtx`, and all DOM element references once during setup.
- [x] **Sync `#screenshot` capture with the countdown**
  - **Current:** `scripts/Script.js:85-91` captures `#screenshot` on the very first detection frame—long before the `"3... 2... 1... Smile!"` prompt in `scripts/transitions.js`.
  - **Fix:** Trigger screenshot capture at the exact `"Smile!"` moment (and allow re-capturing with a button).
- [x] **Responsive Canvas Alignment**
  - **Current:** `canvas.style.left` / `top` are set using `offsetLeft` / `offsetTop` at startup and manually offset during `performFinalTransition()`.
  - **Fix:** Wrap `<video>` and `<canvas>` in a `position: relative` container so the overlay canvas automatically stays aligned on resize and CSS transitions.
- [ ] **Asset Cleanup / Lazy Loading**
  - `images/trial-images/` contains ~13.8 MB of unused PNGs, and `images/hack-video.mp4` is ~2.98 MB.
  - Keep `hack-video.mp4` lazy-loaded only if the intro prank is enabled, and either remove unused trial PNGs or compress them to WebP for an optional demo image tester.

---

## 4. Architecture & UX Improvements

- [x] **Replace nested `setTimeout` pyramid in `scripts/transitions.js`**
  - **Current:** Deeply nested timeouts (`13500` -> `100` -> `4500` -> `14500` -> `15000` ms + `10000` ms scan) block live results for ~40+ seconds with no cancellation mechanism.
  - **Fix:** Refactor into clean `async`/`await` steps with an `AbortController` so the timeline can be cancelled or skipped cleanly.
- [x] **Add "Skip Intro" / "Instant Analysis" Mode**
  - Let users jump straight to real-time detection + live predictive readout instead of waiting ~40 seconds on repeat visits.
- [ ] **Remove or archive unused legacy scripts**
  - `scripts/PredictionsScript.js`, `scripts/newtyping.js`, and `scripts/typingtrials.js` are commented out in `index.html` and superseded by `Script.js` and `transitions.js`.
- [x] **Add live performance & confidence telemetry**
  - Optionally show real-time FPS / inference latency (ms), smoothed age/gender/emotion bars, and a clean "Retake / Switch Camera / Upload Image" control bar.

---

## Suggested Implementation Order

1. **Phase 1 (Quick Wins):** Fix `<video id="video-feed">`, single `getUserMedia` stream, `#anaylzeResults` CSS, and drop `faceRecognitionNet` + `.withFaceDescriptors()`.
2. **Phase 2 (Core Performance):** Switch to `TinyFaceDetector` + `tinyLandmark` (with optional toggle), non-overlapping `requestAnimationFrame` loop, cached contexts, and prediction smoothing.
3. **Phase 3 (UX & Cleanup):** Refactor `transitions.js` to cancellable `async`/`await`, add Skip Intro + live stats UI, and clean up dead scripts/unused assets.

