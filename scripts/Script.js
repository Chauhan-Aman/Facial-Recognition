let cameraPermissionGranted = false;
window.latestFacePredictions = [];
window.recognitionPaused = false;

const MODEL_URI = "./models";
const TARGET_FRAME_INTERVAL_MS = 50; // ~20 FPS cap to preserve GPU/CPU headroom
const ATTRIBUTE_REFRESH_MS = 450;    // Decoupled age/gender/expression cadence
const SMOOTHING_ALPHA = 0.25;        // EMA factor for temporal attribute stability
const TINY_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
});
const SSD_DETECTOR_OPTIONS = new faceapi.SsdMobilenetv1Options({
    minConfidence: 0.5,
});

/**
 * Formats smoothed face predictions into structured objects for UI rendering.
 */
const formatFacePredictions = (faces) =>
    faces.map((face, index) => {
        const { age, gender, genderProbability, expressions } = face;
        const emotions = expressions
            ? Object.entries(expressions)
                .filter(([_, confidence]) => Math.round(confidence * 100) > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([emotion, confidence]) => `${emotion}: ${Math.round(confidence * 100)}%`)
            : [];

        return {
            faceIndex: index + 1,
            gender: gender || "unknown",
            genderConfidence: genderProbability ? Math.round(genderProbability * 100) : 0,
            age: Number.isFinite(age) ? Math.round(age) : 0,
            emotions,
        };
    });

/**
 * Loads only the models needed for the active detector mode.
 * Tiny mode loads ~1.05 MB total; SSD mode lazy-loads ~6.0 MB on demand.
 */
const ensureModelsLoaded = async (mode) => {
    const loaders = [];

    if (!faceapi.nets.ageGenderNet.isLoaded) {
        loaders.push(faceapi.nets.ageGenderNet.loadFromUri(MODEL_URI));
    }
    if (!faceapi.nets.faceExpressionNet.isLoaded) {
        loaders.push(faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URI));
    }

    if (mode === "ssd") {
        if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
            loaders.push(faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URI));
        }
        if (!faceapi.nets.faceLandmark68Net.isLoaded) {
            loaders.push(faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URI));
        }
    } else {
        if (!faceapi.nets.tinyFaceDetector.isLoaded) {
            loaders.push(faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URI));
        }
        if (!faceapi.nets.faceLandmark68TinyNet.isLoaded) {
            loaders.push(faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URI));
        }
    }

    if (loaders.length > 0) {
        await Promise.all(loaders);
    }
};

const getDetectionBox = (det) => (det.detection ? det.detection.box : det.box);

/**
 * Smooths age, gender probability, and expression scores over time using EMA
 * and matches faces across frames by closest bounding-box center.
 */
const createAttributeTracker = () => {
    let tracks = [];

    const getCenter = (box) => ({
        x: box.x + box.width * 0.5,
        y: box.y + box.height * 0.5,
    });

    const findMatchingTrack = (box, usedIndices) => {
        const center = getCenter(box);
        const maxDistance = Math.max(box.width, box.height) * 0.65;
        let bestIdx = -1;
        let bestDist = Infinity;

        for (let i = 0; i < tracks.length; i++) {
            if (usedIndices.has(i)) continue;
            const prev = getCenter(tracks[i].box);
            const dist = Math.hypot(center.x - prev.x, center.y - prev.y);
            if (dist < maxDistance && dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        return bestIdx;
    };

    const blendExpressions = (prevExpr, nextExpr) => {
        if (!prevExpr) {
            return { ...nextExpr };
        }
        const blended = {};
        for (const key of Object.keys(nextExpr)) {
            const prevVal = prevExpr[key] ?? nextExpr[key];
            blended[key] = prevVal * (1 - SMOOTHING_ALPHA) + nextExpr[key] * SMOOTHING_ALPHA;
        }
        return blended;
    };

    return {
        hasAllAttributes: (detections) => {
            if (detections.length === 0) return false;
            if (detections.length !== tracks.length) return false;
            const used = new Set();
            return detections.every((det) => {
                const idx = findMatchingTrack(getDetectionBox(det), used);
                if (idx === -1) return false;
                used.add(idx);
                return true;
            });
        },
        updateWithFreshAttributes: (detections, ageGenderList, expressionsList) => {
            const used = new Set();
            const nextTracks = detections.map((det, i) => {
                const box = getDetectionBox(det);
                const matchIdx = findMatchingTrack(box, used);
                if (matchIdx !== -1) used.add(matchIdx);
                const prev = matchIdx !== -1 ? tracks[matchIdx] : null;

                const rawAG = ageGenderList[i];
                const rawMaleProb = rawAG.gender === "male"
                    ? rawAG.genderProbability
                    : 1 - rawAG.genderProbability;
                const smoothedMaleProb = prev
                    ? prev.maleProb * (1 - SMOOTHING_ALPHA) + rawMaleProb * SMOOTHING_ALPHA
                    : rawMaleProb;
                const gender = smoothedMaleProb >= 0.5 ? "male" : "female";
                const genderProbability = gender === "male" ? smoothedMaleProb : 1 - smoothedMaleProb;
                const age = prev
                    ? prev.age * (1 - SMOOTHING_ALPHA) + rawAG.age * SMOOTHING_ALPHA
                    : rawAG.age;
                const expressions = blendExpressions(prev?.expressions, expressionsList[i]);

                return { box, age, maleProb: smoothedMaleProb, gender, genderProbability, expressions };
            });

            tracks = nextTracks;
            return nextTracks;
        },
        attachCachedAttributes: (detections) => {
            const used = new Set();
            const nextTracks = [];

            const enriched = detections.map((det) => {
                const box = getDetectionBox(det);
                const matchIdx = findMatchingTrack(box, used);
                if (matchIdx === -1) {
                    return null;
                }
                used.add(matchIdx);
                const track = tracks[matchIdx];
                nextTracks.push({ ...track, box });
                return track;
            });

            tracks = nextTracks;
            return enriched;
        },
        reset: () => {
            tracks = [];
        },
    };
};

/**
 * Requests camera permission once and exposes the shared promise so transition
 * scripts reuse the active stream instead of opening a duplicate camera handle.
 */
const initCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 720 },
            height: { ideal: 480 },
            facingMode: "user",
        },
        audio: false,
    });

    cameraPermissionGranted = true;
    document.querySelectorAll("canvas, .typewriter").forEach((el) => {
        el.style.display = "block";
    });
    document.getElementById("container").style.display = "flex";
    document.getElementById("controls-bar").style.display = "flex";
    document.getElementById("no-permission-message").style.display = "none";

    const videoFeedEl = document.getElementById("video-feed");
    videoFeedEl.srcObject = stream;
    await new Promise((resolve) => {
        if (videoFeedEl.readyState >= 1) {
            resolve();
            return;
        }
        videoFeedEl.addEventListener("loadedmetadata", resolve, { once: true });
    });

    return { stream, videoFeedEl };
};

window.cameraReadyPromise = initCamera();

const run = async () => {
    try {
        const { videoFeedEl } = await window.cameraReadyPromise;

        // Cached DOM & canvas references
        const canvas = document.getElementById("canvas");
        const canvasCtx = canvas.getContext("2d");
        const img = document.getElementById("screenshot");
        const canvasimg = document.getElementById("canvasimg");
        const screenshotCtx = canvasimg.getContext("2d");
        const predictiveResults = document.getElementById("predictive-results");
        const detectorSelect = document.getElementById("detector-mode");
        const landmarksToggle = document.getElementById("toggle-landmarks");
        const perfStatsEl = document.getElementById("perf-stats");

        // Reusable offscreen frame canvas so detection + face extraction share 1 decoded frame
        const frameCanvas = document.createElement("canvas");
        const frameCtx = frameCanvas.getContext("2d");

        const syncCanvasLayout = () => {
            canvas.style.left = videoFeedEl.offsetLeft + "px";
            canvas.style.top = videoFeedEl.offsetTop + "px";
            if (canvas.height !== videoFeedEl.height) canvas.height = videoFeedEl.height;
            if (canvas.width !== videoFeedEl.width) canvas.width = videoFeedEl.width;
        };

        syncCanvasLayout();
        window.addEventListener("resize", syncCanvasLayout);

        canvasimg.style.left = img.offsetLeft + "px";
        canvasimg.style.top = img.offsetTop + "px";
        canvasimg.height = img.height;
        canvasimg.width = img.width;

        let activeMode = detectorSelect ? detectorSelect.value : "tiny";
        let showLandmarks = landmarksToggle ? landmarksToggle.checked : true;
        let isSwitchingModel = false;

        if (perfStatsEl) {
            perfStatsEl.textContent = "Loading TinyFace models (~1.05 MB)...";
        }
        await ensureModelsLoaded(activeMode);

        if (detectorSelect) {
            detectorSelect.addEventListener("change", async (event) => {
                const nextMode = event.target.value;
                isSwitchingModel = true;
                if (perfStatsEl) {
                    perfStatsEl.textContent = nextMode === "ssd"
                        ? "Loading SSD MobileNet..."
                        : "Switching to TinyFace...";
                }
                try {
                    await ensureModelsLoaded(nextMode);
                    activeMode = nextMode;
                } finally {
                    isSwitchingModel = false;
                }
            });
        }

        if (landmarksToggle) {
            landmarksToggle.addEventListener("change", (event) => {
                showLandmarks = event.target.checked;
            });
        }

        const tracker = createAttributeTracker();
        let screenshotTaken = false;
        let isDetecting = false;
        let lastFrameTime = 0;
        let lastAttributeTime = 0;
        let emaLatencyMs = 0;
        let canvasHasDrawing = false;

        const clearOverlay = () => {
            if (canvasHasDrawing) {
                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                canvasHasDrawing = false;
            }
        };

        const runInferenceTick = async (now) => {
            if (
                isDetecting ||
                isSwitchingModel ||
                document.hidden ||
                window.recognitionPaused ||
                videoFeedEl.readyState < 2 ||
                videoFeedEl.paused ||
                videoFeedEl.style.display === "none"
            ) {
                if (window.recognitionPaused || videoFeedEl.style.display === "none") {
                    clearOverlay();
                }
                return;
            }

            if (now - lastFrameTime < TARGET_FRAME_INTERVAL_MS) {
                return;
            }

            isDetecting = true;
            lastFrameTime = now;
            const tickStart = performance.now();

            try {
                const vw = videoFeedEl.videoWidth || videoFeedEl.width;
                const vh = videoFeedEl.videoHeight || videoFeedEl.height;
                if (frameCanvas.width !== vw || frameCanvas.height !== vh) {
                    frameCanvas.width = vw;
                    frameCanvas.height = vh;
                }
                frameCtx.drawImage(videoFeedEl, 0, 0, vw, vh);

                const detectorOptions = activeMode === "ssd"
                    ? SSD_DETECTOR_OPTIONS
                    : TINY_DETECTOR_OPTIONS;
                const useTinyLandmarks = activeMode !== "ssd";

                let detections;
                if (showLandmarks) {
                    detections = await faceapi
                        .detectAllFaces(frameCanvas, detectorOptions)
                        .withFaceLandmarks(useTinyLandmarks);
                } else {
                    detections = await faceapi.detectAllFaces(frameCanvas, detectorOptions);
                }

                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

                if (detections.length === 0) {
                    tracker.reset();
                    window.latestFacePredictions = [];
                    predictiveResults.textContent = "[]";
                    canvasHasDrawing = false;
                } else {
                    const needAttributeRefresh =
                        !tracker.hasAllAttributes(detections) ||
                        now - lastAttributeTime >= ATTRIBUTE_REFRESH_MS;

                    let attributes;
                    if (needAttributeRefresh) {
                        const regions = detections.map((d) => d.alignedRect || d.detection || d);
                        const faceCanvases = await faceapi.extractFaces(frameCanvas, regions);
                        const [ageGenderList, expressionsList] = await Promise.all([
                            Promise.all(
                                faceCanvases.map((c) => faceapi.nets.ageGenderNet.predictAgeAndGender(c))
                            ),
                            Promise.all(
                                faceCanvases.map((c) => faceapi.nets.faceExpressionNet.predictExpressions(c))
                            ),
                        ]);
                        attributes = tracker.updateWithFreshAttributes(
                            detections,
                            ageGenderList,
                            expressionsList
                        );
                        lastAttributeTime = now;
                    } else {
                        attributes = tracker.attachCachedAttributes(detections);
                    }

                    const displaySize = { width: videoFeedEl.width, height: videoFeedEl.height };
                    const resizedDetections = faceapi.resizeResults(detections, displaySize);

                    faceapi.draw.drawDetections(canvas, resizedDetections);
                    if (showLandmarks) {
                        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
                    }

                    const validAttributes = [];
                    resizedDetections.forEach((resizedDet, idx) => {
                        const attr = attributes[idx];
                        if (!attr) return;
                        validAttributes.push(attr);

                        const box = getDetectionBox(resizedDet);
                        const exprEntries = Object.entries(attr.expressions)
                            .sort(([, a], [, b]) => b - a);
                        const topExpr = exprEntries[0];
                        const exprText = topExpr
                            ? `${topExpr[0]} (${Math.round(topExpr[1] * 100)}%)`
                            : "";
                        const genderText = `${attr.gender} - ${Math.round(attr.genderProbability * 100)}%`;
                        const ageText = `Age: ${Math.round(attr.age)} yrs`;

                        const lines = exprText ? [genderText, ageText, exprText] : [genderText, ageText];
                        const textField = new faceapi.draw.DrawTextField(lines, box.topRight);
                        textField.draw(canvas);
                    });

                    canvasHasDrawing = true;
                    const predictions = formatFacePredictions(validAttributes);
                    window.latestFacePredictions = predictions;
                    predictiveResults.textContent = JSON.stringify(predictions);

                    if (!screenshotTaken) {
                        screenshotCtx.drawImage(frameCanvas, 0, 0, canvasimg.width, canvasimg.height);
                        img.src = canvasimg.toDataURL("image/png");
                        screenshotCtx.clearRect(0, 0, canvasimg.width, canvasimg.height);
                        screenshotTaken = true;
                        canvasimg.style.display = "none";
                    }
                }

                const tickLatency = performance.now() - tickStart;
                emaLatencyMs = emaLatencyMs
                    ? emaLatencyMs * 0.8 + tickLatency * 0.2
                    : tickLatency;
                if (perfStatsEl) {
                    const effectiveFps = Math.min(
                        Math.round(1000 / Math.max(emaLatencyMs, TARGET_FRAME_INTERVAL_MS)),
                        60
                    );
                    const label = activeMode === "ssd" ? "SSD" : "Tiny";
                    const lmLabel = showLandmarks ? "LM:On" : "LM:Off";
                    perfStatsEl.textContent = `${label} | ${lmLabel} | ~${effectiveFps} FPS | ${Math.round(emaLatencyMs)} ms | Faces: ${detections.length}`;
                }
            } finally {
                isDetecting = false;
            }
        };

        const loop = (now) => {
            runInferenceTick(now);
            requestAnimationFrame(loop);
        };

        requestAnimationFrame(loop);
    } catch (error) {
        cameraPermissionGranted = false;
        document.querySelectorAll("#container, #controls-bar, canvas, .typewriter").forEach((el) => {
            el.style.display = "none";
        });
        document.getElementById("no-permission-message").style.display = "block";
        console.error("Camera permission denied or initialization failed: ", error);
    }
};

run();
