' Ouvre l'atelier (raccourci « Atelier » du bureau).
' Si le serveur local ne tourne pas, le démarre en arrière-plan (sans
' fenêtre), attend qu'il réponde, puis ouvre http://localhost:5180 dans le
' navigateur par défaut. Pour arrêter le serveur : redémarrer le PC, ou fermer
' « Node.js JavaScript Runtime » dans le Gestionnaire des tâches.
Option Explicit

Const ADRESSE = "http://localhost:5180/"
Dim fso, shell, dossier, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

Function ServeurPret()
  Dim http
  ServeurPret = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1000, 1000, 2000, 2000
  http.Open "GET", ADRESSE, False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then ServeurPret = True
  End If
  On Error GoTo 0
End Function

If Not ServeurPret() Then
  shell.CurrentDirectory = dossier
  shell.Run """C:\Program Files\nodejs\node.exe"" """ & dossier & "\node_modules\vite\bin\vite.js""", 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If ServeurPret() Then Exit For
  Next
  If Not ServeurPret() Then
    MsgBox "L'atelier n'a pas démarré." & vbCrLf & "Dans un terminal : cd " & dossier & " puis npm run dev", vbExclamation, "Atelier"
    WScript.Quit 1
  End If
End If

shell.Run ADRESSE
