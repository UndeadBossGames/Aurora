; Aurora Windows installer (NSIS 3, Modern UI 2)
; Built by scripts/build-win.sh - per-user install, no admin rights needed.
Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef APPDIR
  !define APPDIR "../dist/Aurora-win32-x64"
!endif
!ifndef OUTFILE
  !define OUTFILE "../dist/Aurora-Setup-${VERSION}.exe"
!endif

!define APPNAME "Aurora"
!define COMPANY "Aurora"
!define EXE "Aurora.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Aurora"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Aurora"
InstallDirRegKey HKCU "Software\Aurora" "InstallDir"
BrandingText "Aurora ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Aurora"
VIAddVersionKey "FileDescription" "Aurora Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "CompanyName" "${COMPANY}"
VIAddVersionKey "LegalCopyright" "MIT License"

!include "MUI2.nsh"
!include "FileFunc.nsh"

!define MUI_ICON "../assets/icon.ico"
!define MUI_UNICON "../assets/icon.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "wizard.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "wizard.bmp"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welcome to Aurora"
!define MUI_WELCOMEPAGE_TEXT "This will install Aurora ${VERSION} on your computer.$\r$\n$\r$\nAurora is a music and video player with profiles and a built-in Video Downloader.$\r$\n$\r$\nNo administrator rights are needed. Click Next to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Aurora"
!define MUI_FINISHPAGE_TITLE "Aurora is ready"
!define MUI_FINISHPAGE_TEXT "Aurora has been installed. You'll find it on your Desktop and in the Start menu."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ; close a running copy so files can be replaced (give an updating Aurora a moment to exit first)
  Sleep 1200
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Sleep 300
FunctionEnd

Section "Aurora" SecMain
  SectionIn RO
  SetOutPath "$INSTDIR"
  ; remove files from older versions (keeps user data, which lives in %APPDATA%\Aurora)
  RMDir /r "$INSTDIR\resources\app"
  File /r "${APPDIR}/*.*"

  WriteUninstaller "$INSTDIR\Uninstall Aurora.exe"
  File "/oname=$INSTDIR\aurora.ico" "../assets/icon.ico"

  ; shortcuts
  CreateShortcut "$SMPROGRAMS\Aurora.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\aurora.ico" 0
  CreateShortcut "$DESKTOP\Aurora.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\aurora.ico" 0

  ; Add/Remove Programs entry
  WriteRegStr HKCU "Software\Aurora" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Aurora"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${COMPANY}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\aurora.ico"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall Aurora.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall Aurora.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"

  ; In-app updates run "Aurora-Setup.exe /S /RELAUNCH": reopen Aurora when the silent install finishes
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/RELAUNCH" $R1
  IfErrors +2 0
    Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Delete "$SMPROGRAMS\Aurora.lnk"
  Delete "$DESKTOP\Aurora.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Aurora"
  ; Your profiles, playlists and downloads are kept. Delete %APPDATA%\Aurora to remove them too.
SectionEnd
