import LegalPage, { Section, P } from "../../components/LegalPage";

export const metadata = { title: "Datenschutzerklärung", robots: { index: true, follow: true } };

// VORLAGE – gelb markierte Platzhalter ausfüllen; vor Veröffentlichung von einer Datenschutz-
// beratung prüfen lassen. Die Angaben zu Dienstleistern müssen mit den abgeschlossenen
// Auftragsverarbeitungsverträgen (AVV/DPA) übereinstimmen.
export default function Page() {
  return (
    <LegalPage title="Datenschutzerklärung" updated="Oktober 2026">
      <Section title="1. Verantwortlicher">
        <P>[Vorname Nachname / Firmenname]</P>, <P>[Straße Hausnummer]</P>, <P>[PLZ]</P> Lübeck, Deutschland<br />
        E-Mail: <P>[E-Mail-Adresse]</P>
      </Section>

      <Section title="2. Überblick">
        Wir betreiben eine Web-Anwendung für Dienstplanung, Zeiterfassung und Mitarbeiter-Kommunikation für Unternehmen.
        Wir verarbeiten personenbezogene Daten nach der Datenschutz-Grundverordnung (DSGVO) und dem Bundesdatenschutzgesetz (BDSG).
        Soweit Unternehmen (unsere Kunden) die Anwendung für ihre Beschäftigten nutzen, ist das jeweilige Unternehmen
        Verantwortlicher für die Daten seiner Beschäftigten; wir handeln dann als Auftragsverarbeiter nach Art. 28 DSGVO
        auf Grundlage eines Auftragsverarbeitungsvertrags.
      </Section>

      <Section title="3. Serverstandort und Hosting">
        <b>Datenbank:</b> Alle Inhaltsdaten (Konten, Dienstpläne, Arbeitszeiten, Abwesenheiten, Wünsche) werden in einer Datenbank
        mit <b>Serverstandort Frankfurt am Main (Deutschland, EU)</b> gespeichert. Anbieter: Supabase Inc., USA, als Auftragsverarbeiter;
        die Daten liegen im Rechenzentrum in Frankfurt (Region eu-central-1).<br /><br />
        <b>Web-Anwendung:</b> Die Anwendung wird über Vercel Inc., USA, ausgeliefert. Die Server-Funktionen der Anwendung laufen in
        der Region Frankfurt (fra1). Für die Auslieferung der Webseite nutzt Vercel ein weltweites Netz von Servern; dabei werden
        technisch notwendige Verbindungsdaten (z. B. IP-Adresse) verarbeitet.<br /><br />
        <b>Übermittlung in Drittländer:</b> Beide Anbieter sind Unternehmen mit Sitz in den USA. Ein Zugriff aus den USA bzw. eine
        Übermittlung personenbezogener Daten in die USA kann daher nicht vollständig ausgeschlossen werden. Sie erfolgt auf Grundlage
        der EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) bzw. des EU-US Data Privacy Framework (Art. 45 DSGVO), soweit
        der Anbieter dort zertifiziert ist. <P>[Bitte mit den aktuellen AVV/DPA von Supabase und Vercel abgleichen.]</P>
      </Section>

      <Section title="4. Welche Daten wir verarbeiten">
        <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
          <li>Konto: E-Mail-Adresse oder Benutzername, Passwort (nur als bcrypt-Hash gespeichert, nie im Klartext), Rolle, Zeitpunkt der letzten Anmeldung.</li>
          <li>Beschäftigtendaten: Name, Wochenstunden, Beschäftigungsart, Dienstpläne, Schichtänderungen, Wünsche, Urlaub und Abwesenheiten.</li>
          <li>Krankmeldungen werden nur der Leitung angezeigt; Kolleginnen und Kollegen sehen weder den Grund einer Abwesenheit noch, wer vertreten wurde.</li>
          <li>Zeiterfassung: Zeitpunkt (Serverzeit, UTC) und Richtung der Stempelung, verwendetes Gerät. Einträge sind unveränderlich; Korrekturen nur durch die Leitung mit Begründung, protokolliert.</li>
          <li>Technische Daten: IP-Adresse und Zeitpunkt des Zugriffs (Server-Logdateien), kurzfristig zur Sicherheit und Fehlersuche.</li>
        </ul>
      </Section>

      <Section title="5. Zwecke und Rechtsgrundlagen">
        Bereitstellung der Anwendung und Erfüllung des Vertrags (Art. 6 Abs. 1 lit. b DSGVO); Erfüllung gesetzlicher Pflichten,
        z. B. Aufzeichnung der Arbeitszeit (Art. 6 Abs. 1 lit. c DSGVO); Sicherheit und Missbrauchsschutz (Art. 6 Abs. 1 lit. f DSGVO).
        Für Beschäftigtendaten gelten zusätzlich die Vorschriften zum Beschäftigtendatenschutz; Verantwortlicher ist insoweit der jeweilige Arbeitgeber.
      </Section>

      <Section title="6. Speicherdauer">
        Daten werden gelöscht, sobald sie für den Zweck nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungsfristen bestehen.
        Aufzeichnungen der Arbeitszeit werden mindestens zwei Jahre aufbewahrt; die Aufbewahrungsdauer für Pläne und Nachweise ist je Unternehmen
        einstellbar (Standard: 6 Jahre).
      </Section>

      <Section title="7. Speicherung im Browser">
        Für die Anmeldung speichert die Anwendung ein Anmelde-Token im Speicher Ihres Browsers. Dies ist technisch notwendig
        (§ 25 Abs. 2 TDDDG). Wir verwenden keine Werbe- oder Analyse-Cookies und keine Tracking-Dienste.
      </Section>

      <Section title="8. Sicherheit">
        Verschlüsselte Übertragung (HTTPS/TLS), Passwörter nur als bcrypt-Hash, strikte Trennung der Daten verschiedener Unternehmen
        auf Datenbankebene (Row Level Security), rollenbasierte Zugriffsrechte, unveränderliche Zeiterfassung.
      </Section>

      <Section title="9. Ihre Rechte">
        Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
        Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21 DSGVO). Beschäftigte unserer Kunden wenden sich bitte zunächst an ihren Arbeitgeber.
        Sie haben außerdem das Recht auf Beschwerde bei einer Aufsichtsbehörde, z. B. beim Unabhängigen Landeszentrum für Datenschutz
        Schleswig-Holstein (ULD), Kiel.
      </Section>

      <Section title="10. Änderungen">
        Wir passen diese Datenschutzerklärung an, wenn sich die Anwendung oder die Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung.
      </Section>
    </LegalPage>
  );
}
