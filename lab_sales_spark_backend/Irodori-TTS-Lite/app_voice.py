import io
import os
import sys
import tempfile
import base64
import asyncio
from threading import Thread
import torch
import numpy as np
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from scipy.io import wavfile
import pyopenjtalk
import uvicorn
import json

# Dynamic base directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

import irodori_tts_lite
from irodori_tts.inference_runtime import (
    InferenceRuntime,
    RuntimeKey,
    SamplingRequest,
)

# STT & LLM API imports
from faster_whisper import WhisperModel
from openai import OpenAI

def is_emoji_or_symbol(char: str) -> bool:
    val = ord(char)
    return (
        0x1F000 <= val <= 0x1FBFF or  # Emojis, Symbols, Pictographs
        0x2600 <= val <= 0x27BF or    # Dingbats, Misc Symbols
        0x2300 <= val <= 0x23FF or    # Misc Technical
        0x2B50 <= val <= 0x2B55 or    # Stars/Circles
        0x3013 == val                 # Japanese Geta Mark
    )

# Global variables for models and API client
tts_runtime = None
stt_model = None
openai_client = None

# OpenAI-compatible API configurations
API_KEY = os.getenv("BYTECOMPUTE_API_KEY") or os.getenv("OPENAI_API_KEY") or "dummy"
BASE_URL = os.getenv("BYTECOMPUTE_BASE_URL", "https://jp-01.bytecompute.ai/v1")
MODEL_NAME = os.getenv("MODEL_NAME", "gemma-4-31B-it")

# Voice Clone Reference Audio Configuration
DEFAULT_REF_WAV = os.getenv(
    "DEFAULT_REF_WAV",
    os.path.join(os.path.dirname(__file__), "reference", "aoyama_yoshino02.wav")
)

# Chat History state (In-Memory)
chat_history = []
MAX_HISTORY_LEN = 6  # Keep last 6 interactions

# Configure patched runtime
irodori_tts_lite.configure(
    use_fused=True,
    force_fp16=True,
    enable_watermark=False,
)
irodori_tts_lite.patch()

# AI Speaking State tracker for WS barge-in
class AISpeakingState:
    def __init__(self):
        self.is_speaking = False
        self.current_sentences = []  # List of sentences in active response
        self.played_count = 0        # Count of successfully played sentences
        self.tts_task = None         # Asyncio task handling STT/LLM/TTS pipeline
        self.interrupted_sentences = [] # Remainder sentences when interrupted

ai_state = AISpeakingState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global tts_runtime, stt_model, openai_client
    print("==================================================", flush=True)
    print("Initializing Irodori-TTS & Gemma API Runtime...", flush=True)
    print("==================================================", flush=True)
    
    try:
        # 1. Load TTS Model
        print("Loading TTS model (Irodori-TTS-Lite)...", flush=True)
        checkpoint_path = irodori_tts_lite.resolve_checkpoint(None)
        key = RuntimeKey(
            checkpoint=checkpoint_path,
            model_device="cuda",
            codec_repo="Aratako/Semantic-DACVAE-Japanese-32dim",
            model_precision="fp32",
            codec_device="cuda",
            codec_precision="fp32",
            codec_deterministic_encode=True,
            codec_deterministic_decode=True,
            compile_model=False,
            compile_dynamic=False,
        )
        tts_runtime = InferenceRuntime.from_key(key)
        print("TTS Model loaded successfully.", flush=True)

        # 2. Load STT Model (faster-whisper large-v3)
        print("Loading STT model (Whisper Large-v3)...", flush=True)
        stt_model = WhisperModel("large-v3", device="cuda", compute_type="float16")
        print("STT Model loaded successfully.", flush=True)

        # 3. Setup OpenAI-compatible Client for Gemma API
        print(f"Initializing Gemma API Client (Base URL: {BASE_URL}, Model: {MODEL_NAME})...", flush=True)
        openai_client = OpenAI(api_key=API_KEY, base_url=BASE_URL)
        print("Gemma API Client ready.", flush=True)
        print("==================================================", flush=True)
        print("All models and API clients ready.", flush=True)
        print("==================================================", flush=True)

    except Exception as e:
        print(f"CRITICAL ERROR loading models: {e}", flush=True)
        raise e
    yield

app = FastAPI(
    title="Irodori TTS & Gemma-4 Voice Chat API",
    description="Real-time Audio Conversation System using Whisper, Gemma API, and Irodori-TTS-Lite",
    version="1.0.0",
    lifespan=lifespan
)

# Mount static assets directory from built TS frontend
assets_dir = os.path.join(BASE_DIR, "frontend", "dist", "assets")
if os.path.exists(assets_dir):
    app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

@app.get("/", response_class=HTMLResponse)
async def get_index():
    index_path = os.path.join(BASE_DIR, "frontend", "dist", "index.html")
    if not os.path.exists(index_path):
        index_path = os.path.join(BASE_DIR, "templates", "index.html")
        
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Index HTML template not found")
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()

@app.get("/tts")
async def tts_endpoint(
    text: str = Query(..., description="音声合成したい日本語テキスト"),
    steps: int = Query(6, ge=1, le=100, description="RF Eulerサンプリングのステップ数"),
):
    """Direct HTTP endpoint for synthesizing Japanese text to WAV audio."""
    if not tts_runtime:
        raise HTTPException(status_code=503, detail="TTS Model not loaded yet")
        
    try:
        clean_text = text.strip().replace("*", "").replace("`", "").replace("#", "")
        if not clean_text:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
            
        phs = pyopenjtalk.g2p(clean_text, kana=False).split()
        seconds = max(1.8, len(phs) / 11.0 + 0.5)
        
        ref_wav_path = DEFAULT_REF_WAV if os.path.exists(DEFAULT_REF_WAV) else None
        
        req = SamplingRequest(
            text=clean_text,
            ref_wav=ref_wav_path,
            no_ref=(ref_wav_path is None),
            seconds=seconds,
            num_steps=steps,
        )
        
        loop = asyncio.get_running_loop()
        tts_result = await loop.run_in_executor(None, lambda: tts_runtime.synthesize(req))
        
        audio_data = tts_result.audio
        if isinstance(audio_data, torch.Tensor):
            audio_data = audio_data.cpu().numpy()
            
        audio_data = audio_data.flatten()
        audio_int16 = (audio_data * 32767.0).astype(np.int16)
        
        wav_io = io.BytesIO()
        wavfile.write(wav_io, tts_result.sample_rate, audio_int16)
        wav_io.seek(0)
        
        return StreamingResponse(
            wav_io,
            media_type="audio/wav",
            headers={"Content-Disposition": "inline; filename=speech.wav"}
        )
    except Exception as e:
        print(f"[TTS Endpoint Error]: {e}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

# Helper to synthesize and send TTS through WebSocket
async def generate_and_send_tts(text: str, index: int, websocket: WebSocket):
    # Strip any leftover punctuation or markdown
    clean_text = text.strip().replace("*", "").replace("`", "").replace("#", "")
    if not clean_text or clean_text == "thought":
        return

    print(f"[TTS] Synthesizing segment {index}: \"{clean_text}\"", flush=True)
    phs = pyopenjtalk.g2p(clean_text, kana=False).split()
    seconds = max(1.8, len(phs) / 11.0 + 0.5)
    
    ref_wav_path = DEFAULT_REF_WAV if os.path.exists(DEFAULT_REF_WAV) else None

    req = SamplingRequest(
        text=clean_text,
        ref_wav=ref_wav_path,
        no_ref=(ref_wav_path is None),
        seconds=seconds,
        num_steps=6,
    )
    
    loop = asyncio.get_running_loop()
    # Synthesize in thread pool to avoid blocking the async event loop
    tts_result = await loop.run_in_executor(None, lambda: tts_runtime.synthesize(req))
    
    audio_data = tts_result.audio
    if isinstance(audio_data, torch.Tensor):
        audio_data = audio_data.cpu().numpy()
        
    audio_data = audio_data.flatten()
    audio_int16 = (audio_data * 32767.0).astype(np.int16)
    
    wav_io = io.BytesIO()
    wavfile.write(wav_io, tts_result.sample_rate, audio_int16)
    wav_bytes = wav_io.getvalue()
    
    audio_base64 = base64.b64encode(wav_bytes).decode("utf-8")
    
    # Mark as actively speaking once the first audio packet is delivered
    ai_state.is_speaking = True

    await websocket.send_json({
        "type": "audio",
        "index": index,
        "text": clean_text,
        "audio": audio_base64
    })
    print(f"[TTS] Sent segment {index}: \"{clean_text}\"", flush=True)

# Main async processor for STT, LLM Streaming, and splitting to TTS
async def process_and_respond(audio_data: np.ndarray, websocket: WebSocket):
    global chat_history, openai_client
    try:
        print("[STT] Running transcription on audio buffer...", flush=True)
        # Directly pass raw float32 array at 16kHz
        segments, info = stt_model.transcribe(audio_data, beam_size=5, language="ja")
        user_text = "".join([segment.text for segment in segments]).strip()
        print(f"[STT] Result: \"{user_text}\"", flush=True)
        
        # Check if transcription produced any text
        if not user_text:
            print("[STT] No text transcribed. Checking for resumption...", flush=True)
            if ai_state.interrupted_sentences:
                print(f"[VAD] Resuming interrupted TTS queue: {ai_state.interrupted_sentences}", flush=True)
                ai_state.is_speaking = True
                ai_state.current_sentences = ai_state.interrupted_sentences
                ai_state.played_count = 0
                ai_state.interrupted_sentences = []
                
                for i, sentence in enumerate(ai_state.current_sentences):
                    await generate_and_send_tts(sentence, i, websocket)
            else:
                await websocket.send_json({
                    "type": "chat",
                    "user_text": "",
                    "bot_text": ""
                })
            return
            
        # Valid user text triggers fresh LLM interaction
        ai_state.interrupted_sentences = []
        ai_state.is_speaking = False  # Reset speaking state until first TTS packet is sent
        
        await websocket.send_json({
            "type": "chat",
            "user_text": user_text,
            "bot_text": ""
        })

        chat_history.append({"role": "user", "content": user_text})
        if len(chat_history) > MAX_HISTORY_LEN * 2:
            chat_history = chat_history[-(MAX_HISTORY_LEN * 2):]

        system_instruction = (
            "あなたは親切で正確な日本語ビジネスアシスタント「Sales Spark」です。\n"
            "デジタル名刺・顧客プロファイルの閲覧・検索・新規登録・編集や Google カレンダー・Gmail などの予定・連絡支援をサポートします。\n\n"
            "【音声対話・話し方のルール】\n"
            "1. 最初は自然な相槌（「はい！」「わかりました！」「ええとね、」など）から始めてください。\n"
            "2. 音声合成（TTS）で読み上げるため、1〜2文程度の簡潔で親しみやすい日本語で短く回答してください。Markdownの装飾や箇条書き、英語の注釈は一切含めないでください。\n"
            "3. 文の末尾に感情を表す絵文字やニュアンスを適度に入れてください。"
        )

        api_messages = [{"role": "system", "content": system_instruction}] + chat_history

        print(f"[LLM API] Requesting streaming completion from {MODEL_NAME}...", flush=True)
        loop = asyncio.get_running_loop()
        
        def run_completion_stream():
            return openai_client.chat.completions.create(
                model=MODEL_NAME,
                messages=api_messages,
                stream=True,
                temperature=0.7,
                max_tokens=150
            )

        stream = await loop.run_in_executor(None, run_completion_stream)

        ai_state.current_sentences = []
        ai_state.played_count = 0
        
        sentence_buffer = ""
        sentence_index = 0

        PUNCTUATIONS = ["。", "！", "？", "!", "?", "…", "\n"]

        for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if not token:
                continue
                
            sentence_buffer += token
            
            # Clean leading thought artifacts if present
            if sentence_buffer.startswith("thought\n"):
                sentence_buffer = sentence_buffer[len("thought\n"):].lstrip()
            
            # Scan character by character to split exactly at the sentence boundary
            while any(p in sentence_buffer for p in PUNCTUATIONS):
                split_idx = len(sentence_buffer)
                for p in PUNCTUATIONS:
                    idx = sentence_buffer.find(p)
                    if idx != -1 and idx < split_idx:
                        split_idx = idx
                
                # Scan symbols/emojis directly following the punctuation mark to keep them in the same segment
                extend_idx = split_idx + 1
                while extend_idx < len(sentence_buffer):
                    char = sentence_buffer[extend_idx]
                    if char.isspace() or is_emoji_or_symbol(char):
                        extend_idx += 1
                    else:
                        break
                
                # Extract sentence including punctuation and subsequent emojis
                sentence = sentence_buffer[:extend_idx].strip()
                sentence_buffer = sentence_buffer[extend_idx:].lstrip()
                
                sentence = sentence.replace("*", "").replace("`", "")
                if sentence and sentence != "thought":
                    ai_state.current_sentences.append(sentence)
                    await generate_and_send_tts(sentence, sentence_index, websocket)
                    sentence_index += 1

        # Send any leftover string
        sentence = sentence_buffer.strip().replace("*", "").replace("`", "")
        if sentence and sentence != "thought":
            ai_state.current_sentences.append(sentence)
            await generate_and_send_tts(sentence, sentence_index, websocket)

        full_bot_response = " ".join(ai_state.current_sentences)
        print(f"[LLM] Complete response: \"{full_bot_response}\"", flush=True)
        chat_history.append({"role": "assistant", "content": full_bot_response})

    except asyncio.CancelledError:
        print("[Task] Voice processing task cancelled due to barge-in.", flush=True)
    except Exception as e:
        print(f"Error in process_and_respond: {e}", flush=True)

# Bi-directional WebSocket endpoint for real-time speech interactions
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Client connected to live speech channel", flush=True)
    
    audio_buffer = []
    silence_samples = 0
    was_speaking = False
    
    SAMPLE_RATE = 16000
    # 0.7 seconds of silence to detect turn completion
    SILENCE_LIMIT = int(0.7 * SAMPLE_RATE)
    # Amplitude threshold to detect user speech activity (raised slightly to avoid noise)
    SILENCE_THRESHOLD = 0.025
    # Minimum audio length (0.3s) to avoid micro-clicks triggering STT
    MIN_AUDIO_SAMPLES = int(0.3 * SAMPLE_RATE)
    
    chunk_count = 0
    try:
        while True:
            message = await websocket.receive()
            
            # 1. Capture raw float32 mono audio buffer streamed from client
            if "bytes" in message:
                pcm_data = np.frombuffer(message["bytes"], dtype=np.float32)
                audio_buffer.append(pcm_data)
                chunk_count += 1
                if chunk_count % 50 == 1:
                    print(f"[WS] Receiving audio stream from client... (chunk #{chunk_count}, {len(pcm_data)} samples)", flush=True)
                
                rms = np.sqrt(np.mean(pcm_data**2)) if len(pcm_data) > 0 else 0
                
                # Active Speech Detected
                if rms > SILENCE_THRESHOLD:
                    silence_samples = 0
                    was_speaking = True
                    
                    # 2. Barge-in / Interrupt detection (Only if AI is ACTUALLY playing voice)
                    if ai_state.is_speaking:
                        print(f"[Barge-in] User speech detected (RMS={rms:.4f}). Stopping AI voice playback.", flush=True)
                        # Tell client to immediately mute output and clear playing buffers
                        await websocket.send_json({"type": "control", "action": "stop"})
                        
                        # Terminate running generation pipeline
                        if ai_state.tts_task and not ai_state.tts_task.done():
                            ai_state.tts_task.cancel()
                            
                        # Save remainder of the sentences for potential resumption
                        ai_state.interrupted_sentences = ai_state.current_sentences[ai_state.played_count:]
                        ai_state.is_speaking = False
                        print(f"[Barge-in] Saved remainder sentences: {ai_state.interrupted_sentences}", flush=True)
                
                # Quiet / Silence
                else:
                    if was_speaking:
                        silence_samples += len(pcm_data)
                        
                        # User stops speaking for SILENCE_LIMIT
                        if silence_samples >= SILENCE_LIMIT:
                            print("[VAD] Silence limit reached. Checking audio buffer...", flush=True)
                            was_speaking = False
                            silence_samples = 0
                            
                            if audio_buffer:
                                full_audio = np.concatenate(audio_buffer)
                                audio_buffer = []
                                
                                # Ignore very short clicks / pops (< 0.3s)
                                if len(full_audio) >= MIN_AUDIO_SAMPLES:
                                    print(f"[VAD] Processing {len(full_audio)/SAMPLE_RATE:.2f}s of audio...", flush=True)
                                    # Cancel previous pipeline if any
                                    if ai_state.tts_task and not ai_state.tts_task.done():
                                        ai_state.tts_task.cancel()
                                        
                                    ai_state.tts_task = asyncio.create_task(
                                        process_and_respond(full_audio, websocket)
                                    )
                                else:
                                    print(f"[VAD] Ignored short noise buffer ({len(full_audio)/SAMPLE_RATE:.2f}s)", flush=True)
                                
            # 3. Handle JSON control frames from client
            elif "text" in message:
                data = json.loads(message["text"])
                if data.get("type") == "report_played":
                    idx = data.get("index", 0)
                    ai_state.played_count = idx + 1
                    print(f"[Playback] Client finished playing segment {idx} ({ai_state.played_count}/{len(ai_state.current_sentences)})", flush=True)
                    if ai_state.played_count >= len(ai_state.current_sentences):
                        ai_state.is_speaking = False
                        print("[Playback] All response segments finished playing.", flush=True)

    except WebSocketDisconnect:
        print("[WS] Client disconnected from live channel", flush=True)
    except Exception as e:
        print(f"[WS] Connection error: {e}", flush=True)
    finally:
        # Cleanup
        if ai_state.tts_task and not ai_state.tts_task.done():
            ai_state.tts_task.cancel()
        ai_state.is_speaking = False

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8008"))
    uvicorn.run("app_voice:app", host="0.0.0.0", port=port, reload=False)
