// Abwesenheit in der Zeiterfassung (Leitung trägt ein, oder ein genehmigter Antrag gilt automatisch).
// credit: true  = the planned hours count as done (no minus):  krank, urlaub, fortbildung, sonstiges
//         false = the planned hours are missing in the time account: ueberstunden (Abbau), unentschuldigt
export const ABSENCE = {
  krank:          { label: "Krank", credit: true },
  urlaub:         { label: "Urlaub", credit: true },
  fortbildung:    { label: "Fortbildung / Dienstreise", credit: true },
  ueberstunden:   { label: "Überstundenabbau", credit: false },
  unentschuldigt: { label: "Unentschuldigt", credit: false },
  sonstiges:      { label: "Sonstiges (bezahlt)", credit: true },
};
// approved Anträge count as absence automatically
export const REQUEST_TO_ABSENCE = { urlaub: "urlaub", fortbildung: "fortbildung", krank: "krank" };

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// { "2026-10-12": { kind, source: "leitung" | "antrag", id? } } from absences + approved requests
export function absenceMap(absences, requests) {
  const m = {};
  (requests || []).filter((r) => r.status === "approved" && REQUEST_TO_ABSENCE[r.type_key]).forEach((r) => {
    for (let d = new Date(r.date_from + "T12:00:00"); isoOf(d) <= r.date_to; d.setDate(d.getDate() + 1)) m[isoOf(d)] = { kind: REQUEST_TO_ABSENCE[r.type_key], source: "antrag" };
  });
  (absences || []).filter((a) => !a.voided_at).forEach((a) => { m[a.work_date] = { kind: a.kind, source: "leitung", id: a.id, note: a.note }; }); // Leitung wins
  return m;
}
