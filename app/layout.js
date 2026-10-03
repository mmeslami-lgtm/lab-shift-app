import "./globals.css";
import RegisterSW from "../components/RegisterSW";

export const metadata = {
  title: "Dienstplaner",
  description: "Dienstplaner",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Dienstplaner", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#134E4A", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
