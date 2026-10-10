# 本地 AI 抠图组件

0.6.0 使用本地 OpenVINO 推理 U²-Net。选择图层，在“选择 → 选择主体 / 移除背景”中安装组件并运行。轻量模型下载 4,574,861 字节，完整模型下载 175,997,641 字节；安装组件约 101 MB 下载。模型、运行时和设备编译缓存不会打进基础安装包或项目文件。

Python 3.12.10 嵌入式运行时、OpenVINO 2026.0.0、NumPy 2.3.5、Pillow 12.1.0 和 OpenVINO Telemetry 2025.2.0 从官方 Python/PyPI 获取，URL 和 SHA-256 固定在 `ai/runtime.json`。无需用户已有 Python 或 pip，不修改系统 Python。安装到 `%LOCALAPPDATA%\CompositorZH\AI\runtime`，模型在 `models`，编译结果在 `cache`。每次加载权重会核对校验值，损坏时重新下载；下载失败可重试。停止按钮终止本次辅助进程，不修改文档像素。

U²-Net 源码和权重来自 [U-2-Net 官方仓库](https://github.com/xuebinqin/U-2-Net)，ONNX 权重使用 [rembg 的公开模型发行](https://github.com/danielgatis/rembg/releases/tag/v0.0.0)。Apache 2.0 许可证保存在 `ai/U2NET-LICENSE.txt`。轻量模型 SHA-256 为 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`，完整模型为 `8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491`。

启用 NPU 时，代码检查实际可用设备并向 OpenVINO 请求 `NPU` 编译和执行；关闭时明确请求 `CPU`。界面显示编译后 `EXECUTION_DEVICES`，不能仅凭硬件名称判断已使用 NPU。缺少 NPU、驱动不可用或模型编译/执行失败会明确提示回退 CPU。支持范围遵循 [OpenVINO 系统要求](https://docs.openvino.ai/2026/about-openvino/release-notes-openvino/system-requirements.html) 与 [NPU 插件说明](https://docs.openvino.ai/2026/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.html)。当前实现针对 OpenVINO 支持的 Intel NPU；Ryzen AI / Qualcomm NPU 未实现。NPU 并非在所有小模型上都快于 CPU。

本机 Intel Core Ultra 7 270K Plus / Intel AI Boost 实测：轻量和完整模型均分别报告 `CPU` 与 `NPU` 实际执行，未回退。对同一 640 × 360 图片，轻量 CPU/NPU 蒙版的阈值主体重合率约 99.54%，平均灰度差约 0.70/255。完整模型首次单次测量 CPU 约 126 ms、NPU 约 236 ms；编译、进程启动和界面处理另计，重复执行结果可能不同。

推理输入统一缩放到 320 × 320，输出恢复到图层原始尺寸。预览与应用支持羽化、边缘偏移和现有蒙版相交，结果为普通可绘画灰度蒙版，并跟随完整图层变换。精细毛发、半透明玻璃、复杂背景可能需要用黑白画笔继续修整。此版本提供两个实际可运行的 U²-Net 模型，没有将 Selfie Segmentation、RMBG、SAM2 或 DeepLab 显示为已实现功能。

网络仅用于获取组件和模型；图片在本机处理。已缓存的组件和权重可离线运行。Python/OpenVINO 等组件自己的许可证随官方归档和 wheel 保存在本机运行目录；OpenVINO 遥测禁用。
