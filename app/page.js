import Landing from "../components/Landing";

// Public start page (dienstigo.de). The content (German / English) lives in components/Landing.jsx.
export const metadata = {
  title: { absolute: "Dienstigo – Dienstplan und Zeiterfassung für Praxen, Labore und kleine Teams" },
  description: "Dienstigo plant Schichten fair nach Verträgen, Wünschen und Urlaub, erfasst die Arbeitszeit per Handy oder Chip und liefert am Monatsende die Stundenzettel für die Lohnabrechnung. Für jede Organisation: vom Gesundheitswesen über Hotels und Restaurants bis zu mobilen Diensten.",
  alternates: { canonical: "/" },
};

export default function StartPage() {
  return <Landing />;
}
