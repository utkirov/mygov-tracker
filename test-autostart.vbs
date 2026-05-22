Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Set http = CreateObject("MSXML2.XMLHTTP")

Dim logPath, projectDir, nodeCmd, launcherPath, healthUrl
projectDir = "D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase"
nodeCmd = "C:\Program Files\nodejs\node.exe"
launcherPath = projectDir & "\scripts\background-server.mjs"
healthUrl = "http://127.0.0.1:3000/api/health"
logPath = projectDir & "\autostart-test.log"

Set logFile = fso.CreateTextFile(logPath, True)
logFile.WriteLine "=== Autostart Test ===" & vbCrLf
logFile.WriteLine "Time: " & Now & vbCrLf
logFile.WriteLine "Project directory: " & projectDir
logFile.WriteLine "Launcher: " & launcherPath & vbCrLf

logFile.WriteLine "Testing node access..."
Dim exitCode, attempts, ready
exitCode = sh.Run("cmd /c """ & nodeCmd & """ --version >> """ & logPath & """ 2>&1", 0, True)
logFile.WriteLine "node check exit code: " & exitCode & vbCrLf

If fso.FolderExists(projectDir) Then
  logFile.WriteLine "Project directory exists: OK"
Else
  logFile.WriteLine "Project directory MISSING!"
  logFile.Close
  MsgBox "Project directory missing. Check: " & logPath
  WScript.Quit 1
End If

logFile.WriteLine "Starting background launcher..."
exitCode = sh.Run("cmd /c """ & nodeCmd & """ """ & launcherPath & """ >> """ & logPath & """ 2>&1", 0, True)
logFile.WriteLine "launcher exit code: " & exitCode & vbCrLf

ready = False
For attempts = 1 To 15
  On Error Resume Next
  http.Open "GET", healthUrl, False
  http.Send
  If Err.Number = 0 And http.Status = 200 Then
    ready = True
    Exit For
  End If
  Err.Clear
  On Error GoTo 0
  WScript.Sleep 2000
Next

If ready Then
  logFile.WriteLine "Health endpoint is ready: " & healthUrl
  logFile.WriteLine http.responseText
Else
  logFile.WriteLine "Health endpoint did not become ready in time: " & healthUrl
End If

logFile.WriteLine "Test completed at " & Now
logFile.Close()

MsgBox "Test completed. Check: " & logPath
