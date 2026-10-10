import LegalPage, { Section, P } from "../../components/LegalPage";

export const metadata = { title: "Impressum", robots: { index: true, follow: true } };

// VORLAGE – alle gelb markierten Platzhalter ausfüllen und von einer Rechtsberatung prüfen lassen.
export default function Page() {
  return (
    <LegalPage title="Impressum" updated="Oktober 2026">
      <Section title="Angaben gemäß § 5 DDG">
        <P>[Vorname Nachname / Firmenname und Rechtsform]</P><br />
        <P>[Straße Hausnummer]</P><br />
        <P>[PLZ]</P> Lübeck<br />
        Deutschland
      </Section>
      <Section title="Kontakt">
        Telefon: <P>[Telefonnummer]</P><br />
        E-Mail: <P>[E-Mail-Adresse]</P>
      </Section>
      <Section title="Umsatzsteuer-ID">
        Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: <P>[USt-IdNr., falls vorhanden – sonst Abschnitt löschen]</P>
      </Section>
      <Section title="Handelsregister">
        <P>[Registergericht und Registernummer, falls eingetragen – sonst Abschnitt löschen]</P>
      </Section>
      <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <P>[Vorname Nachname]</P>, Anschrift wie oben
      </Section>
      <Section title="Verbraucherstreitbeilegung">
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </Section>
    </LegalPage>
  );
}
