# 本地 Git 管理

本仓库从当前已有文件建立本地历史。原版 macOS 源码和 Windows 中文移植均受版本管理；依赖、安装包、运行时、测试输出及生成的预览图不进入 Git。

## 基线和分支

- `main`：已经交付的 Windows 0.4.0 基线。
- `windows-v0.4.0`：标记此次基线，方便比较和恢复旧版源码。
- `codex/windows-advanced`：Windows 功能开发分支，包含 PSD、变换、文字、FX、NPU 抠图、多文档和 ICC CMYK。
- `windows-v0.5.0`、`windows-v0.6.0`、`windows-v0.7.0`：对应后续本地交付，安装包由各版本源码重建。

该基线是本地快照提交，不是重新创建的上游历史。快照来源为原项目提交 `22c7b8d5b23bb1e27a5746912061b23757c4f554`，其原有许可证保留。已登记只用于获取原项目更新的远程 `upstream`：

```text
https://github.com/robbietilton/Compositor.git
```

尚未配置用于发布本项目的 `origin`，也没有将本地代码推送到 GitHub。初始化时 GitHub 连接不可用，不影响本地提交、查看差异和分支管理。

## 常用操作

在 `E:\Compositor` 中运行：

```powershell
git status
git diff
git log --oneline --decorate -10
git diff windows-v0.4.0 -- windows/src
```

每次修改完成并验证后，只暂存相关文件，再提交：

```powershell
git add windows/src/app.js windows/tests/editor.spec.cjs
git diff --cached
git commit -m "fix(windows): describe the verified change"
```

需要撤销已经提交的修改时，使用 `git revert <提交哈希>` 生成撤销提交并保留历史。需要查看旧版而保留当前工作目录时，可使用独立工作目录：

```powershell
git worktree add ..\Compositor-v0.4.0 windows-v0.4.0
```

## 上游与发布

网络恢复后可获取原项目历史：

```powershell
git fetch upstream
```

本地 Windows 基线与上游历史独立，不能直接执行普通的 `git pull upstream main`。先检查上游变化，再按需要移植相关修改。

若要将此移植备份到自己的 GitHub 仓库，先创建一个空仓库（不自动创建 README），将自己的仓库地址设置为 `origin`，然后推送：

```powershell
git remote add origin https://github.com/你的用户名/你的仓库.git
git push -u origin main
git push -u origin codex/windows-advanced
git push origin windows-v0.4.0 windows-v0.5.0 windows-v0.6.0
```

安装包继续在 `windows/dist` 本地生成，发布时作为 Release 附件上传，无需提交到源码仓库。Git 只保存本地历史；异地备份需要额外推送至自己的远程仓库。

0.5.0 的 PSD、FX、文字、变换、对齐吸附及 WebView2 轻量版在 `codex/windows-advanced` 开发，完成后记录为 `windows-v0.5.0` 标签；原 0.4.0 基线保留。

0.6.0 的自由变换、文档关闭、填充与调整、本地字体、参数拖动、标尺及 NPU 抠图在同一分支继续开发，并记录为 `windows-v0.6.0`。
