import RegisterForm from "../../components/RegisterForm";

// /registrieren – neue Firma meldet sich an (25.11.2026). Deutsch / Englisch.
export const metadata = {
  title: "Registrieren",
  description: "Firma bei Dienstigo registrieren: Dienstplan, Zeiterfassung, Touren und Mitarbeiter-App 14 Tage kostenlos testen.",
  alternates: { canonical: "/registrieren" },
};

export default function Page() {
  return <RegisterForm />;
}
