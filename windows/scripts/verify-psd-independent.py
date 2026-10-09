"""Validate PSD records and independently recomposite supported exported fixtures."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from psd_tools import PSDImage

directory = Path(__file__).resolve().parent.parent / 'validation'
results = []
for name in ['core', 'example', 'transforms', 'pass-through']:
    psd = PSDImage.open(directory / f'{name}.psd')
    expected = np.asarray(Image.open(directory / f'{name}.png').convert('RGBA'), dtype=np.int16)
    cached = np.asarray(psd.topil().convert('RGBA'), dtype=np.int16)
    rendered = np.asarray(psd.composite(force=True).convert('RGBA'), dtype=np.int16)
    cached_diff = int(np.abs(cached - expected).max())
    rendered_diff = int(np.abs(rendered - expected).max())
    layers = list(psd.descendants())
    if name == 'core':
        assert [l.name for l in layers] == ['背景', '中文组', '蒙版图层', '剪贴颜色']
    result = dict(name=name, size=list(psd.size), layers=len(layers), groups=sum(l.is_group() for l in layers), masks=sum(l.has_mask() for l in layers), cached_max_diff=cached_diff, rendered_max_diff=rendered_diff)
    assert cached_diff == 0, result
    assert rendered_diff <= 3, result
    assert result['groups'] >= 1 and result['masks'] >= 1, result
    results.append(result)
(directory / 'independent-psd.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False, indent=2))
