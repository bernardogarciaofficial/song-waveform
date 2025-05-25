const audioUpload = document.getElementById('audio-upload');
const waveformCanvas = document.getElementById('waveform');
const barMarkers = document.getElementById('bar-markers');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const recordBtn = document.getElementById('record-btn');
const recIndicator = document.getElementById('rec-indicator');
const countdownEl = document.getElementById('countdown');
const videoContainer = document.getElementById('video-container');
const video = document.getElementById('video');

let audioContext;
let audioBuffer;
let sourceNode;
let animationId;
let startTime;
let pausedAt = 0;
let isPlaying = false;
let duration = 0;
let bpm = 120; // Default, can auto-detect with 3rd-party libs
let bars = 0;
let secondsPerBar = 0;

// Video recording
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recBlinkInterval = null;
let recordedVideoBlob = null;
let videoSlaveMode = false; // True when video must follow audio controls

function resetWaveform() {
  const ctx = waveformCanvas.getContext('2d');
  ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  barMarkers.innerHTML = '';
}

function drawWaveform(buffer, _bpm = 120) {
  bpm = _bpm;
  duration = buffer.duration;
  bars = Math.ceil(duration / (60 / bpm * 4));
  secondsPerBar = 60 / bpm * 4;

  const dpr = window.devicePixelRatio || 1;
  waveformCanvas.width = waveformCanvas.offsetWidth * dpr;
  waveformCanvas.height = waveformCanvas.offsetHeight * dpr;
  const ctx = waveformCanvas.getContext('2d');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, waveformCanvas.offsetWidth, waveformCanvas.offsetHeight);

  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  const data = buffer.getChannelData(0);
  const step = Math.floor(data.length / waveformCanvas.offsetWidth);
  const amp = waveformCanvas.offsetHeight / 2;
  for (let i = 0; i < waveformCanvas.offsetWidth; i++) {
    let min = 1.0, max = -1.0;
    for (let j = 0; j < step; j++) {
      let datum = data[(i * step) + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    ctx.moveTo(i, amp * (1 + min));
    ctx.lineTo(i, amp * (1 + max));
  }
  ctx.stroke();

  barMarkers.innerHTML = '';
  const totalChunks = Math.ceil(bars / 8);
  for (let chunk = 1; chunk < totalChunks; chunk++) {
    const chunkTime = chunk * 8 * secondsPerBar;
    const x = chunkTime / duration * waveformCanvas.offsetWidth;
    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.left = `${x}px`;
    marker.style.top = '0';
    marker.style.height = '100%';
    marker.style.width = '2px';
    marker.style.background = '#facc15';
    marker.style.opacity = '0.45';
    barMarkers.appendChild(marker);

    const label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.left = `${x + 2}px`;
    label.style.top = '4px';
    label.style.color = '#facc15';
    label.style.fontSize = '12px';
    label.textContent = `${chunk * 8} bars`;
    barMarkers.appendChild(label);
  }
}

function renderPlayhead(currentTime) {
  let playhead = document.getElementById('playhead');
  if (!playhead) {
    playhead = document.createElement('div');
    playhead.id = 'playhead';
    playhead.style.position = 'absolute';
    playhead.style.width = '2px';
    playhead.style.top = '0';
    playhead.style.height = '100%';
    playhead.style.background = '#22d3ee';
    playhead.style.zIndex = '10';
    barMarkers.appendChild(playhead);
  }
  const x = (currentTime / duration) * waveformCanvas.offsetWidth;
  playhead.style.left = `${x}px`;
}

function removePlayhead() {
  const playhead = document.getElementById('playhead');
  if (playhead) playhead.remove();
}

async function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function estimateBPM(buffer) {
  return 120;
}

audioUpload.addEventListener('change', async (e) => {
  resetWaveform();
  if (audioContext) audioContext.close();
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const file = e.target.files[0];
  if (!file) return;
  playBtn.disabled = true;
  stopBtn.disabled = true;
  recordBtn.disabled = true;

  try {
    const arrBuffer = await fileToArrayBuffer(file);
    audioBuffer = await audioContext.decodeAudioData(arrBuffer);

    const detectedBPM = await estimateBPM(audioBuffer);
    drawWaveform(audioBuffer, detectedBPM);

    playBtn.disabled = false;
    stopBtn.disabled = false;
    recordBtn.disabled = false;
    pausedAt = 0;
    isPlaying = false;

    // If there is a recorded video, set it as the video source
    if (recordedVideoBlob) {
      setRecordedVideoAsSource();
    } else {
      video.srcObject = null;
      video.src = "";
      video.removeAttribute('controls');
      video.setAttribute('muted', '');
      video.pause();
    }
  } catch (err) {
    alert("Could not decode audio file.");
    playBtn.disabled = true;
    stopBtn.disabled = true;
    recordBtn.disabled = true;
  }
});

playBtn.addEventListener('click', () => {
  if (!audioBuffer || isPlaying) return;
  if (recordedVideoBlob && !isRecording) {
    playRecordedVideoWithAudio();
  } else {
    isPlaying = true;
    sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioContext.destination);

    startTime = audioContext.currentTime - pausedAt;
    sourceNode.start(0, pausedAt);

    function step() {
      if (!isPlaying) return;
      const currentTime = audioContext.currentTime - startTime;
      renderPlayhead(currentTime);
      if (currentTime < duration) {
        animationId = requestAnimationFrame(step);
      } else {
        stopPlayback();
      }
    }
    animationId = requestAnimationFrame(step);

    sourceNode.onended = stopPlayback;
  }
});

stopBtn.addEventListener('click', stopPlayback);

function stopPlayback() {
  if (isPlaying) {
    if (sourceNode) sourceNode.stop();
    pausedAt = 0;
    isPlaying = false;
    removePlayhead();
    cancelAnimationFrame(animationId);
  }
  if (isRecording) {
    stopRecording();
  }
  if (videoSlaveMode && recordedVideoBlob) {
    video.pause();
    video.currentTime = 0;
  }
}

waveformCanvas.addEventListener('click', (e) => {
  if (!audioBuffer) return;
  const rect = waveformCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const seekTime = (x / waveformCanvas.offsetWidth) * duration;
  if (isPlaying) {
    stopPlayback();
    pausedAt = seekTime;
    playBtn.click();
  } else {
    pausedAt = seekTime;
    renderPlayhead(pausedAt);
    if (videoSlaveMode && recordedVideoBlob) {
      video.currentTime = pausedAt;
    }
  }
});

window.addEventListener('resize', () => {
  if (audioBuffer) drawWaveform(audioBuffer, bpm);
});

// Video Recording
recordBtn.addEventListener('click', async () => {
  if (isRecording) return;
  if (!audioBuffer) return;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = mediaStream;
    video.play();
    await runCountdown(3);
    startRecording();
  } catch (err) {
    alert("Could not access camera.");
  }
});

async function runCountdown(n) {
  countdownEl.classList.remove('hidden');
  for (let i = n; i > 0; i--) {
    countdownEl.textContent = i;
    await new Promise(res => setTimeout(res, 1000));
  }
  countdownEl.textContent = 'GO!';
  await new Promise(res => setTimeout(res, 500));
  countdownEl.classList.add('hidden');
}

function startRecording() {
  isRecording = true;
  recordedChunks = [];
  recIndicator.classList.remove('hidden');
  blinkRecIndicator();
  recordedVideoBlob = null;
  videoSlaveMode = false;

  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };
  mediaRecorder.onstop = () => {
    stopBlinkRecIndicator();
    recIndicator.classList.add('hidden');
    // Save and display the recorded video
    recordedVideoBlob = new Blob(recordedChunks, { type: 'video/webm' });
    setRecordedVideoAsSource();
    videoSlaveMode = true;
    playBtn.disabled = false;
    stopBtn.disabled = false;
    recordBtn.disabled = false;
  };

  mediaRecorder.start();

  // Sync: as soon as video starts recording, play audio too
  pausedAt = 0;
  playBtn.disabled = true;
  stopBtn.disabled = false;
  recordBtn.disabled = true;
  playAudioWithRecording();
}

function setRecordedVideoAsSource() {
  if (recordedVideoBlob) {
    video.srcObject = null;
    video.src = URL.createObjectURL(recordedVideoBlob);
    video.load();
    video.currentTime = 0;
    video.removeAttribute('muted');
    video.setAttribute('controls', '');
    video.pause();
    // Slave: when video time updates, move playhead (only in slave mode)
    video.onseeked = () => {
      if (videoSlaveMode && audioBuffer) {
        pausedAt = video.currentTime;
        renderPlayhead(pausedAt);
      }
    };
    video.onplay = () => {
      if (videoSlaveMode && !isPlaying) {
        isPlaying = true;
        playRecordedVideoWithAudio();
      }
    };
    video.onpause = () => {
      if (videoSlaveMode && isPlaying) {
        stopPlayback();
      }
    };
  }
}

function playRecordedVideoWithAudio() {
  if (!recordedVideoBlob || !audioBuffer) return;
  videoSlaveMode = true;
  // Play the video and sync audio to its currentTime
  video.currentTime = pausedAt;
  video.play();
  isPlaying = true;

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioContext.destination);
  startTime = audioContext.currentTime - video.currentTime;
  sourceNode.start(0, video.currentTime);

  function step() {
    if (!isPlaying) return;
    const currentTime = audioContext.currentTime - startTime;
    renderPlayhead(currentTime);
    if (currentTime < duration && !video.paused) {
      animationId = requestAnimationFrame(step);
    } else {
      stopPlayback();
    }
  }
  animationId = requestAnimationFrame(step);

  sourceNode.onended = () => {
    stopPlayback();
  };
}

function playAudioWithRecording() {
  if (!audioBuffer) return;
  isPlaying = true;
  video.currentTime = 0;
  video.play();
  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(audioContext.destination);
  startTime = audioContext.currentTime;
  sourceNode.start(0, 0);
  function step() {
    if (!isPlaying) return;
    const currentTime = audioContext.currentTime - startTime;
    renderPlayhead(currentTime);
    if (currentTime < duration && !video.paused) {
      animationId = requestAnimationFrame(step);
    } else {
      stopPlayback();
    }
  }
  animationId = requestAnimationFrame(step);

  sourceNode.onended = stopPlayback;
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  playBtn.disabled = false;
  recordBtn.disabled = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  if (mediaStream) {
    let tracks = mediaStream.getTracks();
    tracks.forEach(track => track.stop());
    video.srcObject = null;
  }
  stopBlinkRecIndicator();
  recIndicator.classList.add('hidden');
}

// Blinking REC indicator (now slower: 2s)
function blinkRecIndicator() {
  recIndicator.style.visibility = 'visible';
  recBlinkInterval = setInterval(() => {
    recIndicator.style.visibility = recIndicator.style.visibility === 'hidden' ? 'visible' : 'hidden';
  }, 1000);
}
function stopBlinkRecIndicator() {
  clearInterval(recBlinkInterval);
  recIndicator.style.visibility = 'visible';
}
