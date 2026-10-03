# Dienstplaner

Next.js-App, bereit für Vercel. Enthält drei Seiten und eine Zeiterfassungs-API.

| Adresse | Was |
|---|---|
| `/` | Dienstplaner **Labor** (Schichten vorbelegt) – nur mit Anmeldung, Leitung, Produkt „Dienstplaner Labor“ |
| `/allgemein` | Dienstplaner **allgemein** (Früh/Spät vorbelegt, alles frei änderbar) – nur mit Anmeldung, Leitung, Produkt „Dienstplaner allgemein“ |
| `/mitarbeiter` | **Meine Schichten** – App für Mitarbeitende, zeigt die **veröffentlichten** Schichten aus der Datenbank (Plan, Team). Anträge/Zeiten/Wünsche folgen. |
| `/demo` | Vorschau der Mitarbeiter-App mit Beispieldaten (ohne Anmeldung) |
| `/konto` | **Anmeldung** und Firmenübersicht mit Sicherheits-Check (zeigt, dass Firmen getrennt sind) |
| `/api/attendance` | Eingang für das Chip-Lesegerät. Jedes Gerät gehört zu **einer Firma** und meldet sich mit Seriennummer + Geheimnis (Tabelle `devices`). |

## Plan veröffentlichen
Im Dienstplaner oben **„Personen aus Datenbank laden“**, Plan erstellen, dann **„Veröffentlichen“**. Beide Dienstplaner schreiben in dieselben Tabellen; die Mitarbeiter-App liest sie. Die Verbindung gilt pro Firma und hängt am Produkt „Mitarbeiter-App“ (`org_products`).

## Excel-Export
Im Dienstplaner nach dem Erstellen auf **„Als Excel herunterladen (.xlsx)“** tippen. Die Datei hat die
Blätter *Dienstplan*, *Nach Mitarbeiter*, *Zusammenfassung* (und *Hinweise*) mit Farben und lebenden
Formeln. Auf dem Handy öffnet sich das Teilen-Menü („In Dateien sichern“, Numbers, Mail …).

## Auf dem Handy installieren (PWA)
- **iPhone (Safari):** Seite öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**.
- **Android (Chrome):** Menü ⋮ → **„App installieren“**.

Für Mitarbeitende den Link `…vercel.app/mitarbeiter` verteilen, für die Leitung `…vercel.app/`.

## Wichtig
- Archiv/Saldo werden pro Browser in `localStorage` gespeichert (`lib/storage.js`). Für geräteübergreifende
  Daten später durch Supabase ersetzen.
- Die Mitarbeiter-App zeigt Beispieldaten, bis sie mit der Datenbank verbunden ist.

## Lokal starten
```bash
npm install
npm run dev
```

## Supabase
Kopiere `.env.local.example` zu `.env.local` und trage die drei Werte ein (auf Vercel unter
*Settings → Environment Variables*). SQL-Skripte (in dieser Reihenfolge): `attendance-schema.sql`, danach `multi-tenant-schema.sql`
(Firmen, Produkte, Datenschutz zwischen Firmen). Das Zeiterfassungsgerät muss danach in `devices` registriert sein.
