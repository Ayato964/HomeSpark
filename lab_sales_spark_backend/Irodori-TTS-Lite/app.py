import io
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse
from scipy.io import wavfile
import numpy as np
import torch

# Ensure upstream path is in sys.path
sys.path.insert(0, "/home/ubuntu/nagoshi/Irodori-TTS")

import irodori_tts_lite
from irodori_tts.inference_runtime import (
    InferenceRuntime,
    RuntimeKey,
    SamplingRequest,
)
import pyopenjtalk

# Configure patched runtime (watermark disabled by default, fused linear enabled)
irodori_tts_lite.configure(
    use_fused=True,
    force_fp16=True,
    enable_watermark=False,
)
irodori_tts_lite.patch()

runtime = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global runtime
    print("Loading TTS model and codecs...", flush=True)
    try:
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
        runtime = InferenceRuntime.from_key(key)
        print("TTS Model loaded successfully.", flush=True)
    except Exception as e:
        print(f"Error loading model: {e}", flush=True)
        raise e
    yield

app = FastAPI(
    title="Irodori-TTS-Lite API",
    description="FastAPI Wrapper for Int4-quantized Irodori-TTS-Lite runtime",
    version="1.0.0",
    lifespan=lifespan
)

@app.get("/tts")
async def tts(
    text: str = Query(..., description="音声合成したい日本語テキスト"),
    steps: int = Query(6, ge=1, le=100, description="RF Eulerサンプリングのステップ数"),
):
    if not runtime:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
        
    try:
        # Estimate duration using phonemes
        phs = pyopenjtalk.g2p(text, kana=False).split()
        seconds = max(2.0, len(phs) / 11.0 + 0.6)
        
        req = SamplingRequest(
            text=text,
            no_ref=True,
            seconds=seconds,
            num_steps=steps,
        )
        
        # Perform super-fast inference (takes ~100ms)
        result = runtime.synthesize(req)
        
        # Write to in-memory bytes buffer as WAV
        audio_data = result.audio
        if isinstance(audio_data, torch.Tensor):
            audio_data = audio_data.cpu().numpy()
        
        # Flatten to 1D array to prevent scipy from mistaking sample length for channel count
        audio_data = audio_data.flatten()
            
        # Convert float32 [-1, 1] to int16 PCM for maximum player compatibility
        audio_int16 = (audio_data * 32767.0).astype(np.int16)
        wav_io = io.BytesIO()
        wavfile.write(wav_io, result.sample_rate, audio_int16)
        wav_io.seek(0)
        
        # Return streaming audio response
        return StreamingResponse(wav_io, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8090, reload=False)
