"use client";

// "Drucken / als PDF speichern" for the legal texts. Hidden on paper (class dg-noprint).
export default function PrintButton() {
  return (
    <>
      <style>{`@media print { .dg-noprint { display: none !important; } body { background: #fff !important; } }`}</style>
      <button type="button" className="dg-noprint" data-print onClick={() => window.print()}
        style={{ border: "1.5px solid #9AAED0", borderRadius: 12, background: "#fff", color: "#1B2433", fontSize: 14, fontWeight: 600, padding: "8px 12px", cursor: "pointer", marginTop: 12 }}>
        Drucken / als PDF speichern
      </button>
    </>
  );
}
