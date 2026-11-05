import LegalPage, { Section } from "../../../components/LegalPage";
import { LEGAL_STAND, LEGAL_VERSIONS } from "../../../lib/legal";

export const metadata = { title: "Nutzungsbedingungen Testphase", robots: { index: false, follow: false } };

// Fassung in lib/legal.js erhöhen, wenn sich hier etwas inhaltlich ändert.
// Vor dem ersten zahlenden Kunden rechtlich prüfen lassen.
export default function Page() {
  return (
    <LegalPage title="Nutzungsbedingungen Testphase" updated={`${LEGAL_STAND} · Fassung ${LEGAL_VERSIONS.testphase}`} printable>
      <Section title="1. Geltungsbereich">
        Diese Bedingungen gelten für den kostenlosen Testzugang zu Dienstigo zwischen Mehran Eslami, Bohlkamp 21,
        23564 Lübeck (im Folgenden „Anbieter“), und dem Unternehmen, für das der Testzugang eingerichtet wird (im
        Folgenden „Kunde“). Der Testzugang richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB.
      </Section>
      <Section title="2. Leistung">
        Der Kunde erhält für 14 Tage einen Zugang zu Dienstigo im freigeschalteten Funktionsumfang, um die Software zu
        testen. Ein Anspruch auf bestimmte Funktionen, eine bestimmte Verfügbarkeit oder Support besteht nicht. Der
        Anbieter darf die Software während der Testphase weiterentwickeln und ändern.
      </Section>
      <Section title="3. Kosten und Ende">
        Die Testphase ist kostenlos und unverbindlich. Sie endet automatisch nach 14 Tagen, ohne dass es einer
        Kündigung bedarf. Es entsteht kein Abonnement und keine Zahlungspflicht. Eine Verlängerung ist nach Absprache
        möglich.
      </Section>
      <Section title="4. Nur fiktive Testdaten">
        Der Kunde gibt in der Testphase ausschließlich erfundene Testdaten ein. Insbesondere werden keine echten Namen
        oder sonstigen Daten von Beschäftigten und keine Gesundheitsdaten (zum Beispiel Krankmeldungen) eingegeben.
        Ausgenommen ist nur die E-Mail-Adresse des Zugangs, mit dem sich der Kunde anmeldet.
      </Section>
      <Section title="5. Pflichten des Kunden">
        Der Kunde hält seine Zugangsdaten geheim und nutzt Dienstigo nur zum Testen für eigene Zwecke. Angriffe,
        Last- oder Sicherheitstests, automatisierte Massenabfragen und das Umgehen von Schutzmaßnahmen sind nicht
        erlaubt.
      </Section>
      <Section title="6. Nach dem Ende der Testphase">
        Nach dem Ende kann der Kunde seine Testdaten noch 30 Tage ansehen, aber nicht mehr ändern. Danach löscht der
        Anbieter die Testfirma mit allen Daten, spätestens 60 Tage nach dem Ende der Testphase. Schließt der Kunde
        vorher einen Vertrag, können die Daten auf seinen Wunsch übernommen werden.
      </Section>
      <Section title="7. Haftung">
        Da die Testphase unentgeltlich ist, haftet der Anbieter nur bei Vorsatz und grober Fahrlässigkeit. Unberührt
        bleibt die Haftung für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach dem
        Produkthaftungsgesetz.
      </Section>
      <Section title="8. Datenschutz">
        Für die Daten, die der Kunde in Dienstigo eingibt, gilt der <a href="/rechtliches/avv">Auftragsverarbeitungsvertrag (AVV)</a>.
        Im Übrigen gilt die <a href="/datenschutz">Datenschutzerklärung</a>.
      </Section>
      <Section title="9. Schlussbestimmungen">
        Es gilt deutsches Recht. Gerichtsstand ist, soweit gesetzlich zulässig, Lübeck. Änderungen dieser Bedingungen
        werden dem Kunden in Textform (zum Beispiel per E-Mail oder beim Anmelden) mitgeteilt. Sollte eine Bestimmung
        unwirksam sein, bleiben die übrigen wirksam.
      </Section>
    </LegalPage>
  );
}
