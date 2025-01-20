window.onload = function () {
    // Get references to the lines and videos
    const line1 = document.querySelector('.line1');
    const line2 = document.querySelector('.line2');
    const line3 = document.querySelector('.line3');
    const line4 = document.querySelector('.line4');
    const HackVideo = document.getElementById('hack-video');
    const WebVideo = document.getElementById('video-feed');

    // Helper function to update line content and styles
    const updateLine = (line, text, delay, additionalClasses = []) => {
        setTimeout(() => {
            line.style.display = 'block';
            line.style.visibility = 'visible';
            line.textContent = text;
            line.className = 'boxdims'; // Clear existing classes
            line.classList.add(...['typinganimation', 'z-index-999', ...additionalClasses]);
            // setTimeout(() => {
            //     line.classList.add(...['typinganimation', 'z-index-999', ...additionalClasses]);
            // }, 3000);
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

    // Sequence execution
    setTimeout(() => {
        // Remove initial lines
        [line1, line2, line3].forEach(line => (line.style.display = 'none'));

        // Move line4 content to line2 and start animation
        line2.textContent = line4.textContent;
        line2.style.visibility = 'hidden';

        setTimeout(async () => {
            line2.style.display = 'block';
            line2.style.visibility = 'visible';
            line2.classList.add('typinganimation');

            // Add blink and blackout effects
            createEffect('blink', 3500, 1000);
            createEffect('blackout', 4500);

            // Switch to hack video
            setTimeout(() => {
                WebVideo.style.display = 'none';
                HackVideo.src = './images/hack-video.mp4';
                HackVideo.style.display = 'block';
                HackVideo.classList.add('z-index-999');

                // Show hack simulation lines
                updateLine(line1, 'System override initiated...', 0);
                updateLine(line2, 'Firewall breached. Accessing secured data...', 3500);
                updateLine(line3, 'Injecting scripts to escalate privileges...', 8500);

                // End prank and reset
                setTimeout(() => {
                    [line1, line3].forEach(line => {
                        line.style.visibility = 'hidden';
                        line.style.display = 'none';
                    });
                    line2.textContent = 'Just kidding! No hack here—stay still for the recognition process...';
                    line2.className = 'boxdims'; // Clear classes
                    setTimeout(() => {
                        line2.classList.add('typinganimation', 'z-index-999');
                    }, 3000);
                    updateLine(line3, 'Completed...', 12000);

                    setTimeout(() => {
                        document.body
                            .querySelectorAll('.blackout')
                            .forEach((effectDiv) => effectDiv.remove()); // Remove blackout effect
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
                }, 14500);
            }, 4500);
        }, 100); // Slight delay to apply animation
    }, 13500); // Initial delay before sequence starts
};
