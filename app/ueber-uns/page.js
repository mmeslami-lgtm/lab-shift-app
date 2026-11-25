import { AboutPage } from "../../components/InfoPages";

// /ueber-uns (25.11.2026), Deutsch / Englisch.
export const metadata = {
  title: "Über uns",
  description: "Über Dienstigo: Online-Software für Dienstplan, Zeiterfassung und Einsätze – entwickelt aus dem Schichtdienst für den Schichtdienst.",
  alternates: { canonical: "/ueber-uns" },
};

export default function Page() {
  return <AboutPage />;
}
