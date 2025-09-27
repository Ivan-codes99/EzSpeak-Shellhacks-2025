document.addEventListener('DOMContentLoaded', () => {
    let audioStream = null;
    let audioContext = null;
    let analyser = null;
    let animationId = null;
    let gainNode = null;
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const statusDiv = document.getElementById('status');

    // Automatically start capturing tab audio when the side panel opens
    chrome.tabCapture.capture({ audio: true, video: false }, function(stream) {
        if (!stream) {
            statusDiv.textContent = 'Tab audio capture failed: ' + (chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Unknown error');
            return;
        }
        statusDiv.textContent = 'Capturing tab audio...';
        audioStream = stream;
        startAudioVisualization(stream);
    });

    function setAudioLevel(level) {
        const bar = document.getElementById('audio-indicator');
        bar.style.width = Math.round(level * 100) + '%';
    }

    volumeSlider.addEventListener('input', function(e) {
        const val = parseFloat(e.target.value);
        volumeValue.textContent = Math.round(val * 100) + '%';
        if (gainNode) gainNode.gain.value = val;
    });

    function startAudioVisualization(stream) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        gainNode = audioContext.createGain();
        gainNode.gain.value = parseFloat(volumeSlider.value);
        // Connect source to gainNode and then to destination for playback
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        // Connect source to analyser for visualization
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        function animate() {
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += Math.abs(dataArray[i] - 128);
            }
            setAudioLevel(sum / dataArray.length / 128);
            animationId = requestAnimationFrame(animate);
        }
        animate();
    }
});
