"""Pinned on-demand beauty assets. Reuse the installed AI runtime."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile


def emit(**message):
    print(json.dumps(message, ensure_ascii=False), flush=True)


def digest(path):
    with open(path, 'rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def download(asset, directory):
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / asset['name']
    if target.is_file() and digest(target) == asset['sha256']:
        return target
    partial = target.with_suffix(target.suffix + '.download')
    try:
        request = urllib.request.Request(asset['url'], headers={'User-Agent': 'Compositor/0.10'})
        with urllib.request.urlopen(request, timeout=60) as response, partial.open('wb') as out:
            total = int(response.headers.get('Content-Length', asset.get('size', 0)))
            count, last = 0, -1
            while chunk := response.read(1024 * 1024):
                out.write(chunk)
                count += len(chunk)
                value = int(count * 100 / total) if total else 0
                if value != last:
                    emit(progress=value, message='下载完整美颜模型 / 组件：' + asset['name'], bytes=count, total=total)
                    last = value
        if digest(partial) != asset['sha256']:
            raise ValueError('下载校验失败：' + asset['name'])
        os.replace(partial, target)
        return target
    finally:
        partial.unlink(missing_ok=True)


def install(root):
    here = Path(__file__).parent
    manifest = json.loads((here / 'beauty-manifest.json').read_text(encoding='utf-8'))
    models = root / 'models' / 'beauty-v1'
    # Torch is needed only for the first conversion. Fresh runtimes install its
    # pinned CPU wheels; existing complete dependencies are left alone.
    for asset in manifest['wheels']:
        module = {'MarkupSafe': 'markupsafe', 'typing_extensions': 'typing_extensions'}.get(asset['package'], asset['package'])
        if importlib.util.find_spec(module) is not None:
            continue
        wheel = download(asset, root / 'cache' / 'beauty-wheels')
        site = root / 'runtime' / 'Lib' / 'site-packages'
        with zipfile.ZipFile(wheel) as archive:
            for entry in archive.infolist():
                target = (site / entry.filename).resolve()
                if not target.is_relative_to(site.resolve()):
                    raise ValueError('组件路径无效。')
            archive.extractall(site)
        importlib.invalidate_caches()
    for asset in manifest['models']:
        download(asset, models)
    receipt = models / 'ready.json'
    previous = json.loads(receipt.read_text()) if receipt.exists() else {}
    for kind in ['face', 'retouch', 'detection', 'inpainting']:
        outputs = [models / (kind + suffix) for suffix in ['.xml', '.bin']]
        if all(f.is_file() and previous.get(f.name) == digest(f) for f in outputs):
            continue
        emit(progress=0, message='准备完整模型：' + kind + '（首次运行需要等待）')
        result = subprocess.run([sys.executable, str(here / 'beauty-export.py'), str(models), kind], capture_output=True, text=True, encoding='utf-8')
        if result.returncode:
            raise RuntimeError('模型准备失败：' + kind + '\n' + result.stderr[-3000:])
        previous.update({f.name: digest(f) for f in outputs})
        temp = receipt.with_suffix('.tmp')
        temp.write_text(json.dumps(previous), encoding='utf-8')
        os.replace(temp, receipt)
    emit(result={'installed': True, 'model': 'ABPN / U-Net FP32 + RetinaFace ResNet50 FP32'})


if __name__ == '__main__':
    try:
        install(Path(json.load(sys.stdin)['root']))
    except Exception as error:
        emit(error=str(error))
        sys.exit(1)
