' Lance la sauvegarde GitHub sans ouvrir de fenêtre (utilisé par la tâche Windows).
Set fso = CreateObject("Scripting.FileSystemObject")
dossier = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
CreateObject("WScript.Shell").Run """C:\Program Files\nodejs\node.exe"" """ & dossier & "\scripts\sauvegarde-github.mjs""", 0, False
