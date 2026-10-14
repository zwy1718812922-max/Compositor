"""Convert the verified full checkpoints once; retain FP32 weights."""
import os
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import torch
import openvino as ov
sys.path.insert(0, str(Path(__file__).resolve().parent))
from beauty_models.unet_deploy import UNet
from beauty_models.detection_unet_in import DetectionUNet
from beauty_models.inpainting_unet import RetouchingNet
from beauty_models.retinaface import RetinaFace

torch.set_num_threads(min(4, os.cpu_count() or 1))
root, kind = Path(sys.argv[1]), sys.argv[2]
if kind == 'retouch':
    net = UNet(3, 3, init_weights=False)
    weights = torch.load(root / 'pytorch_model.pt', map_location='cpu', weights_only=True)['generator']
    example = torch.zeros(1, 3, 512, 512)
elif kind == 'face':
    net = RetinaFace({'name': 'Resnet50', 'pretrain': False, 'in_channel': 256, 'out_channel': 256})
    weights = torch.load(root / 'retinaface_resnet50_2020-07-20_old_torch.pth', map_location='cpu', weights_only=True)
    weights = {k.removeprefix('module.'): v for k, v in weights.items()}
    example = torch.zeros(1, 3, 640, 640)
elif kind == 'detection':
    net = DetectionUNet(3, 1, init_weights=False)
    weights = torch.load(root / 'joint_20210926.pth', map_location='cpu', weights_only=True)['detection_net']
    example = torch.zeros(1, 3, 768, 768)
elif kind == 'inpainting':
    net = RetouchingNet(4, 3, init_weights=False)
    weights = torch.load(root / 'joint_20210926.pth', map_location='cpu', weights_only=True)['inpainting_net']
    example = (torch.zeros(1, 3, 512, 512), torch.ones(1, 1, 512, 512))
else:
    raise ValueError('Unknown model')
net.load_state_dict(weights, strict=True)
net.eval()
model = ov.convert_model(net, example_input=example)
shape = [list(x.shape) for x in example] if isinstance(example, tuple) else [list(example.shape)]
model.reshape({port: sizes for port, sizes in zip(model.inputs, shape)})
target = root / (kind + '.xml')
temporary = root / (kind + '-converting.xml')
ov.save_model(model, temporary, compress_to_fp16=False)
os.replace(temporary.with_suffix('.bin'), target.with_suffix('.bin'))
os.replace(temporary, target)
