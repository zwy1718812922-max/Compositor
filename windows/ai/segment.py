"""Local U2-Net inference. JSON lines carry progress; image bytes never leave the PC."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import time
import urllib.request

MODELS = {
    "u2netp": ("https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx", "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8"),
    "u2net": ("https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx", "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491"),
}

def emit(**data):
    print(json.dumps(data, ensure_ascii=True), flush=True)

def valid(path, expected):
    if not path.is_file():
        return False
    digest = hashlib.md5() if expected.startswith("md5:") else hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest() == expected.removeprefix("md5:")

def model_path(root, name):
    if name not in MODELS:
        raise ValueError("Unknown segmentation model")
    url, expected = MODELS[name]
    folder = root / "models"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (name + ".onnx")
    if valid(target, expected):
        return target
    partial = target.with_suffix(".download")
    emit(progress=5, stage="Downloading model")
    try:
        with urllib.request.urlopen(url, timeout=30) as response, partial.open("wb") as output:
            total = int(response.headers.get("Content-Length", 0))
            size = 0
            last = -1
            while chunk := response.read(1024 * 256):
                output.write(chunk)
                size += len(chunk)
                progress = 5 + int(size / total * 30) if total else 10
                if progress != last:
                    emit(progress=progress, stage="Downloading model", bytes=size, total=total)
                    last = progress
        if not valid(partial, expected):
            raise ValueError("Model checksum mismatch; please retry")
        os.replace(partial, target)
    finally:
        partial.unlink(missing_ok=True)
    return target

def main(job):
    os.environ["OPENVINO_TELEMETRY_DISABLED"] = "1"
    import openvino as ov
    root = Path(job["root"])
    core = ov.Core()
    devices = core.available_devices
    names = {d: core.get_property(d, "FULL_DEVICE_NAME") for d in devices}
    if job.get("task") == "status":
        return {"installed": True, "devices": devices, "names": names, "version": ov.__version__}
    import numpy as np
    from PIL import Image
    path = model_path(root, job.get("model", "u2netp"))
    emit(progress=38, stage="Loading model")
    model = core.read_model(str(path))
    model.reshape({model.input(0): [1, 3, 320, 320]})
    device = "CPU"
    fallback = None
    if job.get("npu"):
        if "NPU" in devices:
            device = "NPU"
        else:
            fallback = "NPU unavailable; using CPU"
    emit(progress=45, stage="Compiling " + device)
    cache = root / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    core.set_property({"CACHE_DIR": str(cache)})
    try:
        compiled = core.compile_model(model, device)
    except Exception as error:
        if device != "NPU":
            raise
        fallback = "NPU compilation failed; using CPU: " + str(error)[:300]
        emit(progress=50, stage="NPU fallback to CPU")
        device = "CPU"
        compiled = core.compile_model(model, device)
    raw = base64.b64decode(job["image"].split(",", 1)[1], validate=True)
    if len(raw) > 128 * 1024 * 1024:
        raise ValueError("Image exceeds size limit")
    source = Image.open(io.BytesIO(raw)).convert("RGBA")
    if source.width * source.height > 64 * 1024 * 1024:
        raise ValueError("Image exceeds pixel limit")
    rgb = Image.new("RGB", source.size, "white")
    rgb.paste(source, mask=source.getchannel("A"))
    region = job.get("region")
    if region:
        x, y, width, height = (int(region[k]) for k in ("x", "y", "width", "height"))
        if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > source.width or y + height > source.height:
            raise ValueError("Object selection region is outside the image")
        rgb = rgb.crop((x, y, x + width, y + height))
    pixels = np.asarray(rgb.resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32)
    pixels /= max(float(pixels.max()), 1.0)
    pixels = (pixels - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)
    tensor = np.transpose(pixels, (2, 0, 1))[None].copy()
    emit(progress=65, stage="Inference " + device)
    start = time.perf_counter()
    try:
        result = compiled([tensor])[compiled.output(0)]
    except Exception as error:
        if device != "NPU":
            raise
        fallback = "NPU inference failed; using CPU: " + str(error)[:300]
        device = "CPU"
        compiled = core.compile_model(model, "CPU")
        result = compiled([tensor])[compiled.output(0)]
    pred = result[0, 0]
    pred = (pred - pred.min()) / max(float(pred.max() - pred.min()), 1e-8)
    mask = Image.fromarray((np.clip(pred, 0, 1) * 255).astype("uint8")).resize(rgb.size, Image.Resampling.LANCZOS).convert("RGB")
    if region:
        full = Image.new("RGB", source.size, "black")
        full.paste(mask, (x, y))
        mask = full
    stream = io.BytesIO()
    mask.save(stream, format="PNG")
    emit(progress=95, stage="Preparing editable mask")
    return {"mask": "data:image/png;base64," + base64.b64encode(stream.getvalue()).decode("ascii"), "device": device, "deviceName": names.get(device, device), "executionDevices": ([compiled.get_property("EXECUTION_DEVICES")] if isinstance(compiled.get_property("EXECUTION_DEVICES"), str) else list(compiled.get_property("EXECUTION_DEVICES"))), "fallback": fallback, "inferenceMs": round((time.perf_counter() - start) * 1000), "model": job.get("model", "u2netp")}

if __name__ == "__main__":
    try:
        emit(result=main(json.load(sys.stdin)))
    except Exception as error:
        emit(error=str(error))
        sys.exit(1)
