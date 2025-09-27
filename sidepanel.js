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
        startAzureSpeechRecognition(stream); // <-- Add this line
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

    // Azure Speech SDK integration
    function startAzureSpeechRecognition(stream) {
        if (!window.SpeechSDK) {
            statusDiv.textContent = 'Azure Speech SDK not loaded.';
            return;
        }
        // Replace with your actual Azure Speech key and region, or load securely
        const AZURE_SPEECH_KEY = '<YOUR_AZURE_SPEECH_KEY>';
        const AZURE_REGION = '<YOUR_AZURE_REGION>';
        if (!AZURE_SPEECH_KEY || !AZURE_REGION) {
            statusDiv.textContent = 'Azure Speech key/region not set.';
            return;
        }
        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(AZURE_SPEECH_KEY, AZURE_REGION);
        speechConfig.speechRecognitionLanguage = 'en-US';
        // Create a PushAudioInputStream for feeding PCM data
        const pushStream = SpeechSDK.AudioInputStream.createPushStream();
        const audioConfig = SpeechSDK.AudioConfig.fromStreamInput(pushStream);
        const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
        recognizer.recognizing = function(s, e) {
            statusDiv.textContent = 'Recognizing: ' + e.result.text;
        };
        recognizer.recognized = function(s, e) {
            if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
                statusDiv.textContent = 'Recognized: ' + e.result.text;
            }
        };
        recognizer.canceled = function(s, e) {
            statusDiv.textContent = 'Recognition canceled: ' + e.errorDetails;
        };
        recognizer.sessionStopped = function() {
            statusDiv.textContent = 'Recognition session stopped.';
        };
        recognizer.startContinuousRecognitionAsync();
        // Feed PCM data from the stream to the pushStream
        feedPCMToPushStream(stream, pushStream);
    }

    function feedPCMToPushStream(stream, pushStream) {
        // Use AudioContext to process the stream
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const source = context.createMediaStreamSource(stream);
        // Azure expects 16kHz mono PCM, so we need to downsample
        const processor = context.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(context.destination); // Keep node alive
        processor.onaudioprocess = function(e) {
            const input = e.inputBuffer.getChannelData(0);
            const downsampled = downsampleBuffer(input, context.sampleRate, 16000);
            const pcm16 = floatTo16BitPCM(downsampled);
            pushStream.write(pcm16);
        };
        stream.getAudioTracks()[0].addEventListener('ended', function() {
            pushStream.close();
            processor.disconnect();
            source.disconnect();
            context.close();
        });
    }

    function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
        if (outputSampleRate === inputSampleRate) {
            return buffer;
        }
        const sampleRateRatio = inputSampleRate / outputSampleRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;
        while (offsetResult < result.length) {
            const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
            let accum = 0, count = 0;
            for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                accum += buffer[i];
                count++;
            }
            result[offsetResult] = count > 0 ? accum / count : 0;
            offsetResult++;
            offsetBuffer = nextOffsetBuffer;
        }
        return result;
    }

    function floatTo16BitPCM(floatBuffer) {
        const output = new DataView(new ArrayBuffer(floatBuffer.length * 2));
        for (let i = 0; i < floatBuffer.length; i++) {
            let s = Math.max(-1, Math.min(1, floatBuffer[i]));
            output.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return new Uint8Array(output.buffer);
    }
});
