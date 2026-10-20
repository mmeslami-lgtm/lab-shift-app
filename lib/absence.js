// Abwesenheit in der Zeiterfassung (Leitung trägt ein, oder ein genehmigter Antrag gilt automatisch).
// credit: true  = the planned hours count as done (no minus):  krank, urlaub, fortbildung, sonstiges
//         false = the planned hours are missing in the time account: ueberstunden (Abbau), unentschuldigt
// neutral: true = no work obligation that day (Soll 0, no minus, no plus): Mutterschutz, Elternzeit
// Rules (German law): Mutterschutz/Beschäftigungsverbot never reduces the leave entitlement (§ 24 MuSchG) and
// beats an approved Urlaub on the same day; Elternzeit may reduce it by 1/12 per FULL calendar month only if the
// employer declares it (§ 17 BEEG) -> flag requests.cut_vacation, set by the Leitung when approving.
export const ABSENCE = {
  krank:          { label: "Krank (mit Attest)", credit: true, sick: true },
  krank_ohne:     { label: "Krank ohne Attest", credit: true, sick: true },
  urlaub:         { label: "Urlaub", credit: true },
  sonderurlaub:   { label: "Sonderurlaub", credit: true },
  fortbildung:    { label: "Fortbildung / Weiterbildung", credit: true },
  dienstreise:    { label: "Dienstreise", credit: true },
  kur:            { label: "Kur / Reha", credit: true },
  mutterschutz:   { label: "Mutterschutz / Beschäftigungsverbot", neutral: true },
  elternzeit:     { label: "Elternzeit", neutral: true },
  ueberstunden:   { label: "Freizeitausgleich (Überstundenabbau)", credit: false },
  unentschuldigt: { label: "Unentschuldigt", credit: false },
  sonstiges:      { label: "Sonstiges (bezahlt)", credit: true },
};
// approved Anträge count as absence automatically (request type key -> absence kind)
export const REQUEST_TO_ABSENCE = { urlaub: "urlaub", fortbildung: "fortbildung", krank: "krank", krank_ohne: "krank_ohne", sonderurlaub: "sonderurlaub", dienstreise: "dienstreise", kur: "kur", mutterschutz: "mutterschutz", elternzeit: "elternzeit", freizeitausgleich: "ueberstunden" };
// which absence wins when two approved requests cover the same day (Mutterschutz beats Urlaub, § 24 MuSchG)
const PRIO = { mutterschutz: 9, elternzeit: 8, krank: 7, krank_ohne: 7, kur: 6 };
export const isNeutral = (a) => !!(a && ABSENCE[a.kind] && ABSENCE[a.kind].neutral);
export const isCredit = (a) => !!(a && ABSENCE[a.kind] && ABSENCE[a.kind].credit);
export const isSick = (a) => !!(a && ABSENCE[a.kind] && ABSENCE[a.kind].sick);

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// { "2026-10-12": { kind, source: "leitung" | "antrag", id? } } from absences + approved requests
export function absenceMap(absences, requests) {
  const m = {};
  (requests || []).filter((r) => r.status === "approved" && REQUEST_TO_ABSENCE[r.type_key]).forEach((r) => {
    const kind = REQUEST_TO_ABSENCE[r.type_key];
    for (let d = new Date(r.date_from + "T12:00:00"); isoOf(d) <= r.date_to; d.setDate(d.getDate() + 1)) {
      const k = isoOf(d);
      if (!m[k] || (PRIO[kind] || 1) > (PRIO[m[k].kind] || 1)) m[k] = { kind, source: "antrag" };
    }
  });
  (absences || []).filter((a) => !a.voided_at).forEach((a) => { m[a.work_date] = { kind: a.kind, source: "leitung", id: a.id, note: a.note }; }); // Leitung wins
  return m;
}

// § 17 BEEG: full calendar months of approved Elternzeit (flag cut_vacation) within a year -> leave reduction in days
export function elternzeitCut(requests, year, entitlement) {
  const ranges = (requests || []).filter((r) => r.status === "approved" && r.type_key === "elternzeit" && r.cut_vacation);
  let months = 0;
  for (let m = 0; m < 12; m++) {
    const a = `${year}-${pad(m + 1)}-01`, b = isoOf(new Date(year, m + 1, 0));
    if (ranges.some((r) => r.date_from <= a && r.date_to >= b)) months++;
  }
  const cut = Math.round(((Number(entitlement) || 0) * months / 12) * 2) / 2; // to half days
  return { months, cut };
}
