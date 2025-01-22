// console.log(faceapi)
let cameraPermissionGranted = false; 

const run = async () => {
    try {
        // Request camera permissions
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
        });

        cameraPermissionGranted = true;
        document.querySelectorAll("canvas, .typewriter").forEach(el => {
            el.style.display = "block";
        });
        document.getElementById('container').style.display = "flex";
        // Hide the no-permission message
        document.getElementById("no-permission-message").style.display = "none";



        // If permission granted, set up video feed
        const videoFeedEl = document.getElementById("video-feed");
        videoFeedEl.srcObject = stream;

        // Load models
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
            faceapi.nets.ageGenderNet.loadFromUri('./models'),
            faceapi.nets.faceExpressionNet.loadFromUri('./models')
        ]);

        const canvas = document.getElementById("canvas");
        canvas.style.left = videoFeedEl.offsetLeft + 'px';
        canvas.style.top = videoFeedEl.offsetTop + 'px';
        canvas.height = videoFeedEl.height;
        canvas.width = videoFeedEl.width;

        // Set up screenshot canvas
        let screenshotTaken = false;
        const img = document.getElementById('screenshot');
        const canvasimg = document.getElementById('canvasimg');
        const context = canvasimg.getContext('2d');

        canvasimg.style.left = img.offsetLeft + 'px';
        canvasimg.style.top = img.offsetTop + 'px';
        canvasimg.height = img.height;
        canvasimg.width = img.width;

        // Perform face detection and draw results
        setInterval(async () => {
            const faceAIData = await faceapi
                .detectAllFaces(videoFeedEl)
                .withFaceLandmarks()
                .withFaceDescriptors()
                .withAgeAndGender()
                .withFaceExpressions();

            canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);

            const resizedData = faceapi.resizeResults(faceAIData, videoFeedEl);
            faceapi.draw.drawDetections(canvas, resizedData);
            faceapi.draw.drawFaceLandmarks(canvas, resizedData);
            faceapi.draw.drawFaceExpressions(canvas, resizedData);

            resizedData.forEach((face) => {
                const { age, gender, genderProbability, expressions } = face;
                const genderText = `${gender} - ${Math.round(genderProbability * 100)}% confidence`;
                const ageText = `Age: ${Math.round(age)} years`;

                const textField = new faceapi.draw.DrawTextField([genderText, ageText], face.detection.box.topRight);
                textField.draw(canvas);

                const emotionsText = Object.entries(expressions)
                    .filter(([_, confidence]) => Math.round(confidence * 100) > 0)
                    .map(([emotion, confidence]) => `${emotion}: ${Math.round(confidence * 100)}%`)
                    .join("\b ");

                const predictiveResults = document.getElementById('predictive-results');
                predictiveResults.textContent = `\b Predictive Analysis: \b\b Gender: ${gender} \b (${Math.round(genderProbability * 100)}% Confidence) \b\b Age: ${Math.round(age)} years \b\b Emotions: \b ${emotionsText}`;
            });

            if (!screenshotTaken) {
                context.drawImage(videoFeedEl, 0, 0, canvasimg.width, canvasimg.height);
                img.src = canvasimg.toDataURL("image/png");
                context.clearRect(0, 0, canvasimg.width, canvasimg.height);
                screenshotTaken = true;
                canvasimg.style.display = 'none';
            }
        }, 200);
    } catch (error) {
        // If permission is denied or any error occurs, display a message
        cameraPermissionGranted = false;
        document.querySelectorAll("#container, canvas, .typewriter").forEach(el => {
            el.style.display = "none";
        });
        document.getElementById("no-permission-message").style.display = "block";
        console.error("Camera permission denied: ", error);
    }
};

run();