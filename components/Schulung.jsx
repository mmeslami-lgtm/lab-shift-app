"use client";

import React, { useEffect, useMemo, useState } from "react";

// Schulung – kostenlose Einführung ohne KI: Lektionen je Rolle (Mitarbeiter, Leitung, Inhaber), echte Bilder mit
// hervorgehobenem Bereich, "Zeig mir" öffnet die Stelle im Programm, eine kurze Frage pro Lektion, Fortschritt
// wird auf dem Gerät gespeichert. Dazu eine Suche über Lektionen und häufige Fragen.
// onShow(key): host opens the place (app: "plan" | "time" | "requests" | "wishes"; planner: "antraege" | "anwesenheit" | "zugaenge")

const L = (id, title, text, extra = {}) => ({ id, title, text, ...extra });

const COURSES = {
  mitarbeiter: {
    title: "Mitarbeiter-App",
    lessons: [
      L("m-plan", "Dein Dienstplan", "Oben siehst du deine nächste Schicht, darunter den ganzen Monat. Tippe auf einen Tag: Du siehst die Uhrzeit und wer an dem Tag mit dir arbeitet. Geänderte Schichten sind markiert.",
        { img: "app-plan", phone: true, box: [2, 6, 97, 27], show: "plan", keys: "plan schicht kalender team monat",
          q: ["Wie siehst du, wer an einem Tag mit dir arbeitet?", ["Den Tag im Kalender antippen", "In den Anträgen nachsehen", "Gar nicht"], 0] }),
      L("m-stempeln", "Stempeln: Kommen und Gehen", "Tippe unten auf „Stempeln“. Je nach Firma tippst du „Kommen“ oder „Gehen“ direkt im Handy, oder du scannst den QR-Code am Tablet im Eingang. Grün heißt: eingestempelt. Die Uhrzeit kommt vom Server.",
        { img: "app-ok", phone: true, box: [2, 38, 98, 66], keys: "stempeln kommen gehen qr terminal chip pin handy",
          q: ["Was bedeutet die grüne Anzeige nach dem Stempeln?", ["Ich bin eingestempelt", "Mein Urlaub ist genehmigt", "Es gab einen Fehler"], 0] }),
      L("m-zeiten", "Meine Zeiten und das Zeitkonto", "Unter „Zeiten“ steht oben dein Zeitkonto (Plus- oder Minusstunden), darunter jeder Tag. Tippe auf einen Tag, um Kommen, Gehen und Pause zu sehen.",
        { img: "app-zeiten", phone: true, box: [2, 5, 62, 16], show: "time", keys: "zeiten zeitkonto plus minus stunden überstunden",
          q: ["Wo siehst du deine Plus- oder Minusstunden?", ["Oben unter „Zeiten“", "Im Dienstplan", "Auf dem Terminal"], 0] }),
      L("m-vergessen", "Vergessen zu stempeln?", "Kein Problem: Öffne unter „Zeiten“ den Tag. Fehlt nur eine Zeit oder ist sie falsch, tippe „Korrektur beantragen“. Fehlt der ganze Tag, tippe „Zeit beantragen“ und trage Kommen und Gehen mit einem Grund ein. Die Leitung bestätigt; danach ist der Tag mit ✎ markiert.",
        { img: "app-zeiten", phone: true, box: [2, 30, 98, 92], show: "time", keys: "vergessen korrektur nachtragen zeit beantragen falsch",
          q: ["Du hast an einem Tag gar nicht gestempelt. Was tust du?", ["Den Tag öffnen und „Zeit beantragen“", "Am nächsten Tag doppelt stempeln", "Nichts"], 0] }),
      L("m-urlaub", "Urlaub beantragen", "Unter „Anträge“ siehst du oben, wie viel Urlaub du noch hast. Tippe „Urlaub“, wähle Von und Bis und sende den Antrag. Sobald die Leitung genehmigt, steht der Urlaub automatisch im Dienstplan.",
        { img: "app-antrag", phone: true, box: [3, 17, 95, 68], show: "requests", keys: "urlaub antrag urlaubskonto genehmigt resturlaub",
          q: ["Wann steht dein Urlaub im Dienstplan?", ["Sobald die Leitung genehmigt hat", "Sofort beim Senden", "Erst im nächsten Jahr"], 0] }),
      L("m-abwesend", "Krank, Fortbildung, Elternzeit …", "Alle Abwesenheiten laufen über „Anträge“: Krank mit oder ohne Attest, Fortbildung, Dienstreise, Freizeitausgleich, Mutterschutz, Elternzeit und mehr. Unter jeder Art steht kurz, was sie bedeutet. Krankmeldungen sieht nur die Leitung.",
        { img: "app-antrag", phone: true, box: [3, 26, 95, 34], show: "requests", keys: "krank attest fortbildung dienstreise mutterschutz elternzeit freizeitausgleich kur sonderurlaub",
          q: ["Wer sieht deine Krankmeldung?", ["Nur die Leitung", "Alle Kolleginnen und Kollegen", "Niemand"], 0] }),
      L("m-wuensche", "Wünsche für den nächsten Plan", "Unter „Wünsche“ markierst du Tage, an denen du frei haben oder eine bestimmte Schicht möchtest. Die Leitung sieht sie beim Planen; Wünsche sind keine Garantie, werden aber möglichst berücksichtigt.",
        { show: "wishes", icon: "💬", keys: "wünsche wunsch frei schicht wunschfrei",
          q: ["Sind Wünsche eine Garantie?", ["Nein, sie werden möglichst berücksichtigt", "Ja, immer", "Nur am Wochenende"], 0] }),
    ],
  },
  leitung: {
    title: "Leitung",
    lessons: [
      L("l-personen", "Mitarbeitende anlegen", "Im Dienstplaner unter „Personen“: Name, Wochenstunden und Vollzeit, Teilzeit oder Minijob. Häkchen für „befreit von Nachtdienst“ oder „Wochenende“. Fehlende Personalnummern vergibt ein Knopf automatisch.",
        { img: "personen", box: [54, 6, 99, 92], keys: "personen mitarbeiter anlegen wochenstunden teilzeit minijob personalnummer" }),
      L("l-plan", "Dienstplan erstellen und veröffentlichen", "Monat wählen, „Personen aus Datenbank laden“ – genehmigter Urlaub ist schon eingetragen – dann „Dienstplan erstellen“. Dienstigo prüft 60 Varianten und zeigt die beste. Mit „Veröffentlichen“ sehen alle ihren Plan in der App.",
        { img: "plan", box: [14, 7, 92, 100], keys: "dienstplan erstellen generieren veröffentlichen monat",
          q: ["Was müssen Sie für genehmigten Urlaub im neuen Monat tun?", ["Nichts – er wird automatisch übernommen", "Jeden Tag von Hand eintragen", "Den Plan zweimal erstellen"], 0] }),
      L("l-stunden", "Stunden fair verteilt", "Die Zusammenfassung zeigt pro Person Ziel und Differenz. So sehen Sie sofort, wer zu viele oder zu wenige Stunden hat. Ändern geht per Klick in die Zelle.",
        { img: "summe", box: [46, 9, 66, 98], keys: "ziel differenz stunden saldo zusammenfassung" }),
      L("l-antraege", "Anträge entscheiden", "Oben „Anträge“: genehmigen, ablehnen oder – bei schon genehmigtem Urlaub – „Stornieren“ mit Grund. Bei Elternzeit entscheiden Sie mit dem Häkchen, ob der Urlaub nach § 17 BEEG gekürzt wird (muss dem Mitarbeiter erklärt werden).",
        { icon: "📨", show: "antraege", keys: "anträge genehmigen ablehnen stornieren elternzeit kürzen",
          q: ["Ein genehmigter Urlaub soll doch nicht stattfinden. Was tun Sie?", ["Im Antrag „Stornieren“ mit Grund", "Den Mitarbeiter löschen", "Nichts"], 0] }),
      L("l-ausfall", "Krankmeldung, Ausfall, Einspringen", "Fällt jemand aus, nutzen Sie im Plan „Krankmeldung / Ausfall“: Dienstigo schlägt passende Vertretungen vor. Wer einspringt, wird im Stundenzettel als „eingesprungen“ markiert; dafür kann ein Zuschlag eingestellt werden.",
        { icon: "🤒", keys: "krank ausfall vertretung einspringen ersatz zusatzschicht" }),
      L("l-anwesenheit", "Anwesenheit und Stempeln", "„Anwesenheit“ zeigt, wer heute da ist, offene Korrekturen und vergessene Stempelungen. Dort wählen Sie auch: Nur Terminal, Nur Handy oder beides – und ob beim Handy-Stempeln der Standort gespeichert wird.",
        { img: "terminal", box: [21, 31, 78, 48], show: "anwesenheit", keys: "anwesenheit terminal handy mobil standort heute korrektur",
          q: ["Wo stellen Sie ein, ob mit dem Handy gestempelt werden darf?", ["In „Anwesenheit“ unter „Wie wird gestempelt?“", "Im Dienstplan", "Das geht nicht"], 0] }),
      L("l-stundenzettel", "Stundenzettel zum Monatsende", "In „Anwesenheit“ unten: Monat wählen, alle oder eine Person, „Drucken / PDF“. Jede Seite zeigt Netto, Soll, Zeitkonto, Urlaub, Krankheit, Zuschlagsstunden und jeden Tag.",
        { img: "stundenzettel", box: [0, 6, 100, 16], show: "anwesenheit", keys: "stundenzettel lohnabrechnung pdf drucken monatsende",
          q: ["Wie geben Sie die Stundenzettel an die Lohnbuchhaltung?", ["„Drucken / PDF“ und als PDF speichern", "Abfotografieren", "Gar nicht"], 0] }),
      L("l-eigene", "Ihre eigenen Zeiten", "Arbeiten Sie selbst im Plan, stempeln Sie mit „⏱ Stempeln“ und sehen „Meine Zeiten“. Eigene Korrekturen beantragen Sie dort – bestätigen kann sie der Inhaber oder eine andere Leitung, nicht Sie selbst.",
        { icon: "⏱", keys: "eigene zeiten leitung selbst stempeln bestätigen" }),
    ],
  },
  inhaber: {
    title: "Inhaber",
    lessons: [
      L("i-zugaenge", "Zugänge und Rollen", "Unter „Zugänge“ geben Sie Mitarbeitenden ihren App-Zugang. Leitungen und Inhaber-Konten richtet der Betreiber ein; wer selbst im Plan arbeitet, wird mit seiner Person verknüpft.",
        { icon: "🔑", show: "zugaenge", keys: "zugänge zugang konto passwort rolle leitung" }),
      L("i-regeln", "Zuschläge, Urlaubsanspruch, Überstunden", "In „Anwesenheit“: Zuschläge (Nacht, Samstag, Sonntag, Feiertag, Einspringen) als Prozent oder Betrag pro Tag mit Lohnart-Code, Urlaubsanspruch pro Jahr und wie Überstunden behandelt werden (Zeitkonto, Auszahlung oder gemischt).",
        { img: "stundenzettel-start", box: [0, 52, 100, 100], show: "anwesenheit", keys: "zuschläge urlaubsanspruch überstunden auszahlung lohnart code" }),
      L("i-recht", "Mutterschutz und Elternzeit", "Mutterschutz kürzt den Urlaub nie und geht genehmigtem Urlaub vor (§ 24 MuSchG). Elternzeit kürzt den Urlaub nur, wenn Sie es erklären – 1/12 je vollem Monat (§ 17 BEEG). Beides erzeugt keine Minusstunden.",
        { icon: "👶", keys: "mutterschutz elternzeit beeg muschg urlaub kürzen",
          q: ["Wird der Urlaub wegen Mutterschutz gekürzt?", ["Nein, nie", "Ja, um 1/12 pro Monat", "Nur bei Teilzeit"], 0] }),
    ],
  },
};

const FAQ = [
  ["Ich sehe meinen Plan nicht.", "Der Plan erscheint erst, wenn die Leitung ihn veröffentlicht hat. Bitte die Seite neu laden."],
  ["Mein Handy zeigt keinen „Stempeln“-Knopf.", "Ihre Firma hat die Zeiterfassung vielleicht noch nicht eingeschaltet – bitte die Leitung fragen."],
  ["Passwort vergessen?", "Auf der Anmeldeseite „Passwort vergessen“ wählen oder die Leitung um einen neuen Zugang bitten."],
  ["Wie installiere ich die App auf dem Handy?", "Seite im Browser öffnen, dann „Teilen“ → „Zum Home-Bildschirm“ (iPhone) bzw. Menü → „App installieren“ (Android)."],
  ["Warum habe ich Minusstunden?", "Unter „Zeiten“ den Tag öffnen: dort steht Soll, gearbeitet und die Differenz. Fehlt eine Stempelung, „Korrektur beantragen“."],
  ["Kann ich einen Antrag zurückziehen?", "Ja, solange er noch offen ist. Genehmigte Anträge kann nur die Leitung stornieren."],
];

const key = (who) => `dg-schulung-${who || "x"}`;

export default function Schulung({ role = "mitarbeiter", who, onShow, onClose }) {
  const tracks = role === "inhaber" ? ["inhaber", "leitung", "mitarbeiter"] : role === "leitung" ? ["leitung", "mitarbeiter"] : ["mitarbeiter"];
  const [track, setTrack] = useState(tracks[0]);
  const [open, setOpen] = useState(null); // lesson id
  const [answer, setAnswer] = useState(null);
  const [done, setDone] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => { try { setDone(JSON.parse(window.localStorage.getItem(key(who)) || "[]")); } catch (e) { setDone([]); } }, [who]);
  const markDone = (id) => {
    const next = done.includes(id) ? done : [...done, id];
    setDone(next); try { window.localStorage.setItem(key(who), JSON.stringify(next)); } catch (e) { /* ignore */ }
  };
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const lessons = COURSES[track].lessons;
  const lesson = open && tracks.flatMap((t) => COURSES[t].lessons).find((x) => x.id === open);
  const total = tracks.flatMap((t) => COURSES[t].lessons).length;
  const doneCount = tracks.flatMap((t) => COURSES[t].lessons).filter((x) => done.includes(x.id)).length;

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return null;
    const ls = tracks.flatMap((t) => COURSES[t].lessons).filter((x) => `${x.title} ${x.text} ${x.keys || ""}`.toLowerCase().includes(s));
    const fs = FAQ.filter(([a, b]) => `${a} ${b}`.toLowerCase().includes(s));
    return { ls, fs };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = lesson ? lessons.findIndex((x) => x.id === lesson.id) : -1;
  const next = idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null;

  const S = {
    wrap: { position: "fixed", inset: 0, zIndex: 80, background: "rgba(15,25,45,.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "max(12px, env(safe-area-inset-top)) 10px 24px", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
    box: { background: "#fff", color: "#18233A", width: "100%", maxWidth: 680, borderRadius: 20, padding: 16, boxShadow: "0 24px 60px -20px rgba(0,0,0,.4)" },
    btn: { border: "1.5px solid #AEBBD3", background: "#fff", color: "#18233A", borderRadius: 12, padding: "9px 14px", fontSize: 14, fontWeight: 650, cursor: "pointer" },
    pri: { border: 0, background: "#243B6B", color: "#fff", borderRadius: 12, padding: "10px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Schulung" style={S.wrap} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>🎓 Schulung</div>
          <button style={S.btn} onClick={onClose}>Schließen</button>
        </div>
        <div style={{ fontSize: 13, color: "#56617A", margin: "4px 0 10px" }}>{doneCount} von {total} Lektionen abgeschlossen</div>
        <div style={{ height: 6, background: "#E3E8F1", borderRadius: 6, overflow: "hidden", marginBottom: 12 }}><div style={{ width: `${(doneCount / total) * 100}%`, height: "100%", background: "#1F9D55" }} /></div>

        {!lesson && (
          <>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hilfe suchen, z. B. Urlaub, stempeln, Stundenzettel …" aria-label="Hilfe suchen"
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #CBD3E1", borderRadius: 12, padding: "11px 12px", fontSize: 16, marginBottom: 12 }} />
            {hits ? (
              <div>
                {hits.ls.map((x) => <button key={x.id} onClick={() => { setOpen(x.id); setAnswer(null); setQ(""); }} style={{ ...S.btn, display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}>📘 {x.title}</button>)}
                {hits.fs.map(([a, b]) => <div key={a} style={{ border: "1px solid #E3E8F1", borderRadius: 12, padding: 12, marginBottom: 8 }}><b>{a}</b><div style={{ fontSize: 14, color: "#3A465E", marginTop: 4 }}>{b}</div></div>)}
                {!hits.ls.length && !hits.fs.length && <div style={{ color: "#56617A", fontSize: 14 }}>Nichts gefunden. Fragen Sie bitte Ihre Leitung.</div>}
              </div>
            ) : (
              <>
                {tracks.length > 1 && (
                  <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                    {tracks.map((t) => <button key={t} role="tab" aria-selected={t === track} onClick={() => setTrack(t)} style={t === track ? S.pri : S.btn}>{COURSES[t].title}</button>)}
                  </div>
                )}
                <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {lessons.map((x, i) => (
                    <li key={x.id}>
                      <button onClick={() => { setOpen(x.id); setAnswer(null); }} style={{ ...S.btn, display: "flex", width: "100%", alignItems: "center", gap: 10, textAlign: "left", marginBottom: 8, fontWeight: 600 }}>
                        <span style={{ width: 28, height: 28, borderRadius: "50%", flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: done.includes(x.id) ? "#1F9D55" : "#E3E8F1", color: done.includes(x.id) ? "#fff" : "#243B6B", fontWeight: 800 }}>{done.includes(x.id) ? "✓" : i + 1}</span>
                        {x.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}

        {lesson && (
          <div>
            <button style={{ ...S.btn, marginBottom: 10 }} onClick={() => setOpen(null)}>‹ Alle Lektionen</button>
            <div style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 8px" }}>{lesson.title}</div>
            {lesson.img ? (
              <div style={{ background: "#E9EEF6", borderRadius: 16, padding: 10, display: "flex", justifyContent: "center", marginBottom: 12 }}>
                <div style={{ position: "relative", overflow: "hidden", lineHeight: 0, borderRadius: lesson.phone ? 22 : 10, border: lesson.phone ? "7px solid #1B2433" : 0, maxWidth: lesson.phone ? 240 : "100%" }}>
                  <img src={`/demo/${lesson.img}.webp`} alt="" style={{ width: "100%", height: "auto", display: "block", maxHeight: "48vh", objectFit: "contain" }} />
                  <span aria-hidden="true" style={{ position: "absolute", left: `${lesson.box[0]}%`, top: `${lesson.box[1]}%`, width: `${lesson.box[2] - lesson.box[0]}%`, height: `${lesson.box[3] - lesson.box[1]}%`, border: "3px solid #E3A72F", borderRadius: 8, boxShadow: "0 0 0 9999px rgba(15,25,45,.4)" }} />
                </div>
              </div>
            ) : <div style={{ fontSize: 46, textAlign: "center", margin: "6px 0 10px" }} aria-hidden="true">{lesson.icon || "📘"}</div>}
            <p style={{ fontSize: 16, lineHeight: 1.6, margin: "0 0 14px" }}>{lesson.text}</p>
            {lesson.show && onShow && <button style={{ ...S.btn, marginBottom: 14 }} onClick={() => { onShow(lesson.show); onClose(); }}>👉 Zeig mir</button>}
            {lesson.q ? (
              <div style={{ border: "1px solid #E3E8F1", borderRadius: 14, padding: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Kurze Frage: {lesson.q[0]}</div>
                {lesson.q[1].map((a, k) => {
                  const chosen = answer === k, right = k === lesson.q[2];
                  const bg = answer == null ? "#fff" : chosen && right ? "#DDF2E8" : chosen ? "#FCE5EA" : "#fff";
                  return <button key={a} onClick={() => { setAnswer(k); if (right) markDone(lesson.id); }} style={{ ...S.btn, display: "block", width: "100%", textAlign: "left", marginBottom: 6, background: bg }}>{a}{answer != null && chosen ? (right ? "  ✓ Richtig" : "  ✗ Noch einmal") : ""}</button>;
                })}
              </div>
            ) : (
              <button style={S.btn} onClick={() => markDone(lesson.id)}>{done.includes(lesson.id) ? "✓ Erledigt" : "Verstanden ✓"}</button>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              {next ? <button style={S.pri} onClick={() => { setOpen(next.id); setAnswer(null); }}>Weiter: {next.title}</button> : <button style={S.pri} onClick={() => setOpen(null)}>Fertig</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
