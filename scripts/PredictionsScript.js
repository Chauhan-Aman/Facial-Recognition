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

    // get the facial detection with points
    setInterval(async () => {
        // get the video feed and hand it to detectAllFaces method
        let faceAIData = await faceapi.detectAllFaces(videoFeedEl).withFaceLandmarks().withFaceDescriptors().withAgeAndGender().withFaceExpressions()
        // console.log(faceAIData)
        // draw the data on the canvas
        // canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height)
        canvas.getContext("2d", { willReadFrequently: true }).clearRect(0, 0, canvas.width, canvas.height)

        // draw our bounding box
        faceAIData = faceapi.resizeResults(faceAIData, videoFeedEl)
        faceapi.draw.drawDetections(canvas, faceAIData)
        faceapi.draw.drawFaceLandmarks(canvas, faceAIData)
        faceapi.draw.drawFaceExpressions(canvas, faceAIData)

        // predict the age and gender with confidence level
        faceAIData.forEach((face) => {
            const { age, gender, genderProbability } = face
            const genderText = `${gender} - ${Math.round(genderProbability * 100) / 100 * 100}% confidence`
            const ageText = `Age: ${Math.round(age)} years`
            const textField = new faceapi.draw.DrawTextField([genderText, ageText], face.detection.box.topRight)
            textField.draw(canvas)
        })
    }, 200)
}

run()