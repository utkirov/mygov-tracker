Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
Dim projectDir : projectDir = "D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase"
Dim nodeCmd : nodeCmd = "C:\Program Files\nodejs\node.exe"
Dim launcherPath : launcherPath = "D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\scripts\background-server.mjs"
Dim logPath : logPath = "D:\utkirov\work\2026\AI\crm-invoices\.worktrees\codex-local-no-supabase\autostart.log"

Set logFile = fso.OpenTextFile(logPath, 8, True)
logFile.WriteLine "[" & Now & "] Autostart task triggered"
logFile.Close

sh.Run """" & nodeCmd & """ """ & launcherPath & """", 0, False
