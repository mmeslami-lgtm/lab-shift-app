// Touren (D3a): eigenes „Zum Home-Bildschirm“ für Inhaber und Büro – öffnet direkt /touren.
export const metadata = {
  title: "Dienstigo – Touren",
  description: "Kunden und Aufträge",
  manifest: "/manifest-touren.webmanifest",
  appleWebApp: { capable: true, title: "Dienstigo", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#243B6B", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function TourenLayout({ children }) {
  return children;
}
