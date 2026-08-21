' Runs soak-test-report.sh via git-bash with zero visible window.
' Wrapping bash.exe directly in a Scheduled Task still flashes a console
' window on each trigger; WScript.Shell.Run with windowStyle=0 suppresses it.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
cmd = "C:\Program Files\Git\usr\bin\bash.exe --login -c ""cd '"" & Replace(projectDir, ""\"", ""/"") & ""' && ./scripts/soak-test-report.sh >> scripts/soak-test-reports/cron.log 2>&1"""
shell.Run cmd, 0, True
