import { ContactPage } from "../../components/InfoPages";

// /kontakt (25.11.2026), Deutsch / Englisch.
export const metadata = {
  title: "Kontakt",
  description: "Kontakt zu Dienstigo: E-Mail an info@dienstigo.de oder Demo anfragen.",
  alternates: { canonical: "/kontakt" },
};

export default function Page() {
  return <ContactPage />;
}
