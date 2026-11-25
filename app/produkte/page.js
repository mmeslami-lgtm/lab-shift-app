import { ProductsPage } from "../../components/Products";

// /produkte – Übersicht der fünf Produkte (25.11.2026), Deutsch / Englisch.
export const metadata = {
  title: "Produkte",
  description: "Dienstplan Labor, Dienstplan, Zeiterfassung, Touren und Mitarbeiter-App – einzeln oder zusammen, 14 Tage kostenlos testen.",
  alternates: { canonical: "/produkte" },
};

export default function Page() {
  return <ProductsPage />;
}
