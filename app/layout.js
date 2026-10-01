import "./globals.css";

export const metadata = {
  title: "Dienstplaner – Labor",
  description: "Dienstplaner für das medizinisch-diagnostische Labor",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
