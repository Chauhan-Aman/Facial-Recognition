let cameraPermissionGranted = false;
window.latestFacePredictions = [];
window.recognitionPaused = false;

const MODEL_URI = "./models";
const TARGET_FRAME_INTERVAL_MS = 50; // ~20 FPS cap for responsive tracking with low overhead
const ATTRIBUTE_REFRESH_MS = 450;    // Decoupled age/gender/expression cadence
const SMOOTHING_ALPHA = 0.25;        // EMA factor for temporal attribute stability
const EXPRESSION_ORDER = [
    "happy",
    "neutral",
    "surprised",
    "sad",
    "angry",
    "fearful",
    "disgusted",
];

const TINY_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
    inputSize: 320,
    scoreThreshold: 0.5,
});
const SSD_DETECTOR_OPTIONS = new faceapi.SsdMobilenetv1Options({
    minConfidence: 0.5,
});

const getDetectionBox = (det) => (det.detection ? det.detection.box : det.box);

/**
 * Formats smoothed face predictions into structured objects for UI rendering.
 */
const formatFacePredictions = (faces) =>
    faces.map((face, index) => {
        const { age, gender, genderProbability, expressions } = face;
        const sortedExpressions = expressions
            ? Object.entries(expressions)
                .map(([emotion, score]) => ({ emotion, score }))
                .sort((a, b) => b.score - a.score)
            : [];

        const emotions = sortedExpressions
            .filter((item) => Math.round(item.score * 100) > 0)
            .map((item) => `${item.emotion}: ${Math.round(item.score * 100)}%`);

        return {
            faceIndex: index + 1,
            gender: gender || "unknown",
            genderConfidence: genderProbability ? Math.round(genderProbability * 100) : 0,
            age: Number.isFinite(age) ? Math.round(age) : 0,
            expressions: sortedExpressions,
            emotions,
        };
    });

/**
 * Loads only the models required for the active detector mode.
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
            if (detections.length === 0 || detections.length !== tracks.length) return false;
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
                if (matchIdx === -1) return null;
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
 * Draws crisp precision overlays and batched landmark points directly on Canvas2D,
 * avoiding per-frame faceapi DrawTextField/arc overhead.
 */
const drawPrecisionOverlay = (ctx, detections, attributes, showLandmarks) => {
    const canvasWidth = ctx.canvas.width;

    detections.forEach((det, idx) => {
        const box = getDetectionBox(det);
        const attr = attributes[idx];
        const x = Math.round(box.x);
        const y = Math.round(box.y);
        const w = Math.round(box.width);
        const h = Math.round(box.height);
        const corner = Math.max(10, Math.min(20, Math.round(Math.min(w, h) * 0.16)));

        ctx.strokeStyle = "rgba(52, 211, 153, 0.38)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);

        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + corner);
        ctx.lineTo(x, y);
        ctx.lineTo(x + corner, y);
        ctx.moveTo(x + w - corner, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + corner);
        ctx.moveTo(x + w, y + h - corner);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w - corner, y + h);
        ctx.moveTo(x + corner, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + h - corner);
        ctx.stroke();

        if (showLandmarks && det.landmarks && det.landmarks.positions) {
            ctx.fillStyle = "rgba(238, 242, 246, 0.78)";
            ctx.beginPath();
            const pts = det.landmarks.positions;
            for (let i = 0; i < pts.length; i++) {
                const px = pts[i].x;
                const py = pts[i].y;
                ctx.moveTo(px + 1.4, py);
                ctx.arc(px, py, 1.4, 0, Math.PI * 2);
            }
            ctx.fill();
        }

        if (attr) {
            let topEmotion = "";
            let topScore = -1;
            for (const [emotion, score] of Object.entries(attr.expressions || {})) {
                if (score > topScore) {
                    topScore = score;
                    topEmotion = emotion;
                }
            }
            const conf = Math.round(attr.genderProbability * 100);
            const age = Math.round(attr.age);
            const label = topEmotion
                ? `${attr.gender} ${conf}% · ${age}y · ${topEmotion} ${Math.round(topScore * 100)}%`
                : `${attr.gender} ${conf}% · ${age}y`;

            ctx.font = '600 12px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
            const textMetrics = ctx.measureText(label);
            const padX = 8;
            const badgeW = Math.ceil(textMetrics.width) + padX * 2;
            const badgeH = 22;
            const badgeX = Math.max(4, Math.min(x, canvasWidth - badgeW - 4));
            const badgeY = y - badgeH - 6 >= 4 ? y - badgeH - 6 : y + 6;

            ctx.fillStyle = "rgba(10, 12, 15, 0.86)";
            ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
            ctx.fillStyle = "#34d399";
            ctx.fillRect(badgeX, badgeY, 2, badgeH);
            ctx.fillStyle = "#eef2f6";
            ctx.textBaseline = "middle";
            ctx.fillText(label, badgeX + padX, badgeY + badgeH * 0.5);
        }
    });
};

/**
 * Reuses a fixed pool of DOM rows for the Subject Readout inspector so live
 * expression bars update smoothly without DOM churn.
 */
const createReadoutRenderer = () => {
    const emptyEl = document.getElementById("readout-empty");
    const metricsEl = document.getElementById("readout-metrics");
    const faceTabsEl = document.getElementById("face-tabs");
    const ageEl = document.getElementById("metric-age");
    const genderEl = document.getElementById("metric-gender");
    const genderConfEl = document.getElementById("metric-gender-conf");
    const facesEl = document.getElementById("metric-faces");
    const topEmotionEl = document.getElementById("top-emotion-label");
    const listEl = document.getElementById("expressions-list");
    const predictiveResultsEl = document.getElementById("predictive-results");

    let selectedFaceIdx = 0;
    let lastPredictions = [];
    let lastOrderKey = "";
    const rowsByEmotion = new Map();

    EXPRESSION_ORDER.forEach((emotion) => {
        const row = document.createElement("div");
        row.className = "expr-row";

        const nameEl = document.createElement("span");
        nameEl.className = "expr-name";
        nameEl.textContent = emotion;

        const trackEl = document.createElement("div");
        trackEl.className = "expr-track";

        const fillEl = document.createElement("div");
        fillEl.className = "expr-fill";
        trackEl.appendChild(fillEl);

        const pctEl = document.createElement("span");
        pctEl.className = "expr-pct";
        pctEl.textContent = "0%";

        row.append(nameEl, trackEl, pctEl);
        listEl.appendChild(row);
        rowsByEmotion.set(emotion, { row, nameEl, fillEl, pctEl });
    });

    const renderFaceTabs = (count) => {
        if (count <= 1) {
            faceTabsEl.hidden = true;
            selectedFaceIdx = 0;
            return;
        }
        faceTabsEl.hidden = false;
        if (selectedFaceIdx >= count) selectedFaceIdx = 0;

        if (faceTabsEl.childElementCount !== count) {
            faceTabsEl.textContent = "";
            for (let i = 0; i < count; i++) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "face-tab";
                btn.textContent = `Face ${i + 1}`;
                btn.addEventListener("click", () => {
                    selectedFaceIdx = i;
                    render(lastPredictions);
                });
                faceTabsEl.appendChild(btn);
            }
        }

        Array.from(faceTabsEl.children).forEach((btn, idx) => {
            btn.classList.toggle("is-active", idx === selectedFaceIdx);
        });
    };

    const render = (predictions, emptyMessage = null) => {
        lastPredictions = predictions;
        predictiveResultsEl.textContent = JSON.stringify(predictions);

        if (!predictions || predictions.length === 0) {
            faceTabsEl.hidden = true;
            emptyEl.textContent = emptyMessage ||
                "Position a face in the frame to stream live age, gender, and expression estimates.";
            emptyEl.hidden = false;
            metricsEl.hidden = true;
            return;
        }

        renderFaceTabs(predictions.length);
        const face = predictions[selectedFaceIdx] || predictions[0];
        emptyEl.hidden = true;
        metricsEl.hidden = false;

        ageEl.textContent = `${face.age}y`;
        genderEl.textContent = face.gender;
        genderConfEl.textContent = `${face.genderConfidence}% conf`;
        facesEl.textContent = String(predictions.length);

        const sorted = face.expressions || [];
        const dominant = sorted[0];
        topEmotionEl.textContent = dominant
            ? `${dominant.emotion} · ${Math.round(dominant.score * 100)}%`
            : "--";

        const orderKey = sorted.map((item) => item.emotion).join(",");
        const orderChanged = orderKey !== lastOrderKey;
        lastOrderKey = orderKey;

        sorted.forEach((item, rank) => {
            const entry = rowsByEmotion.get(item.emotion);
            if (!entry) return;
            const pct = Math.round(item.score * 100);
            const scale = Math.max(0, Math.min(1, item.score));
            entry.row.classList.toggle("is-dominant", rank === 0);
            entry.fillEl.style.transform = `scaleX(${scale.toFixed(3)})`;
            entry.pctEl.textContent = `${pct}%`;
            if (orderChanged) {
                listEl.appendChild(entry.row);
            }
        });
    };

    return { render };
};

const setStatusIndicator = (state, badgeText) => {
    const dot = document.getElementById("camera-dot");
    const badge = document.getElementById("status-badge");
    if (dot) {
        dot.className = `status-dot is-${state}`;
    }
    if (badge && badgeText) {
        badge.textContent = badgeText;
    }
};

/**
 * Requests camera permission once and exposes a shared promise + retry capability.
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
    document.getElementById("container").style.display = "grid";
    document.getElementById("controls-bar").style.display = "flex";
    document.getElementById("no-permission-message").style.display = "none";
    const introBtn = document.getElementById("intro-toggle-btn");
    if (introBtn) introBtn.disabled = false;

    const videoFeedEl = document.getElementById("video-feed");
    videoFeedEl.srcObject = stream;
    await new Promise((resolve) => {
        if (videoFeedEl.readyState >= 1) {
            resolve();
            return;
        }
        videoFeedEl.addEventListener("loadedmetadata", resolve, { once: true });
    });

    const vw = videoFeedEl.videoWidth || 720;
    const vh = videoFeedEl.videoHeight || 480;
    const aspect = `${vw} / ${vh}`;
    const feedStage = document.getElementById("feed-stage");
    const screenshotContainer = document.getElementById("screenshot-container");
    if (feedStage) feedStage.style.aspectRatio = aspect;
    if (screenshotContainer) screenshotContainer.style.aspectRatio = aspect;

    const placeholder = document.getElementById("camera-placeholder");
    if (placeholder) placeholder.classList.add("is-hidden");

    setStatusIndicator("loading", "Loading Models");
    return { stream, videoFeedEl };
};

window.cameraReadyPromise = initCamera();

const run = async () => {
    try {
        const { videoFeedEl } = await window.cameraReadyPromise;

        const canvas = document.getElementById("canvas");
        const canvasCtx = canvas.getContext("2d");
        const img = document.getElementById("screenshot");
        const screenshotFrame = document.getElementById("screenshot-container");
        const captureMetaEl = document.getElementById("capture-meta");
        const retakeBtn = document.getElementById("retake-btn");
        const sourceLiveBtn = document.getElementById("source-live-btn");
        const sourceSnapBtn = document.getElementById("source-snap-btn");
        const canvasimg = document.getElementById("canvasimg");
        const screenshotCtx = canvasimg.getContext("2d");
        const detectorSelect = document.getElementById("detector-mode");
        const landmarksToggle = document.getElementById("toggle-landmarks");
        const perfStatsEl = document.getElementById("perf-stats");

        const readoutRenderer = createReadoutRenderer();
        const frameCanvas = document.createElement("canvas");
        const frameCtx = frameCanvas.getContext("2d");

        const syncCanvasResolution = () => {
            const vw = videoFeedEl.videoWidth || 720;
            const vh = videoFeedEl.videoHeight || 480;
            if (canvas.width !== vw || canvas.height !== vh) {
                canvas.width = vw;
                canvas.height = vh;
            }
            if (frameCanvas.width !== vw || frameCanvas.height !== vh) {
                frameCanvas.width = vw;
                frameCanvas.height = vh;
            }
        };

        syncCanvasResolution();

        let activeMode = detectorSelect ? detectorSelect.value : "tiny";
        let showLandmarks = landmarksToggle ? landmarksToggle.checked : true;
        let isSwitchingModel = false;
        let readoutSource = "live"; // "live" | "snapshot"
        let snapshotPredictions = [];
        let scanTimerId = null;

        const setReadoutSource = (nextSource) => {
            readoutSource = nextSource;
            if (sourceLiveBtn) sourceLiveBtn.classList.toggle("is-active", nextSource === "live");
            if (sourceSnapBtn) sourceSnapBtn.classList.toggle("is-active", nextSource === "snapshot");

            if (nextSource === "snapshot") {
                readoutRenderer.render(
                    snapshotPredictions,
                    "No face detected in the captured snapshot. Click Retake to capture again."
                );
            } else {
                readoutRenderer.render(window.latestFacePredictions);
            }
        };

        if (sourceLiveBtn) {
            sourceLiveBtn.addEventListener("click", () => setReadoutSource("live"));
        }
        if (sourceSnapBtn) {
            sourceSnapBtn.addEventListener("click", () => {
                if (!sourceSnapBtn.disabled) setReadoutSource("snapshot");
            });
        }

        const analyzeSnapshotCanvas = async (snapCanvas) => {
            if (!faceapi.nets.ageGenderNet.isLoaded || !faceapi.nets.faceExpressionNet.isLoaded) {
                return;
            }
            const detectorOptions = activeMode === "ssd"
                ? SSD_DETECTOR_OPTIONS
                : TINY_DETECTOR_OPTIONS;
            const useTinyLandmarks = activeMode !== "ssd";

            const dets = await faceapi
                .detectAllFaces(snapCanvas, detectorOptions)
                .withFaceLandmarks(useTinyLandmarks)
                .withAgeAndGender()
                .withFaceExpressions();

            snapshotPredictions = formatFacePredictions(dets);
            if (readoutSource === "snapshot") {
                setReadoutSource("snapshot");
            }
        };

        window.captureSnapshot = async ({ scan = true, switchToSnapshot = false } = {}) => {
            if (videoFeedEl.readyState < 2) return false;
            const vw = videoFeedEl.videoWidth || 720;
            const vh = videoFeedEl.videoHeight || 480;
            canvasimg.width = vw;
            canvasimg.height = vh;
            screenshotCtx.drawImage(videoFeedEl, 0, 0, vw, vh);
            img.src = canvasimg.toDataURL("image/png");

            img.classList.add("has-image");
            screenshotFrame.classList.add("has-capture");
            if (retakeBtn) retakeBtn.textContent = "Retake";
            if (sourceSnapBtn) sourceSnapBtn.disabled = false;
            if (captureMetaEl) {
                captureMetaEl.hidden = false;
                captureMetaEl.textContent = new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                });
            }

            if (scan) {
                if (scanTimerId) clearTimeout(scanTimerId);
                screenshotFrame.classList.add("is-scanning");
                scanTimerId = setTimeout(() => {
                    screenshotFrame.classList.remove("is-scanning");
                    scanTimerId = null;
                }, 1300);
            }

            try {
                await analyzeSnapshotCanvas(canvasimg);
                if (switchToSnapshot) {
                    setReadoutSource("snapshot");
                }
            } finally {
                screenshotCtx.clearRect(0, 0, vw, vh);
            }
            return true;
        };

        if (retakeBtn) {
            retakeBtn.addEventListener("click", () => {
                window.captureSnapshot({ scan: true, switchToSnapshot: true });
            });
        }

        window.setRecognitionPaused = (paused) => {
            window.recognitionPaused = Boolean(paused);
            if (window.recognitionPaused) {
                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                setStatusIndicator("paused", "Paused");
            } else {
                setStatusIndicator("live", "Live");
            }
        };

        if (perfStatsEl) {
            perfStatsEl.textContent = "Loading TinyFace (~1.05 MB)...";
        }
        await ensureModelsLoaded(activeMode);
        setStatusIndicator("live", "Live");

        if (detectorSelect) {
            detectorSelect.addEventListener("change", async (event) => {
                const nextMode = event.target.value;
                isSwitchingModel = true;
                setStatusIndicator("loading", "Switching");
                if (perfStatsEl) {
                    perfStatsEl.textContent = nextMode === "ssd"
                        ? "Loading SSD MobileNet..."
                        : "Switching to TinyFace...";
                }
                try {
                    await ensureModelsLoaded(nextMode);
                    activeMode = nextMode;
                    if (img.classList.contains("has-image")) {
                        analyzeSnapshotCanvas(img).catch(() => {});
                    }
                    setStatusIndicator(
                        window.recognitionPaused ? "paused" : "live",
                        window.recognitionPaused ? "Paused" : "Live"
                    );
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
                syncCanvasResolution();
                frameCtx.drawImage(videoFeedEl, 0, 0, frameCanvas.width, frameCanvas.height);

                const detectorOptions = activeMode === "ssd"
                    ? SSD_DETECTOR_OPTIONS
                    : TINY_DETECTOR_OPTIONS;
                const useTinyLandmarks = activeMode !== "ssd";

                const detections = showLandmarks
                    ? await faceapi
                        .detectAllFaces(frameCanvas, detectorOptions)
                        .withFaceLandmarks(useTinyLandmarks)
                    : await faceapi.detectAllFaces(frameCanvas, detectorOptions);

                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

                if (detections.length === 0) {
                    tracker.reset();
                    window.latestFacePredictions = [];
                    if (readoutSource === "live") {
                        readoutRenderer.render([]);
                    }
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

                    const displaySize = { width: canvas.width, height: canvas.height };
                    const resizedDetections = faceapi.resizeResults(detections, displaySize);

                    drawPrecisionOverlay(canvasCtx, resizedDetections, attributes, showLandmarks);
                    canvasHasDrawing = true;

                    const validAttributes = attributes.filter(Boolean);
                    const predictions = formatFacePredictions(validAttributes);
                    window.latestFacePredictions = predictions;
                    if (readoutSource === "live") {
                        readoutRenderer.render(predictions);
                    }

                    if (
                        window.introCompleted &&
                        !screenshotFrame.classList.contains("has-capture")
                    ) {
                        window.captureSnapshot({ scan: true });
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
                    perfStatsEl.textContent = `${label} · ${lmLabel} · ~${effectiveFps} FPS · ${Math.round(emaLatencyMs)} ms`;
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
        setStatusIndicator("error", "Camera Blocked");
        const perfStats = document.getElementById("perf-stats");
        if (perfStats) perfStats.textContent = "Camera unavailable";
        const introBtn = document.getElementById("intro-toggle-btn");
        if (introBtn) introBtn.disabled = true;
        document.getElementById("container").style.display = "none";
        document.getElementById("no-permission-message").style.display = "block";
        console.error("Camera permission denied or initialization failed: ", error);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const retryBtn = document.getElementById("retry-camera-btn");
    if (retryBtn) {
        retryBtn.addEventListener("click", () => {
            setStatusIndicator("loading", "Retrying");
            window.cameraReadyPromise = initCamera();
            run();
            if (typeof window.startIntroSequence === "function") {
                window.startIntroSequence();
            }
        });
    }
});

run();
