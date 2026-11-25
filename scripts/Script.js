let cameraPermissionGranted = false;
window.latestFacePredictions = [];

/**
 * Formats detected faces into structured prediction objects for UI rendering.
 */
const formatFacePredictions = (resizedData) =>
    resizedData.map((face, index) => {
        const { age, gender, genderProbability, expressions } = face;
        const emotions = Object.entries(expressions)
            .filter(([_, confidence]) => Math.round(confidence * 100) > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([emotion, confidence]) => `${emotion}: ${Math.round(confidence * 100)}%`);

        return {
            faceIndex: index + 1,
            gender,
            genderConfidence: Math.round(genderProbability * 100),
            age: Math.round(age),
            emotions,
        };
    });

/**
 * Requests camera permission once and exposes the shared promise so transition
 * scripts reuse the active stream instead of opening a duplicate camera handle.
 */
const initCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
    });

    cameraPermissionGranted = true;
    document.querySelectorAll("canvas, .typewriter").forEach((el) => {
        el.style.display = "block";
    });
    document.getElementById("container").style.display = "flex";
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

        // Load only the models actively used (faceRecognitionNet removed)
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri("./models"),
            faceapi.nets.faceLandmark68Net.loadFromUri("./models"),
            faceapi.nets.ageGenderNet.loadFromUri("./models"),
            faceapi.nets.faceExpressionNet.loadFromUri("./models"),
        ]);

        const canvas = document.getElementById("canvas");
        const canvasCtx = canvas.getContext("2d");
        canvas.style.left = videoFeedEl.offsetLeft + "px";
        canvas.style.top = videoFeedEl.offsetTop + "px";
        canvas.height = videoFeedEl.height;
        canvas.width = videoFeedEl.width;

        // Set up screenshot canvas
        let screenshotTaken = false;
        const img = document.getElementById("screenshot");
        const canvasimg = document.getElementById("canvasimg");
        const context = canvasimg.getContext("2d");

        canvasimg.style.left = img.offsetLeft + "px";
        canvasimg.style.top = img.offsetTop + "px";
        canvasimg.height = img.height;
        canvasimg.width = img.width;

        const predictiveResults = document.getElementById("predictive-results");
        let isDetecting = false;

        // Perform face detection and draw results without overlapping frames
        setInterval(async () => {
            if (isDetecting || videoFeedEl.readyState < 2 || videoFeedEl.paused) {
                return;
            }
            isDetecting = true;

            try {
                const faceAIData = await faceapi
                    .detectAllFaces(videoFeedEl)
                    .withFaceLandmarks()
                    .withAgeAndGender()
                    .withFaceExpressions();

                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

                const resizedData = faceapi.resizeResults(faceAIData, videoFeedEl);
                faceapi.draw.drawDetections(canvas, resizedData);
                faceapi.draw.drawFaceLandmarks(canvas, resizedData);
                faceapi.draw.drawFaceExpressions(canvas, resizedData);

                resizedData.forEach((face) => {
                    const { age, gender, genderProbability } = face;
                    const genderText = `${gender} - ${Math.round(genderProbability * 100)}% confidence`;
                    const ageText = `Age: ${Math.round(age)} years`;

                    const textField = new faceapi.draw.DrawTextField(
                        [genderText, ageText],
                        face.detection.box.topRight
                    );
                    textField.draw(canvas);
                });

                const predictions = formatFacePredictions(resizedData);
                window.latestFacePredictions = predictions;
                predictiveResults.textContent = JSON.stringify(predictions);

                if (!screenshotTaken) {
                    context.drawImage(videoFeedEl, 0, 0, canvasimg.width, canvasimg.height);
                    img.src = canvasimg.toDataURL("image/png");
                    context.clearRect(0, 0, canvasimg.width, canvasimg.height);
                    screenshotTaken = true;
                    canvasimg.style.display = "none";
                }
            } finally {
                isDetecting = false;
            }
        }, 200);
    } catch (error) {
        cameraPermissionGranted = false;
        document.querySelectorAll("#container, canvas, .typewriter").forEach((el) => {
            el.style.display = "none";
        });
        document.getElementById("no-permission-message").style.display = "block";
        console.error("Camera permission denied or initialization failed: ", error);
    }
};

run();
