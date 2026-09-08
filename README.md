# Schreib

**Schreib** ist ein browserbasierter Handschrift-Font-Generator. Du zeichnest deine eigenen Zeichen mit S Pen, Finger oder Maus und kannst daraus direkt einen OTF-Font erzeugen.

## Was jetzt drin ist

- 81 Zeichen: A–Z, a–z, 0–9, deutsche Sonderzeichen und Satzzeichen
- 3 Varianten pro Zeichen
- S Pen, Finger und Maus über Pointer Events
- Druckstärke wird bei kompatiblen Stiften als Strichstärke übernommen
- Undo / Redo und Löschen
- automatische lokale Speicherung im Browser
- direkte Live-Vorschau des aktuellen Textes
- fehlende Glyphen werden klar markiert statt still versteckt
- OTF-Export über OpenType.js
- hochauflösender PNG-Export
- Drucken / Als PDF speichern
- Dataset als JSON importieren/exportieren
- Reset-Funktion
- responsive Oberfläche für Smartphone, Tablet und Desktop

## Wie die Handschrift technisch funktioniert

Die Schreibfläche speichert jeden Strich als Punktfolge mit `x`, `y` und `w` (Strichbreite). Beim Export werden diese Striche in gefüllte Konturen umgerechnet und als OpenType-Glyphen in einen Font geschrieben.

Die Live-Vorschau baut den Font im Browser auf und rendert jede vorhandene Glyphe über OpenType.js. Zeichen, die noch nicht erfasst wurden, bleiben als neutrale Systemschrift sichtbar und werden unter der Vorschau aufgelistet.

Die OpenType.js-Dokumentation beschreibt sowohl das Erzeugen eigener Glyphenpfade als auch das Schreiben einer Font-Datei im Browser. citeturn982449search0turn301558search1

## Datenschutz

Die Handschrift-Daten werden standardmäßig nur im `localStorage` des Browsers gespeichert. Ein Dataset verlässt den Browser erst, wenn du es selbst als JSON exportierst oder eine Datei herunterlädst.

## Start

Die Seite ist als statische GitHub-Pages-App aufgebaut. `index.html` liegt direkt im Repository-Root. Für den Font-Export wird OpenType.js als Browser-CDN eingebunden.
