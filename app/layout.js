import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import RegisterSW from "../components/RegisterSW";
import PasswordGate from "../components/PasswordGate";
import SiteFooter from "../components/SiteFooter";

// Own domain: set NEXT_PUBLIC_SITE_URL in Vercel (e.g. https://www.ihre-domain.de); until then the vercel.app address
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.dienstigo.de";
// Short title in the browser tab / installed app. A sales title ("… | Serverstandort Frankfurt") comes
// later together with the product name, the own domain and a public start page.
const TITLE = "Dienstigo – Dienstplan und Zeiterfassung";
const DESCRIPTION = "Dienstplanung, Zeiterfassung und Mitarbeiter-App für Labore, Praxen und kleine Unternehmen. Datenbank mit Serverstandort Frankfurt, Daten jeder Firma strikt getrennt.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Dienstigo" },
  description: DESCRIPTION,
  keywords: ["Schichtplanung", "Dienstplan", "Zeiterfassung", "Labor", "Praxis", "KMU", "Mitarbeiter-App", "Serverstandort Frankfurt"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "de_DE", url: "/", siteName: "Dienstigo", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dienstigo", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

// Schrift der Seiten für Inhaber/Leitung (Erscheinungsbild D). next/font lädt sie beim Bauen herunter und
// liefert sie von der eigenen Seite aus – kein Aufruf bei Google im Browser (DSGVO).
const brandFont = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--font-brand", display: "swap" });

export const viewport = { themeColor: "#243B6B", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="de" className={brandFont.variable}>
      <body>
        {/* PasswordGate: a person who still has the temporary password sees only the "choose your own password" screen */}
        <PasswordGate>{children}</PasswordGate>
        <SiteFooter />
        <RegisterSW />
      </body>
    </html>
  );
}
