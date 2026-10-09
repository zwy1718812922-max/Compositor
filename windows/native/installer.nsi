Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!ifndef VERSION
  !define VERSION "0.5.0"
!endif
Name "Compositor 中文版"
OutFile "..\dist\Compositor-ZH-${VERSION}-x64-Lite-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\CompositorZH-Lite"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 16
ShowInstDetails show
ShowUninstDetails show
!define MUI_ICON "..\assets\icon.ico"
!define MUI_UNICON "..\assets\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TEXT "安装 Compositor 中文 Windows 11 版。$\r$\n$\r$\n包含分层 PSD、文字、绘画、蒙版、图层样式及智能对齐吸附。$\r$\n$\r$\n轻量版使用本机 Microsoft Edge WebView2 运行时，安装在当前用户的程序目录中。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
Section "Compositor" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "..\dist\lite-unpacked\*"
  WriteUninstaller "$INSTDIR\卸载.exe"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/NOSHORTCUT" $R1
  IfErrors 0 skip_shortcut
  CreateShortCut "$DESKTOP\Compositor 中文版（轻量版）.lnk" "$INSTDIR\Compositor 中文版.exe"
  CreateDirectory "$SMPROGRAMS\Compositor 中文版（轻量版）"
  CreateShortCut "$SMPROGRAMS\Compositor 中文版（轻量版）\Compositor 中文版.lnk" "$INSTDIR\Compositor 中文版.exe"
  CreateShortCut "$SMPROGRAMS\Compositor 中文版（轻量版）\卸载.lnk" "$INSTDIR\卸载.exe"
  skip_shortcut:
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "DisplayName" "Compositor 中文版（轻量版）"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "Publisher" "Compositor contributors"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "UninstallString" '$\"$INSTDIR\卸载.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "DisplayIcon" "$INSTDIR\Compositor 中文版.exe"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite" "NoRepair" 1
SectionEnd
Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\Compositor 中文版（轻量版）.lnk"
  Delete "$SMPROGRAMS\Compositor 中文版（轻量版）\Compositor 中文版.lnk"
  Delete "$SMPROGRAMS\Compositor 中文版（轻量版）\卸载.lnk"
  RMDir "$SMPROGRAMS\Compositor 中文版（轻量版）"
  Delete "$INSTDIR\Compositor 中文版.exe"
  Delete "$INSTDIR\Microsoft.Web.WebView2.Core.dll"
  Delete "$INSTDIR\Microsoft.Web.WebView2.WinForms.dll"
  Delete "$INSTDIR\WebView2Loader.dll"
  Delete "$INSTDIR\WebView2-LICENSE.txt"
  Delete "$INSTDIR\LICENSE"
  RMDir /r "$INSTDIR\src"
  RMDir /r "$INSTDIR\assets"
  RMDir /r "$INSTDIR\native"
  Delete "$INSTDIR\卸载.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\CompositorZH-Lite"
SectionEnd
