const audioUpload = document.getElementById('audio-upload');
const waveformCanvas = document.getElementById('waveform');
const barMarkers = document.getElementById('bar-markers');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');

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

function resetWaveform() {
  const ctx = waveformCanvas.getContext('2d');
  ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  barMarkers.innerHTML = '';
}

function drawWaveform(buffer, _bpm = 120) {
  bpm = _bpm;
  duration = buffer.duration;
  bars = Math.ceil(duration / (60 / bpm * 4)); // 4/4 time
  secondsPerBar = 60 / bpm * 4;

  // Setup canvas for HiDPI screens
  const dpr = window.devicePixelRatio || 1;
  waveformCanvas.width = waveformCanvas.offsetWidth * dpr;
  waveformCanvas.height = waveformCanvas.offsetHeight * dpr;
  const ctx = waveformCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Draw waveform
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

  // Draw 8-bar chunk divisions
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

    // Label
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
  // Remove old playhead
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

// Optional: use a BPM detection library or default to 120
async function estimateBPM(buffer) {
  // Use a library like web-audio-beat-detector for real detection
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

  try {
    const arrBuffer = await fileToArrayBuffer(file);
    audioBuffer = await audioContext.decodeAudioData(arrBuffer);

    // Optionally estimate BPM here
    const detectedBPM = await estimateBPM(audioBuffer);
    drawWaveform(audioBuffer, detectedBPM);

    playBtn.disabled = false;
    stopBtn.disabled = false;
    pausedAt = 0;
    isPlaying = false;
  } catch (err) {
    alert("Could not decode audio file.");
    playBtn.disabled = true;
    stopBtn.disabled = true;
  }
});

playBtn.addEventListener('click', () => {
  if (!audioBuffer || isPlaying) return;
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
}

// Optional: Pause/resume functionality
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
  }
});

// Responsive resizing
window.addEventListener('resize', () => {
  if (audioBuffer) drawWaveform(audioBuffer, bpm);
});
