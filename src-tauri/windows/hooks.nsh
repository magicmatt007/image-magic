; Extra steps for the Windows installer (see bundle.windows.nsis.installerHooks).

; When the app updates itself, it starts this installer and then quits. The
; installer's own "is the app still running?" check can come before the app has
; finished quitting, and then the update aborts with "Failed to kill
; image-magic" (tauri-apps/tauri#16277). So during an update, first wait up to
; 20 seconds for the old app to let go of its program file. A running program
; file can't be opened for writing; once that works, the app has quit. Nothing
; is written to the file here.
!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode = 1
  ${AndIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
    Push $0
    Push $1
    StrCpy $1 0
    im_wait_for_exit:
      ClearErrors
      FileOpen $0 "$INSTDIR\${MAINBINARYNAME}.exe" a
      ${IfNot} ${Errors}
        FileClose $0
      ${ElseIf} $1 < 80
        ${IfThen} $1 = 0 ${|} DetailPrint "Waiting for image-magic to close..." ${|}
        Sleep 250
        IntOp $1 $1 + 1
        Goto im_wait_for_exit
      ${EndIf}
    Pop $1
    Pop $0
  ${EndIf}
!macroend
