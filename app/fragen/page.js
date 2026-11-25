import { FaqPage } from "../../components/InfoPages";

// /fragen (25.11.2026), Deutsch / Englisch.
export const metadata = {
  title: "Häufige Fragen",
  description: "Antworten zu Kosten, Testphase, Installation, Datenschutz und Sprachen von Dienstigo.",
  alternates: { canonical: "/fragen" },
};

export default function Page() {
  return <FaqPage />;
}
