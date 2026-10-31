import { DemoForm } from "../../components/DemoRequest";

// /demo-anfrage – the same form as the window „Demo anfragen“, as its own page (old links, or without JavaScript).
export const metadata = { title: "Demo anfragen", alternates: { canonical: "/demo-anfrage" } };

export default function DemoAnfrage() {
  return (
    <div style={{ background: "#F3F5F9", minHeight: "100vh", padding: "0 16px", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "40px 0" }}>
        <div style={{ background: "#fff", border: "1px solid #E1E6EF", borderRadius: 22, padding: "28px 24px" }}>
          <a href="/" style={{ color: "#5B6578", textDecoration: "none" }}>← Zur Startseite</a>
          <div style={{ height: 14 }} />
          <DemoForm intro={<>
            <h1 style={{ fontSize: "2rem", margin: "0 0 6px", color: "#243B6B" }}>Demo anfragen</h1>
            <p style={{ margin: "0 0 20px", lineHeight: 1.6, color: "#18233A" }}>Hinterlassen Sie Ihre Kontaktdaten. Wir melden uns und zeigen Ihnen Dienstigo.</p>
          </>} />
        </div>
      </div>
    </div>
  );
}
