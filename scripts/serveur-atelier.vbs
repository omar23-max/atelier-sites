' Lance le gardien de l'atelier sans fenêtre (au démarrage de Windows).
Set fso = CreateObject("Scripting.FileSystemObject")
dossier = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = dossier
shell.Run """C:\Program Files\nodejs\node.exe"" """ & dossier & "\scripts\serveur-atelier.mjs""", 0, False
