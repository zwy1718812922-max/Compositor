"""Local full-model beauty inference; return reusable per-face blend patches."""
import base64
import io
import json
import math
import os
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import openvino as ov


def emit(**message):
    print(json.dumps(message, ensure_ascii=False), flush=True)


def image(data):
    if not isinstance(data, str) or not data.startswith('data:image/png;base64,') or len(data) > 128 * 1024 * 1024:
        raise ValueError('美颜输入必须是本地 PNG。')
    decoded = base64.b64decode(data[22:], validate=True)
    img = Image.open(io.BytesIO(decoded))
    if img.width * img.height > 4 * 1024 * 1024:
        raise ValueError('单次美颜区域超过 4M 像素，请缩小人脸区域。')
    return img.convert('RGBA')


def png(array):
    buffer = io.BytesIO()
    Image.fromarray(np.uint8(np.clip(array, 0, 255))).save(buffer, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode('ascii')


def resize(array, size):
    if array.ndim == 2:
        return np.asarray(Image.fromarray(np.float32(array), mode='F').resize(size, Image.Resampling.BILINEAR))
    return np.stack([resize(array[:, :, k], size) for k in range(array.shape[2])], axis=2)


def tensor(rgb, size):
    return (resize(rgb, size).transpose(2, 0, 1)[None].astype(np.float32) / 127.5 - 1)


class Models:
    def __init__(self, root):
        self.root = root
        self.core = ov.Core()
        self.core.set_property({'CACHE_DIR': str(root / 'cache' / 'beauty-v1')})
        self.models = {}

    def run(self, kind, inputs):
        if kind == 'skin':
            # Preserve the original tf_crop_and_resize graph semantics; this
            # graph is unsupported by the OpenVINO ONNX frontend.
            import onnxruntime as ort
            if kind not in self.models:
                options = ort.SessionOptions()
                options.intra_op_num_threads = min(4, os.cpu_count() or 1)
                options.inter_op_num_threads = 1
                self.models[kind] = ort.InferenceSession(str(self.root / 'models' / 'beauty-v1' / 'model.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
            session = self.models[kind]
            return session.run(None, {session.get_inputs()[0].name: np.ascontiguousarray(inputs[0], dtype=np.float32)})
        if kind not in self.models:
            emit(progress=0, message='载入完整模型：' + kind)
            path = self.root / 'models' / 'beauty-v1' / ('model.onnx' if kind == 'skin' else kind + '.xml')
            model = self.core.read_model(path)
            if kind == 'skin':
                # The original ONNX skin model takes HWC float32 RGB, 0–255.
                model.reshape({model.input(0): list(inputs[0].shape)})
            self.models[kind] = self.core.compile_model(model, 'CPU', {'PERFORMANCE_HINT': 'LATENCY', 'INFERENCE_NUM_THREADS': min(4, os.cpu_count() or 1), 'INFERENCE_PRECISION_HINT': ov.Type.f32})
        compiled = self.models[kind]
        result = compiled({compiled.input(i): np.ascontiguousarray(value, dtype=np.float32) for i, value in enumerate(inputs)})
        return [np.array(result[port], copy=True) for port in compiled.outputs]


def detect(models, img):
    rgb = np.asarray(img.convert('RGB'))
    scale = min(640 / img.width, 640 / img.height)
    width, height = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    padded = np.zeros((640, 640, 3), dtype=np.float32)
    padded[:height, :width] = resize(rgb, (width, height))[:, :, ::-1] / 255
    loc, conf, landmarks = models.run('face', [padded.transpose(2, 0, 1)[None]])
    loc, conf, landmarks = loc[0], conf[0], landmarks[0]
    priors = np.array([[(x + .5) * step / 640, (y + .5) * step / 640, size / 640, size / 640] for step, sizes in [(8, [16, 32]), (16, [64, 128]), (32, [256, 512])] for y in range(math.ceil(640 / step)) for x in range(math.ceil(640 / step)) for size in sizes], dtype=np.float32)
    centers = priors[:, :2] + loc[:, :2] * .1 * priors[:, 2:]
    extents = priors[:, 2:] * np.exp(np.clip(loc[:, 2:] * .2, -10, 10))
    boxes = np.concatenate([centers - extents / 2, centers + extents / 2], axis=1) * 640 / scale
    points = (priors[:, None, :2] + landmarks.reshape(-1, 5, 2) * .1 * priors[:, None, 2:]) * 640 / scale
    order = np.flatnonzero(conf[:, 1] > .75)
    order = order[np.argsort(-conf[order, 1])][:500]
    found = []
    while len(order) and len(found) < 32:
        i, remaining = int(order[0]), order[1:]
        box = boxes[i].copy()
        box[0::2] = np.clip(box[0::2], 0, img.width)
        box[1::2] = np.clip(box[1::2], 0, img.height)
        if box[2] - box[0] >= 12 and box[3] - box[1] >= 12:
            found.append({'box': box.tolist(), 'landmarks': points[i].tolist(), 'score': float(conf[i, 1])})
        intersection = np.prod(np.maximum(0, np.minimum(boxes[i, 2:], boxes[remaining, 2:]) - np.maximum(boxes[i, :2], boxes[remaining, :2])), axis=1)
        a = np.prod(np.maximum(0, boxes[i, 2:] - boxes[i, :2]))
        b = np.prod(np.maximum(0, boxes[remaining, 2:] - boxes[remaining, :2]), axis=1)
        order = remaining[intersection / np.maximum(1, a + b - intersection) <= .4]
    return {'faces': found, 'width': img.width, 'height': img.height}


def face_mask(models, rgb, job):
    w, h = rgb.shape[1], rgb.shape[0]
    size = (max(1, round(w * min(1, 800 / max(w, h)))), max(1, round(h * min(1, 800 / max(w, h)))))
    skin = np.squeeze(models.run('skin', [resize(rgb, size)])[0])
    if skin.ndim == 3:
        skin = skin[:, :, 0]
    skin = resize(skin, (w, h)) / 255
    protection = Image.new('L', (w, h), 255)
    draw = ImageDraw.Draw(protection)
    points = job['landmarks']
    box = job['box']
    fw, fh = box[2] - box[0], box[3] - box[1]
    for eye in points[:2]:
        draw.ellipse((eye[0] - fw * .19, eye[1] - fh * .16, eye[0] + fw * .19, eye[1] + fh * .09), fill=0)
    left, right = points[3], points[4]
    draw.ellipse((min(left[0], right[0]) - fw * .09, min(left[1], right[1]) - fh * .07, max(left[0], right[0]) + fw * .09, max(left[1], right[1]) + fh * .12), fill=0)
    nose = points[2]
    draw.ellipse((nose[0] - fw * .1, nose[1] - fh * .02, nose[0] + fw * .1, nose[1] + fh * .06), fill=0)
    protected = np.asarray(protection.filter(ImageFilter.GaussianBlur(max(1, fw * .015)))) / 255
    yy, xx = np.mgrid[:h, :w]
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    ellipse = ((xx - cx) / max(1, fw * .62)) ** 2 + ((yy - cy) / max(1, fh * .7)) ** 2
    border = np.clip((1.05 - ellipse) / .25, 0, 1)
    edge = np.minimum(np.minimum(xx + 1, w - xx), np.minimum(yy + 1, h - yy))
    crop_fade = np.clip((edge - 1) / max(8, fw * .1), 0, 1)
    crop_fade = crop_fade * crop_fade * (3 - 2 * crop_fade)
    # Hard exclusion plus a soft transition prevents feature leakage.
    return np.clip(skin, 0, 1) * protected * border * crop_fade * (np.asarray(protection) > 0)


def infer(models, img, job):
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32)
    w, h = img.size
    skin = face_mask(models, rgb, job)
    emit(progress=20, message='计算肤质与肤色…')
    blend = models.run('retouch', [tensor(rgb, (512, 512))])[0][0].transpose(1, 2, 0)
    blend_png = png(np.dstack([blend * 255, resize(skin, (512, 512)) * 255]))
    emit(progress=40, message='检测局部瑕疵…')
    logits = models.run('detection', [tensor(rgb, (768, 768))])[0][0, 0]
    probability = resize(1 / (1 + np.exp(-np.clip(logits, -30, 30))), (w, h))
    removal = np.where(probability >= .5, 1, np.where(probability >= .35, probability, 0)) * skin
    repaired = rgb.copy()
    # Overlapping native-resolution windows share a feathered weighting field.
    # Only the detected skin blemishes are used in the editable repair patch.
    stride, window = 384, 512
    xs = sorted(set(list(range(0, max(1, w - window + 1), stride)) + [max(0, w - window)]))
    ys = sorted(set(list(range(0, max(1, h - window + 1), stride)) + [max(0, h - window)]))
    accumulated = np.zeros_like(rgb)
    weights = np.zeros((h, w), dtype=np.float32)
    ramp = np.minimum(1, np.minimum(np.arange(window) + 1, window - np.arange(window)) / 64)
    feather = ramp[:, None] * ramp[None, :]
    for n, (y, x) in enumerate((y, x) for y in ys for x in xs):
        ph, pw = min(window, h - y), min(window, w - x)
        local = removal[y:y + ph, x:x + pw]
        if not np.any(local):
            continue
        block = np.pad(rgb[y:y + ph, x:x + pw], ((0, window - ph), (0, window - pw), (0, 0)), mode='edge')
        known = np.pad(1 - local, ((0, window - ph), (0, window - pw)), mode='edge')[None, None].astype(np.float32)
        normalized = block.transpose(2, 0, 1)[None] / 127.5 - 1
        prediction = models.run('inpainting', [normalized * known, known])[0][0].transpose(1, 2, 0)
        predicted = np.clip((prediction[:ph, :pw] + 1) * 127.5, 0, 255)
        weight = feather[:ph, :pw]
        accumulated[y:y + ph, x:x + pw] += predicted * weight[:, :, None]
        weights[y:y + ph, x:x + pw] += weight
        emit(progress=45 + round(50 * (n + 1) / (len(xs) * len(ys))), message='修补局部瑕疵…')
    valid = weights > 0
    repaired[valid] = accumulated[valid] / weights[valid, None]
    return {'blend': blend_png, 'repair': png(np.dstack([repaired, removal * 255])), 'width': w, 'height': h, 'model': 'ABPN-U-Net-FP32/RetinaFace-R50-FP32/v1'}


def main(job):
    root = Path(job['root'])
    if job['task'] == 'beautyStatus':
        models = root / 'models' / 'beauty-v1'
        ready = (models / 'ready.json').is_file() and all((models / (kind + suffix)).is_file() for kind in ['face', 'retouch', 'detection', 'inpainting'] for suffix in ['.xml', '.bin']) and (models / 'model.onnx').is_file()
        return {'installed': True, 'ready': ready, 'devices': list(ov.Core().available_devices), 'model': '完整 U-Net FP32 / ResNet50 FP32'}
    img = image(job['image'])
    models = Models(root)
    if job['task'] == 'beautyAnalyze':
        return detect(models, img)
    if job['task'] == 'beautyInfer':
        return infer(models, img, job)
    raise ValueError('未知美颜操作。')


if __name__ == '__main__':
    try:
        emit(result=main(json.load(sys.stdin)))
    except Exception as error:
        emit(error=str(error))
        sys.exit(1)
