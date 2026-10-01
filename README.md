# Dienstplaner – Labor

Next.js-App für den Laborschichtplaner, bereit für Vercel.

## Was sich geändert hat (gegenüber der Claude-Artefakt-Version)

Die Claude-Artefakt-Version nutzte `window.storage`, eine API, die es nur innerhalb
der Claude.ai-Vorschau gibt. Für eine echte, eigenständige App wurde das durch
`lib/storage.js` ersetzt — dieselbe Funktionsweise, aber auf echtem `localStorage`
basierend, das in jedem Browser funktioniert.

**Wichtig:** `localStorage` speichert nur lokal in diesem einen Browser. Für
Daten, die über mehrere Geräte/Nutzer hinweg sichtbar sein sollen (z. B. wenn
mehrere Personen im Team den Plan bearbeiten), muss `lib/storage.js` später durch
echte Supabase-Aufrufe ersetzt werden — die Funktionssignaturen (`get`, `set`,
`list`, `delete`) sind absichtlich so gehalten, dass dieser Umbau einfach bleibt.

## Lokal starten

```bash
npm install
npm run dev
```

Dann [http://localhost:3000](http://localhost:3000) im Browser öffnen.

## Auf Vercel veröffentlichen

1. **Dieses Projekt auf GitHub hochladen** (neues Repository erstellen, diesen
   Ordner hochladen oder per `git push` übertragen).
2. Auf [vercel.com](https://vercel.com) einloggen (Anmeldung mit dem
   GitHub-Konto ist am einfachsten).
3. **„Add New…“ → „Project“** klicken.
4. Das gerade hochgeladene GitHub-Repository auswählen → **„Import“**.
5. Vercel erkennt automatisch, dass es sich um ein Next.js-Projekt handelt —
   die Standardeinstellungen müssen nicht geändert werden.
6. **„Deploy“** klicken und ein paar Minuten warten.
7. Fertig — Vercel gibt eine Live-URL aus (z. B. `dein-projekt.vercel.app`),
   über die die App von überall erreichbar ist.

Jede weitere Änderung, die später auf GitHub gepusht wird, wird von Vercel
automatisch neu veröffentlicht.
