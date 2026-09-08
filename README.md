# Schreib ✍️

Ein lokaler Handschrift-Font-Generator für Browser und Tablet.

## Erster funktionierender Stand

- Zeichen mit Finger, Maus oder Stylus direkt auf einer Canvas-Fläche schreiben
- bis zu drei Varianten pro Zeichen speichern
- Dataset im Browser über `localStorage` sichern
- Dataset als JSON exportieren und wieder importieren
- aus den gespeicherten Glyphen direkt im Browser einen OTF-Font bauen
- eine Live-Vorschau mit dem erzeugten Font anzeigen
- responsive Oberfläche für Smartphone, Tablet und Desktop

## Start

Das Projekt ist ohne Build-System angelegt. `index.html` kann als statische Website ausgeliefert werden, zum Beispiel über GitHub Pages.

Die Font-Erzeugung verwendet OpenType.js 2.0.0 im Browser. OpenType.js unterstützt das Erstellen eines Fonts aus eigenen Glyph-Pfaden und das Exportieren als ArrayBuffer/Font-Datei. Die aktuelle Implementierung nutzt daraus eine lokale, browserbasierte Pipeline.

## Datenschutz

Die Handschrift bleibt standardmäßig im Browser. Erst beim Dataset-Export wird eine JSON-Datei erzeugt, die der Nutzer selbst speichert.

## Aktuelle Grenzen

Die erste Version wandelt die erfassten Mittellinien in einfache geschlossene Strichkonturen um. Für eine besonders natürliche Handschrift kommen als nächste Ausbaustufen bessere Kurven-Glättung, rundere Kappen und OpenType-Alternativen hinzu.

## Nächste Ausbaustufen

1. bessere Glättung und Kontur-Erzeugung für handschriftliche Striche
2. automatische Ausrichtung an Grundlinie und Mittellinie
3. echte OpenType-Alternativen für mehrere Buchstabenvarianten
4. PNG/PDF-Export für Notiz-Apps
5. Installations-/PWA-Modus für Tablet und Smartphone
