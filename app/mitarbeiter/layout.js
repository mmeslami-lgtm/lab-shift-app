export const metadata = {
  title: "Meine Schichten",
  description: "Dein Dienstplan, deine Zeiten und deine Anträge",
  manifest: "/manifest-mitarbeiter.webmanifest",
  appleWebApp: { capable: true, title: "Meine Schichten", statusBarStyle: "default" },
  icons: { icon: "/icons/emp-192.png", apple: "/icons/emp-apple.png" },
};

export const viewport = { themeColor: "#243B6B" };

export default function MitarbeiterLayout({ children }) {
  return children;
}
