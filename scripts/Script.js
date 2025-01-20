// console.log(faceapi)

const run = async () => {
    // load our models
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
    })
    const videoFeedEl = document.getElementById("video-feed")
    videoFeedEl.srcObject = stream
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
        faceapi.nets.ageGenderNet.loadFromUri('./models'),
        faceapi.nets.faceExpressionNet.loadFromUri('./models')
    ])

    // get the video feed element
    const canvas = document.getElementById("canvas")
    canvas.style.left = videoFeedEl.offsetLeft + 'px';
    canvas.style.top = videoFeedEl.offsetTop + 'px';
    canvas.height = videoFeedEl.height
    canvas.width = videoFeedEl.width


    // setup the canvas for screenshot
    let screenshotTaken = false;
    const img = document.getElementById('screenshot');
    const canvasimg = document.getElementById('canvasimg');
    const context = canvasimg.getContext('2d');

    canvasimg.style.left = img.offsetLeft + 'px';
    canvasimg.style.top = img.offsetTop + 'px';
    canvasimg.height = img.height
    canvasimg.width = img.width

    // get the facial detection with points
    setInterval(async () => {
        // get the video feed and hand it to detectAllFaces method
        let faceAIData = await faceapi.detectAllFaces(videoFeedEl).withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions()
        // console.log(faceAIData)
        // draw the data on the canvas
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height)
        // canvas.getContext("2d", { willReadFrequently: true }).clearRect(0, 0, canvas.width, canvas.height)

        // draw our bounding box
        faceAIData = faceapi.resizeResults(faceAIData, videoFeedEl)
        faceapi.draw.drawDetections(canvas, faceAIData)
        faceapi.draw.drawFaceLandmarks(canvas, faceAIData)
        faceapi.draw.drawFaceExpressions(canvas, faceAIData)

        // predict the age and gender with confidence level
        faceAIData.forEach((face) => {
            // const { age, gender, genderProbability } = face
            const { age, gender, genderProbability, expressions } = face
            const genderText = `${gender} - ${Math.round(genderProbability * 100) / 100 * 100}% confidence`
            const ageText = `Age: ${Math.round(age)} years`
            const textField = new faceapi.draw.DrawTextField([genderText, ageText], face.detection.box.topRight)
            textField.draw(canvas)

            // Filter and format emotions with confidence > 0%
            // console.log(expressions)
            const emotionsText = Object.entries(expressions)
                .filter(([emotion, confidence]) => Math.round(confidence * 100) > 0)
                .map(([emotion, confidence]) => `${emotion}: ${Math.round(confidence * 100)}%`)
                .join(" \b ");

            // Update the predictive results
            const predictiveResults = document.getElementById('predictive-results');
            predictiveResults.textContent = `\b Predictive Analysis: \b\b Gender: ${gender} \b (${Math.round(genderProbability * 100)}% confidence) \b\b Age: ${Math.round(age)} years \b\b Emotions: \b ${emotionsText}`;
        })

        if (!screenshotTaken) {
            context.drawImage(videoFeedEl, 0, 0, canvasimg.width, canvasimg.height);
            const screenshotDataUrl = canvasimg.toDataURL("image/png");
            img.src = screenshotDataUrl;
            // console.log("Screenshot taken:", img.src);
            context.clearRect(0, 0, canvasimg.width, canvasimg.height)
            screenshotTaken = true;
            canvasimg.style.display = 'none';
        }
    }, 200)

}

run()