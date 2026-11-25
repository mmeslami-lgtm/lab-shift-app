import { notFound } from "next/navigation";
import { ProductPage } from "../../../components/Products";

// /produkte/<slug> – eine Seite je Produkt (25.11.2026), Deutsch / Englisch.
const META = {
  "dienstplan-labor": ["Dienstplan Labor", "Früh-, Spät- und Nachtdienste rund um die Uhr, fair verteilt nach Vertragsstunden – für Labore, Kliniken und Stationen."],
  dienstplan: ["Dienstplan allgemein", "Eigene Schichten und Öffnungstage – für Praxen, Hotels, Restaurants und Firmen mit mehreren Filialen."],
  zeiterfassung: ["Zeiterfassung", "Stempeln am Tablet, per Handy oder Chip – und am Monatsende die Stundenzettel für die Lohnbuchhaltung."],
  touren: ["Touren", "Einsätze beim Kunden planen: Aufträge, passende Vorschläge, regelmäßige Kunden, Live-Status und Ersatz bei Krankheit – für Reinigung, Pflege und mobile Dienste."],
  "mitarbeiter-app": ["Mitarbeiter-App", "Plan, Einsätze, Anträge und Zeitkonto auf dem Handy – ohne App-Store."],
};

export function generateStaticParams() {
  return Object.keys(META).map((slug) => ({ slug }));
}
export const dynamicParams = false;

export function generateMetadata({ params }) {
  const m = META[params.slug];
  if (!m) return {};
  return { title: m[0], description: m[1], alternates: { canonical: `/produkte/${params.slug}` } };
}

export default function Page({ params }) {
  if (!META[params.slug]) notFound();
  return <ProductPage slug={params.slug} />;
}
