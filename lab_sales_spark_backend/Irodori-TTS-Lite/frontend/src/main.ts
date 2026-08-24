import './style.css';

const recordBtn = document.getElementById('record-btn') as HTMLButtonElement | null;
const btnText = document.getElementById('btn-text') as HTMLSpanElement | null;
const orb = document.getElementById('orb') as HTMLDivElement | null;
const statusText = document.getElementById('status') as HTMLDivElement | null;
const chatLog = document.getElementById('chat-log') as HTMLDivElement | null;

let ws: WebSocket | null = null;
let audioCtx: AudioContext | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let micStream: MediaStream | null = null;

let isRecording = false;

// Audio Queue & State
interface AudioQueueItem {
  index: number;
  text: string;
  buffer: AudioBuffer;
}

let playQueue: AudioQueueItem[] = [];
let currentSourceNode: AudioBufferSourceNode | null = null;
let isPlaying = false;

// Helper to update orb states
function setOrbState(state: 'idle' | 'recording' | 'thinking' | 'speaking', customText?: string): void {
  if (!orb || !statusText || !recordBtn || !btnText) return;

  orb.className = 'orb-container ' + state;
  statusText.className = 'status-text ' + state;
  
  if (state === 'idle') {
    statusText.innerText = customText || 'ボタンを押して話しかける';
    recordBtn.classList.remove('active');
    btnText.innerText = '話す';
  } else if (state === 'recording') {
    statusText.innerText = '会話中...（声を出して話しかけてください）';
    recordBtn.classList.add('active');
    btnText.innerText = '終了';
  } else if (state === 'thinking') {
    statusText.innerText = '考え中...';
    recordBtn.classList.remove('active');
    btnText.innerText = '処理中';
  } else if (state === 'speaking') {
    statusText.innerText = '返答中...';
    recordBtn.classList.remove('active');
    btnText.innerText = '再生中';
  }
}

// Add message to chat display
function addChatMessage(sender: 'user' | 'assistant', text: string): void {
  if (!chatLog) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${sender}`;
  
  const senderSpan = document.createElement('span');
  senderSpan.className = 'sender-tag';
  senderSpan.innerText = sender === 'user' ? 'YOU' : 'AI';
  
  const contentSpan = document.createElement('span');
  contentSpan.innerText = text;
  
  msgDiv.appendChild(senderSpan);
  msgDiv.appendChild(contentSpan);
  
  chatLog.appendChild(msgDiv);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Stop all audio playback instantly
function stopAllPlayback(): void {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
    } catch (e) {
      // Audio already stopped
    }
    currentSourceNode = null;
  }
  playQueue = [];
  isPlaying = false;
  setOrbState('idle');
  if (orb) {
    orb.style.transform = '';
    orb.style.boxShadow = '';
  }
}

// Play next audio segment in queue
async function playNextInQueue(): Promise<void> {
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch (e) {
      console.error("Failed to resume AudioContext: ", e);
    }
  }

  if (playQueue.length === 0) {
    isPlaying = false;
    // Keep in 'recording' state if we are still active, otherwise idle
    if (isRecording) {
      setOrbState('recording');
    } else {
      setOrbState('idle');
    }
    return;
  }
  
  isPlaying = true;
  const item = playQueue.shift()!;
  
  // Append response chunk to chat log
  addChatMessage('assistant', item.text);
  
  if (!audioCtx) return;
  
  const source = audioCtx.createBufferSource();
  source.buffer = item.buffer;
  
  // Connect to visualizer analyser
  const playAnalyser = audioCtx.createAnalyser();
  playAnalyser.fftSize = 256;
  source.connect(playAnalyser);
  playAnalyser.connect(audioCtx.destination);
  
  const bufferLength = playAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  setOrbState('speaking');
  currentSourceNode = source;
  
  function drawPlay() {
    if (!orb) return;
    if (source !== currentSourceNode || audioCtx?.state === 'suspended') {
      return;
    }
    requestAnimationFrame(drawPlay);
    playAnalyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    let average = sum / bufferLength;
    let scale = 1.0 + (average / 255) * 0.5;
    let glow = 30 + (average / 255) * 60;
    orb.style.transform = `scale(${scale})`;
    orb.style.boxShadow = `0 0 ${glow}px rgba(0, 112, 243, 0.7)`;
  }
  
  source.onended = () => {
    try {
      // Notify server of successful playback of this index
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'report_played',
          index: item.index
        }));
      }
    } catch (e) {
      console.error("Error sending report_played to server: ", e);
    }
    
    if (currentSourceNode === source) {
      currentSourceNode = null;
    }
    playNextInQueue();
  };
  
  source.start(0);
  drawPlay();
}

// Downsample Float32 audio buffer to 16000Hz
function downsampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) {
    return input;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;
  while (offsetResult < newLength) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : input[offsetInput];
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

// Start continuous audio recording and stream via WebSocket
async function startStreaming(): Promise<void> {
  try {
    // 1. Check for Secure Context (HTTPS or localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = '【マイク利用の制限】\nブラウザのセキュリティ仕様により、マイクは「localhost」または「HTTPS」でのみ動作します。\n\nリモートサーバーをお使いの場合は、SSHポートフォワードをご利用ください：\nssh -L 8090:localhost:8090 ubuntu@<サーバーIP>\nその後、ブラウザで http://localhost:8090 を開いてください。';
      console.error(msg);
      alert(msg);
      if (statusText) statusText.innerText = 'エラー: localhost または HTTPS で開いてください';
      return;
    }

    // 2. Initialize AudioContext (native sample rate for maximum browser compatibility)
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    const nativeSampleRate = audioCtx.sampleRate;
    console.log(`[Audio] Initialized AudioContext at ${nativeSampleRate}Hz`);

    // 3. Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    console.log(`[WS] Connecting to ${wsUrl}...`);
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    
    ws.onopen = () => {
      console.log("[WS] Connected to real-time audio socket");
      setOrbState('recording');
    };
    
    ws.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        return;
      }
      
      const data = JSON.parse(event.data);
      console.log("[WS] Received server message:", data.type);
      
      if (data.type === 'control' && data.action === 'stop') {
        console.log("[WS] Barge-in! Stopping playback");
        stopAllPlayback();
        setOrbState('recording');
      }
      
      else if (data.type === 'chat') {
        if (data.user_text) {
          addChatMessage('user', data.user_text);
        }
        if (data.bot_text) {
          addChatMessage('assistant', data.bot_text);
        }
      }
      
      else if (data.type === 'audio') {
        const audioBase64 = data.audio;
        const index = data.index;
        const text = data.text;
        
        console.log(`[WS] Received audio segment ${index}: "${text}"`);
        
        const binaryString = atob(audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        if (!audioCtx) return;
        
        audioCtx.decodeAudioData(bytes.buffer.slice(0), (buffer) => {
          playQueue.push({ index, text, buffer });
          if (!isPlaying) {
            playNextInQueue();
          }
        }, (err) => {
          console.error("Error decoding base64 audio packet", err);
        });
      }
    };
    
    ws.onerror = (err) => {
      console.error("[WS] WebSocket Error:", err);
      if (statusText) statusText.innerText = 'WebSocket 接続エラー';
    };

    ws.onclose = (ev) => {
      console.log("[WS] WebSocket Closed:", ev.code, ev.reason);
      stopStreaming();
    };

    // 4. Access Microphone
    console.log("[Audio] Requesting microphone access...");
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });
    console.log("[Audio] Microphone access granted!");

    micSource = audioCtx.createMediaStreamSource(micStream);
    
    // ScriptProcessor to capture audio buffer and resample to 16kHz
    scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);
    
    micSource.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
    
    // Setup visualizer analyser
    const micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    micSource.connect(micAnalyser);
    const bufferLength = micAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let packetCount = 0;
    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0); // Float32Array at nativeSampleRate
        
        // Convert to 16kHz Float32 for STT
        const resampled16k = downsampleTo16k(inputData, nativeSampleRate);
        ws.send(resampled16k.buffer as ArrayBuffer);
        packetCount++;
        if (packetCount % 50 === 0) {
          console.log(`[Audio] Streamed ${packetCount} chunks (16kHz PCM) to backend`);
        }
      }
    };
    
    isRecording = true;
    
    function drawMic() {
      if (!isRecording || !orb || isPlaying) return;
      requestAnimationFrame(drawMic);
      micAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      let average = sum / bufferLength;
      let scale = 1.0 + (average / 255) * 0.45;
      let glow = 30 + (average / 255) * 60;
      orb.style.transform = `scale(${scale})`;
      orb.style.boxShadow = `0 0 ${glow}px rgba(255, 0, 85, 0.7)`;
    }
    drawMic();
    
  } catch (err: any) {
    console.error('Error starting live connection:', err);
    alert('マイクの初期化に失敗しました: ' + (err.message || err));
    stopStreaming();
  }
}

// Stop live connection and clean up audio
function stopStreaming(): void {
  isRecording = false;
  
  if (scriptNode) {
    scriptNode.disconnect();
    scriptNode = null;
  }
  if (micSource) {
    micSource.disconnect();
    micSource = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }
  if (ws) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
  }
  
  stopAllPlayback();
}

async function toggleConnection(): Promise<void> {
  if (!isRecording) {
    await startStreaming();
  } else {
    stopStreaming();
  }
}

if (orb) orb.addEventListener('click', toggleConnection);
if (recordBtn) recordBtn.addEventListener('click', toggleConnection);
