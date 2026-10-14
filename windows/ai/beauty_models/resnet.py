"""Full ResNet50 backbone with the torchvision checkpoint naming contract."""
from collections import OrderedDict
import torch.nn as nn


class Bottleneck(nn.Module):
    def __init__(self, channels, width, stride=1):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, width, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(width)
        self.conv2 = nn.Conv2d(width, width, 3, stride, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(width)
        self.conv3 = nn.Conv2d(width, width * 4, 1, bias=False)
        self.bn3 = nn.BatchNorm2d(width * 4)
        self.relu = nn.ReLU(inplace=True)
        self.downsample = nn.Sequential(nn.Conv2d(channels, width * 4, 1, stride, bias=False), nn.BatchNorm2d(width * 4)) if stride != 1 or channels != width * 4 else None

    def forward(self, x):
        residual = self.downsample(x) if self.downsample is not None else x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.relu(self.bn2(self.conv2(out)))
        return self.relu(self.bn3(self.conv3(out)) + residual)


class ResNet50(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 64, 7, 2, 3, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)
        self.maxpool = nn.MaxPool2d(3, 2, 1)
        channels = 64
        for stage, (width, count) in enumerate([(64, 3), (128, 4), (256, 6), (512, 3)], 1):
            blocks = [Bottleneck(channels, width, 1 if stage == 1 else 2)]
            blocks.extend(Bottleneck(width * 4, width) for _ in range(count - 1))
            setattr(self, 'layer' + str(stage), nn.Sequential(*blocks))
            channels = width * 4

    def forward(self, x):
        x = self.maxpool(self.relu(self.bn1(self.conv1(x))))
        x = self.layer1(x)
        outputs = OrderedDict()
        for i in range(2, 5):
            x = getattr(self, 'layer' + str(i))(x)
            outputs[str(i)] = x
        return outputs
