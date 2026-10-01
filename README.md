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

## Supabase einrichten (für die Anwesenheits-API)

1. Das vorher erstellte Supabase-Projekt öffnen -> **Project Settings -> API**.
2. Drei Werte kopieren: **Project URL**, **anon public** Key, **service_role** Key.
3. `.env.local.example` zu `.env.local` kopieren und die drei Werte eintragen.
4. Auf Vercel dieselben drei Variablen unter **Project Settings -> Environment Variables**
   eintragen (sonst funktioniert die API nach dem Deploy nicht).

## Anwesenheits-Endpunkt (für das Chip-Lesegerät)

Nach dem Deploy ist der Endpunkt erreichbar unter:

```
https://DEIN-PROJEKT.vercel.app/api/attendance
```

- **GET** → einfacher Health-Check (zeigt, dass der Endpunkt läuft).
- **POST** → nimmt einen Scan entgegen und speichert ihn in `attendance_events`.
  Details zum erwarteten Format stehen als Kommentar oben in
  `app/api/attendance/route.js`. Sobald das genaue Gerät feststeht, ist diese
  Datei die einzige, die an das tatsächliche Protokoll angepasst werden muss.

Zum Testen z. B. mit curl:

```bash
curl -X POST https://DEIN-PROJEKT.vercel.app/api/attendance \
  -H "Content-Type: application/json" \
  -d '{"badge_code": "TEST123"}'
```

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
