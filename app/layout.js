import "./globals.css";
import RegisterSW from "../components/RegisterSW";
import PasswordGate from "../components/PasswordGate";
import SiteFooter from "../components/SiteFooter";

// Own domain: set NEXT_PUBLIC_SITE_URL in Vercel (e.g. https://www.ihre-domain.de); until then the vercel.app address
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lab-shift-app.vercel.app";
// Short title in the browser tab / installed app. A sales title ("… | Serverstandort Frankfurt") comes
// later together with the product name, the own domain and a public start page.
const TITLE = "Dienstplaner";
const DESCRIPTION = "Dienstplanung, Zeiterfassung und Mitarbeiter-App für Labore, Praxen und kleine Unternehmen. Datenbank mit Serverstandort Frankfurt, Daten jeder Firma strikt getrennt.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Dienstplaner" },
  description: DESCRIPTION,
  keywords: ["Schichtplanung", "Dienstplan", "Zeiterfassung", "Labor", "Praxis", "KMU", "Mitarbeiter-App", "Serverstandort Frankfurt"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "de_DE", url: "/", siteName: "Dienstplaner", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dienstplaner", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#243B6B", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        {/* PasswordGate: a person who still has the temporary password sees only the "choose your own password" screen */}
        <PasswordGate>{children}</PasswordGate>
        <SiteFooter />
        <RegisterSW />
      </body>
    </html>
  );
}
