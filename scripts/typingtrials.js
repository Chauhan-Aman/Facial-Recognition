window.onload = function () {
    // Get references to the lines
    const line1 = document.querySelector('.line1');
    const line2 = document.querySelector('.line2');
    const line3 = document.querySelector('.line3');
    const line4 = document.querySelector('.line4');

    // Wait for the completion of the 3rd line typing, and then modify the DOM
    setTimeout(function () {
        // Remove the first 3 lines
        line1.style.display = 'none';
        line2.style.display = 'none';
        line3.style.display = 'none';

        // Move the text from line4 to line2
        line2.textContent = line4.textContent;
        line2.style.visibility = 'hidden';  // Hide line2 initially
        line2.classList.remove('line2');  // Remove the previous line classes

        // Start the animation of line2 (typing effect)
        setTimeout(function () {
            line2.style.display = 'block';  // Make line2 visible
            line2.style.visibility = 'visible'; // Make line2 visible after a slight delay
            line2.classList.add('typinganimation');  // Apply the typewriter effect to line2 with the new text

            // Add blink and blackout effects after line4 is fully typed
            setTimeout(function () {
                // Create a blink effect
                const blinkDiv = document.createElement('div');
                blinkDiv.classList.add('blink');
                document.body.appendChild(blinkDiv);

                // After blink, create a blackout effect
                setTimeout(function () {
                    const blackoutDiv = document.createElement('div');
                    blackoutDiv.classList.add('blackout');
                    document.body.appendChild(blackoutDiv);
                    blinkDiv.remove(); // Remove blink effect
                }, 1000); // Wait for blink animation to finish

                const HackVideo = document.getElementById('hack-video');
                const WebVideo = document.getElementById('video-feed');
                WebVideo.style.display = 'none';
                HackVideo.src = './images/hack-video.mp4';
                HackVideo.style.display = 'block';
                HackVideo.classList.add('z-index-999');

                line1.classList.remove('line1');
                line1.style.display = 'block';
                line1.style.visibility = 'visible';
                line1.textContent = "System override initiated..."
                line1.classList.add('typinganimation', 'z-index-999');

                setTimeout(() => {
                    line2.classList.remove('typinganimation');
                    line2.style.display = 'block';
                    line2.style.visibility = 'visible';
                    line2.textContent = "Firewall breached. Accessing secured data..."
                    line2.classList.add('typinganimation', 'z-index-999');
                }, 3500);

                setTimeout(() => {
                    line3.classList.remove('line3');
                    line3.style.display = 'block';
                    line3.style.visibility = 'visible';
                    line3.textContent = "Injecting scripts to escalate privileges..."
                    line3.classList.add('typinganimation', 'z-index-999');
                }, 8500);

                setTimeout(() => {
                    line2.classList.remove('typinganimation', 'z-index-999');
                    line1.style.visibility = 'hidden';  
                    line1.style.display = 'none';
                    line3.style.visibility = 'hidden';
                    line3.style.display = 'none';
                    // line4.style.display = 'block';
                    line2.style.visibility = 'visible';
                    line2.textContent = "Just kidding! No hack here—stay still for the recognition process..."
                    line2.classList.add('typinganimation', 'z-index-999');
                }, 14500);

            }, 3.5 * 1000);

        }, 100);  // Slight delay to allow the animation to apply
    }, 13.5 * 1000); // After 13.5 seconds (3.5s x 3 lines + 5s delay after each line)
};
