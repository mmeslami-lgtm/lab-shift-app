import LegalPage, { Section, P } from "../../components/LegalPage";

export const metadata = { title: "Impressum", robots: { index: true, follow: true } };

// Ausgefüllt Oktober 2026 (Einzelunternehmer). Vor dem ersten zahlenden Kunden rechtlich prüfen lassen.
export default function Page() {
  return (
    <LegalPage title="Impressum" updated="Oktober 2026">
      <Section title="Angaben gemäß § 5 DDG">
        Mehran Eslami<br />
        Bohlkamp 21<br />
        23564 Lübeck<br />
        Deutschland
      </Section>
      <Section title="Kontakt">
        Telefon: <a href="tel:+4917634340216">+49 176 34340216</a><br />
        E-Mail: <a href="mailto:mmeslami@gmail.com">mmeslami@gmail.com</a>
      </Section>
      <Section title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        Mehran Eslami, Anschrift wie oben
      </Section>
      <Section title="Verbraucherstreitbeilegung">
        Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </Section>
    </LegalPage>
  );
}
