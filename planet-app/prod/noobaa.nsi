!define NB "NooBaa"
!define ICON "noobaa_icon24.ico"
!define SMDIR "$SMPROGRAMS\${NB}"
!define UNINST "Uninstall-${NB}"

OutFile "noobaa-setup.exe"
Name "${NB}"
Icon "${ICON}"
InstallDir "$PROGRAMFILES\${NB}"
RequestExecutionLevel admin
Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

# default section
Section "install"
	SetOutPath $INSTDIR
	WriteUninstaller "$INSTDIR\uninstall-noobaa.exe"
	File "${ICON}"
	File "noobaa.exe"
	File "nw.pak"
	File "ffmpegsumo.dll"
	File "icudt.dll"
	File "libEGL.dll"
	File "libGLESv2.dll"
	CreateDirectory "${SMDIR}"
	CreateShortCut "${SMDIR}\${UNINST}.lnk" "$INSTDIR\uninstall-noobaa.exe"
	CreateShortCut "${SMDIR}\${NB}.lnk" "$INSTDIR\noobaa.exe" "" "$INSTDIR\${ICON}"
	CreateShortCut "$SMSTARTUP\${NB}.lnk" "$INSTDIR\noobaa.exe" "" "$INSTDIR\${ICON}"
	ExecShell "" "$INSTDIR\noobaa.exe"
SectionEnd

Section "uninstall"
	Delete "$INSTDIR\${ICON}"
	Delete "$INSTDIR\noobaa.exe"
	Delete "$INSTDIR\nw.pak"
	Delete "$INSTDIR\ffmpegsumo.dll"
	Delete "$INSTDIR\icudt.dll"
	Delete "$INSTDIR\libEGL.dll"
	Delete "$INSTDIR\libGLESv2.dll"
	Delete "$INSTDIR\uninstall-noobaa.exe"
	Delete "$SMSTARTUP\${NB}.lnk"
	Delete "${SMDIR}\${NB}.lnk"
	Delete "${SMDIR}\${UNINST}.lnk"
	RMDir "${SMDIR}"
	RMDir "$INSTDIR"
SectionEnd