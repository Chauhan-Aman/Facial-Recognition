window.onload = function () {
    const line1 = document.querySelector('.line1');
    const line2 = document.querySelector('.line2');
    const line3 = document.querySelector('.line3');
    const HackVideo = document.getElementById('hack-video');
    const WebVideo = document.getElementById('video-feed');
    const ScreenshotDiv = document.getElementById('anaylzeResults');
    const canvas = document.getElementById("canvas")

    const updateLine = (line, text, delay, additionalClasses = []) => {
        setTimeout(() => {
            line.style.display = 'block';
            line.style.visibility = 'visible';
            line.textContent = text;
            line.className = 'boxdims';
            line.classList.add(...['typinganimation', 'z-index-999', ...additionalClasses]);
        }, delay);
    };

    // Helper function for creating effects
    const createEffect = (className, delay, removeAfter = null) => {
        setTimeout(() => {
            const effectDiv = document.createElement('div');
            effectDiv.classList.add(className);
            document.body.appendChild(effectDiv);

            if (removeAfter) {
                setTimeout(() => effectDiv.remove(), removeAfter);
            }
        }, delay);
    };

    const displayPrectiveResults = () => {
        const predectiveresults = document.getElementById('predictive-results');
        // const textContent = "Predictive Analysis: \b Gender: Male (98% confidence) \b Age: 25 years \b Emotion: Happy (80% confidence) \b Glasses: Yes (95% confidence) \b Facial Hair: Yes (85% confidence) \b Hair Color: Black (90% confidence) \b Hair Style: Short (80% confidence) \b Skin Tone: Light (70% confidence) \b Clothing: Casual (95% confidence) \b Accessories: None (100% confidence) \b Additional Notes: Subject is wearing a cap and has a tattoo on the right arm.";
        // updateLine(results, textContent, 0);

        // const textContent = "\b Predictive Analysis: \b\b Gender: Male \b (98% confidence) \b\b Age: 25 years \b\b Emotion: Happy \b (80% confidence)";
        textContent = predectiveresults.textContent;
        const results = document.getElementById("anaylzeResults");

        const extractLines = (input) => {
            const lines = [];
            let currentLine = "";
            let newlineCount = 0;

            for (let i = 0; i < input.length; i++) {
                if (input[i] === "\b") {
                    newlineCount++;
                } else {
                    if (newlineCount > 0) {
                        if (currentLine.trim() !== "") lines.push(currentLine.trim());
                        currentLine = "";

                        for (let j = 0; j < newlineCount - 1; j++) lines.push("");
                        newlineCount = 0;
                    }
                    currentLine += input[i];
                }
            }

            if (currentLine.trim() !== "") lines.push(currentLine.trim());
            return lines;
        };

        const lines = extractLines(textContent);
        // console.log(lines);

        let lineIndex = 0;
        let charIndex = 0;

        const typeLine = () => {
            if (lineIndex < lines.length) {
                const lineText = lines[lineIndex];

                let lineElement = document.querySelector(`#line-${lineIndex}`);
                if (!lineElement) {
                    lineElement = document.createElement("div");
                    lineElement.id = `line-${lineIndex}`;
                    lineElement.className = "line";

                    if (lineText === "") lineElement.style.height = "1em";
                    results.appendChild(lineElement);
                }

                if (lineText !== "") {
                    lineElement.textContent += lineText[charIndex];
                    charIndex++;

                    if (charIndex < lineText.length) {
                        setTimeout(typeLine, 50);
                    } else {
                        charIndex = 0;
                        lineIndex++;
                        setTimeout(typeLine, 300);
                    }
                } else {
                    lineIndex++;
                    setTimeout(typeLine, 300);
                }
            }
        };

        typeLine();
    }


    const startEnhancedScanningEffect = () => {
        const screenshotContainer = document.getElementById('screenshot-container');
        const overlay = document.querySelector('.scanning-overlay');
        const bar = document.querySelector('.scanning-bar');

        screenshotContainer.style.display = 'block';
        overlay.style.opacity = '1';
        bar.style.opacity = '1';

        setTimeout(() => {
            overlay.style.opacity = '0';
            bar.style.opacity = '0';
            displayPrectiveResults();
            updateLine(line1, 'The predictive results are approximate and may vary.', 11000);
            updateLine(line2, 'Please consider them as indicative rather than definitive.', 16000);
        }, 10000);
    }

    const performFinalTransition = () => {
        WebVideo.style.display = 'block';
        WebVideo.style.opacity = 0;
        ScreenshotDiv.style.display = 'block';
        ScreenshotDiv.style.opacity = 0;

        setTimeout(() => {
            WebVideo.style.transition = 'opacity 0s ease-in';
            WebVideo.style.opacity = 1;

            // console.log('Final transition')

            setTimeout(async () => {
                WebVideo.style.transition = 'transform 1.2s ease-in-out';
                ScreenshotDiv.style.transition = 'transform 0.8s ease-in-out, opacity 1s ease-in';

                WebVideo.style.transform = 'translateX(-15%)';
                ScreenshotDiv.classList.add('analyzeTransition')
                ScreenshotDiv.style.transform = 'translateX(30%)';
                ScreenshotDiv.classList.remove('analyzeTransition')
                ScreenshotDiv.style.opacity = 1;

                canvas.style.left = WebVideo.offsetLeft + 'px';
                canvas.style.top = WebVideo.offsetTop + 'px';
                canvas.style.transform = 'translateX(-15%)';
                canvas.height = WebVideo.height
                canvas.width = WebVideo.width
                setTimeout(() => {
                    canvas.classList.add('z-index-999');
                    canvas.style.position = 'absolute';
                    canvas.style.display = 'block';
                }, 3000);

            }, 1000);
            startEnhancedScanningEffect()
        }, 500);
    };

    // Sequence execution
    setTimeout(() => {
        [line1, line2, line3].forEach(line => (line.style.display = 'none'));

        line2.textContent = "3... 2... 1... Smile!";
        line2.style.visibility = 'hidden';

        setTimeout(async () => {
            line2.style.display = 'block';
            line2.style.visibility = 'visible';
            line2.classList.add('typinganimation');

            createEffect('blink', 3500, 1000);
            createEffect('blackout', 4500);

            setTimeout(() => {
                WebVideo.style.display = 'none';
                canvas.style.display = 'none';
                HackVideo.src = './images/hack-video.mp4';
                HackVideo.style.display = 'block';
                HackVideo.classList.add('z-index-999');

                updateLine(line1, 'System override initiated...', 0);
                updateLine(line2, 'Firewall breached. Accessing secured data...', 3500);
                updateLine(line3, 'Injecting scripts to escalate privileges...', 8500);

                setTimeout(() => {
                    [line1, line3].forEach(line => {
                        line.style.visibility = 'hidden';
                        line.style.display = 'none';
                    });
                    line2.textContent = 'Just kidding! No hack here—stay still for the recognition process...';
                    line2.className = 'boxdims';
                    setTimeout(() => {
                        line2.classList.add('typinganimation', 'z-index-999');
                    }, 3000);
                    updateLine(line3, 'Completed...', 10000);

                    setTimeout(() => {
                        document.body
                            .querySelectorAll('.blackout')
                            .forEach((effectDiv) => effectDiv.remove());
                        createEffect('blink', 100, 1000);
                        HackVideo.style.display = 'none';
                        setTimeout(() => {
                            WebVideo.style.display = 'block';
                        }, 100);
                        [line2, line3].forEach(line => {
                            line.style.visibility = 'hidden';
                            line.style.display = 'none';
                        });
                    }, 14500);
                    setTimeout(() => {
                        performFinalTransition();
                    }, 15000);
                }, 14500);
            }, 4500);
        }, 100);
    }, 13500);
};