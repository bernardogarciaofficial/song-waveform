// Assuming variables: recordBtn, isRecording, audioBuffer, mediaStream, video, runCountdown, startRecording, recIndicator, blinkRecIndicator, stopBlinkRecIndicator, recordedChunks, recordedVideoBlob, videoSlaveMode, playBtn, stopBtn, playAudioWithRecording, setRecordedVideoAsSource, pausedAt

recordBtn.addEventListener('click', async () => {
  if (isRecording) return;
  if (!audioBuffer) return;
  // Request camera access first
  try {
    // Check MediaRecorder API support
    if (!window.MediaRecorder) {
      alert("MediaRecorder API not supported in this browser.");
      return;
    }
    // Request camera
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = mediaStream;
    await video.play();
    await runCountdown(3);
    startRecording(); // will start both video & audio in sync
  } catch (err) {
    alert("Could not access camera. Make sure you use HTTPS and allow camera access.");
  }
});

function startRecording() {
  isRecording = true;
  recordedChunks = [];
  recIndicator.classList.remove('hidden');
  blinkRecIndicator();
  recordedVideoBlob = null;
  videoSlaveMode = false;

  // Setup MediaRecorder
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };
  mediaRecorder.onstop = () => {
    stopBlinkRecIndicator();
    recIndicator.classList.add('hidden');
    recordedVideoBlob = new Blob(recordedChunks, { type: 'video/webm' });
    setRecordedVideoAsSource();
    videoSlaveMode = true;
    playBtn.disabled = false;
    stopBtn.disabled = false;
    recordBtn.disabled = false;
  };

  mediaRecorder.start();

  // Play audio in sync with video
  pausedAt = 0;
  playBtn.disabled = true;
  stopBtn.disabled = false;
  recordBtn.disabled = true;
  playAudioWithRecording();
}
