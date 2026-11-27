window.addEventListener("DOMContentLoaded", async () => {
    const hackVideo = document.getElementById("hack-video");
    const webVideo = document.getElementById("video-feed");
    const workspace = document.getElementById("container");
    const inspector = document.getElementById("analyze-results");
    const statusPrimary = document.getElementById("status-primary");
    const statusSecondary = document.getElementById("status-secondary");
    const introToggleBtn = document.getElementById("intro-toggle-btn");
    const screenshotFrame = document.getElementById("screenshot-container");
    const countdownHud = document.getElementById("countdown-hud");

    let activeAbort = null;
    window.introCompleted = false;

    const wait = (ms, signal) =>
        new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
            }
            const timer = setTimeout(() => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            }, ms);
            const onAbort = () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            };
            signal?.addEventListener("abort", onAbort, { once: true });
        });

    /**
     * Smoothly updates status captions using GPU-composited opacity/transform transitions.
     */
    const setStatus = (primary, secondary = "", variant = "") => {
        statusPrimary.classList.remove("is-visible", "is-terminal", "is-accent");
        statusSecondary.classList.remove("is-visible");
        void statusPrimary.offsetWidth;

        statusPrimary.textContent = primary;
        if (variant === "terminal") statusPrimary.classList.add("is-terminal");
        if (variant === "accent") statusPrimary.classList.add("is-accent");
        statusPrimary.classList.add("is-visible");

        if (secondary) {
            statusSecondary.textContent = secondary;
            statusSecondary.classList.add("is-visible");
        } else {
            statusSecondary.textContent = "";
        }
    };

    const setHud = (text) => {
        if (!countdownHud) return;
        if (!text) {
            countdownHud.hidden = true;
            countdownHud.textContent = "";
            return;
        }
        countdownHud.textContent = text;
        countdownHud.hidden = false;
    };

    const triggerShutterFlash = () => {
        const flash = document.createElement("div");
        flash.className = "blink";
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 450);
    };

    const setBlackout = (enabled) => {
        document.querySelectorAll(".blackout").forEach((el) => el.remove());
        if (!enabled) return;
        const overlay = document.createElement("div");
        overlay.className = "blackout";
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add("is-active"));
    };

    const openInspector = ({ triggerScan = true } = {}) => {
        workspace.classList.add("has-inspector");
        inspector.classList.add("is-visible");
        requestAnimationFrame(() => {
            inspector.classList.add("is-entered");
        });

        const hasCapture = screenshotFrame.classList.contains("has-capture");
        if (!hasCapture && typeof window.captureSnapshot === "function") {
            window.captureSnapshot({ scan: triggerScan });
        } else if (triggerScan) {
            screenshotFrame.classList.add("is-scanning");
            setTimeout(() => screenshotFrame.classList.remove("is-scanning"), 1300);
        }
    };

    const cleanupVisualEffects = () => {
        setHud("");
        setBlackout(false);
        hackVideo.pause();
        hackVideo.style.display = "none";
        if (hackVideo.hasAttribute("src")) {
            hackVideo.removeAttribute("src");
            hackVideo.load();
        }
        webVideo.style.display = "block";
        if (typeof window.setRecognitionPaused === "function") {
            window.setRecognitionPaused(false);
        }
    };

    const finishToLiveMode = ({ triggerScan = true } = {}) => {
        window.introCompleted = true;
        cleanupVisualEffects();
        openInspector({ triggerScan });
        setStatus(
            "Live biometric tracking active.",
            "Toggle Live / Snapshot in the readout panel, or click Retake anytime.",
            "accent"
        );
        if (introToggleBtn) {
            introToggleBtn.textContent = "Replay Intro";
        }
    };

    const runIntroSequence = async () => {
        if (activeAbort) activeAbort.abort();
        activeAbort = new AbortController();
        const { signal } = activeAbort;

        window.introCompleted = false;
        if (introToggleBtn) {
            introToggleBtn.textContent = "Skip Intro";
        }

        // Collapse inspector while intro runs so camera stage takes center focus
        inspector.classList.remove("is-entered", "is-visible");
        workspace.classList.remove("has-inspector");

        try {
            await window.cameraReadyPromise;

            setStatus(
                "Camera ready — center your face in the frame.",
                "Click Skip Intro or press Esc anytime to jump straight to live analysis."
            );
            await wait(2200, signal);

            setStatus("Capturing reference portrait...", "Hold steady and look toward the camera.");
            setHud("CAPTURING IN 3");
            await wait(1000, signal);

            setHud("CAPTURING IN 2");
            await wait(1000, signal);

            setHud("CAPTURING IN 1");
            await wait(1000, signal);

            setHud("CAPTURED");
            setStatus("Smile! Reference portrait captured.", "Preparing analysis...", "accent");
            if (typeof window.captureSnapshot === "function") {
                window.captureSnapshot({ scan: false });
            }
            triggerShutterFlash();
            await wait(900, signal);
            setHud("");

            // Playful hacking prank sequence (non-blocking — Skip Intro remains interactive)
            if (typeof window.setRecognitionPaused === "function") {
                window.setRecognitionPaused(true);
            }
            setBlackout(true);
            webVideo.style.display = "none";
            if (!hackVideo.getAttribute("src")) {
                hackVideo.src = "./images/hack-video.mp4";
            }
            hackVideo.currentTime = 0;
            hackVideo.style.display = "block";
            hackVideo.play().catch(() => {});

            setStatus("System override initiated...", "Escalating local viewport privileges...", "terminal");
            await wait(2000, signal);

            setStatus("Firewall bypassed. Accessing local biometric node...", "Decrypting telemetry stream...", "terminal");
            await wait(2200, signal);

            setStatus(
                "Just kidding — no hack here.",
                "Restoring live camera feed and opening your readout...",
                "accent"
            );
            await wait(2200, signal);

            triggerShutterFlash();
            finishToLiveMode({ triggerScan: true });
        } catch (err) {
            if (err && err.name === "AbortError") {
                return;
            }
            console.error("Intro sequence aborted or camera unavailable:", err);
        }
    };

    const skipIntro = () => {
        if (activeAbort) activeAbort.abort();
        finishToLiveMode({ triggerScan: true });
    };

    if (introToggleBtn) {
        introToggleBtn.addEventListener("click", () => {
            if (window.introCompleted) {
                runIntroSequence();
            } else {
                skipIntro();
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !window.introCompleted) {
            skipIntro();
        }
    });

    window.startIntroSequence = runIntroSequence;
    runIntroSequence();
});
