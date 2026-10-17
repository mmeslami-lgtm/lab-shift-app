// Überstunden: Zeitkonto oder Auszahlung (per company, organizations.overtime_settings = { mode, code }):
//   konto       – everything stays in the Zeitkonto and goes on to the next month (default, as before)
//   auszahlung  – at the end of every finished month all PLUS hours are paid out (the account starts at 0 again;
//                 minus hours stay, they are never taken from the wage)
//   gemischt    – the Leitung decides per person and month: "Auszahlen" with a number of hours (table overtime_payouts)
// Used by both planners (Saldo Vormonat), the Stundenzettel and the employee app (Zeitkonto), so all show the same.

export const OVERTIME_MODES = {
  konto: "Zeitkonto – alles geht in den nächsten Monat",
  auszahlung: "Auszahlung – Plusstunden werden jeden Monat ausgezahlt",
  gemischt: "Gemischt – Leitung entscheidet pro Person und Monat",
};
export const overtimeMode = (settings) => (settings && OVERTIME_MODES[settings.mode] ? settings.mode : "konto");

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyOf = (y, m0) => y * 12 + m0; // m0 = 0..11

// stored payouts (not voided) of one person -> { monthKey: minutes }
export function payoutMinutesByMonth(payouts, staffId) {
  const out = {};
  (payouts || []).forEach((p) => {
    if (p.voided_at || (staffId && p.staff_id !== staffId)) return;
    const k = keyOf(Number(p.year), Number(p.month) - 1);
    out[k] = (out[k] || 0) + Number(p.hours) * 60;
  });
  return out;
}

// payout at the end of a month: mode + running balance (minutes, plus = Überstunden)
export function monthPayout(mode, balanceMin, storedMin) {
  if (mode === "auszahlung") return Math.max(0, balanceMin);
  if (mode === "gemischt") return Math.max(0, storedMin || 0);
  return 0;
}

// ---- Zeitkonto (actual time): walk day by day from the first day that counts up to untilIso (exclusive).
// dailyOf(iso) = minutes of that day (0 when it does not count); closedOf(key) = minutes added when that
// month is closed (plan mode only); at every month end before untilIso the payout of that month is taken off.
// Returns { balance, payouts: { monthKey: minutes } }.
export function walkBalance({ fromIso, untilIso, dailyOf, closedOf, mode, stored }) {
  let bal = 0; const paid = {};
  if (!fromIso || fromIso >= untilIso) return { balance: 0, payouts: paid };
  for (let dt = new Date(fromIso + "T12:00:00"); isoOf(dt) < untilIso; dt.setDate(dt.getDate() + 1)) {
    bal += dailyOf(isoOf(dt)) || 0;
    const next = new Date(dt); next.setDate(next.getDate() + 1);
    if (next.getMonth() !== dt.getMonth() && isoOf(next) <= untilIso) { // month finished inside the range
      const k = keyOf(dt.getFullYear(), dt.getMonth());
      bal += (closedOf && closedOf(k)) || 0;
      const p = monthPayout(mode, bal, stored && stored[k]);
      if (p) { paid[k] = p; bal -= p; }
    }
  }
  return { balance: bal, payouts: paid };
}

// ---- Plan saldo (planners, "Saldo Vormonat"): rows of staff_month_balance of ONE person, months before nowKey.
// Returns hours OWED (positive = worked less than the contract, negative = Überstunden) – the planners' sign.
export function planCarryHours(rows, nowKey, mode, stored) {
  const byKey = {};
  (rows || []).forEach((x) => { const k = keyOf(x.year, x.month - 1); if (k < nowKey) byKey[k] = (byKey[k] || 0) + (Number(x.planned_hours) - Number(x.contract_hours)) * 60; });
  const keys = new Set(Object.keys(byKey).map(Number));
  Object.keys(stored || {}).forEach((k) => { if (Number(k) < nowKey) keys.add(Number(k)); });
  let plus = 0; // minutes, plus = Überstunden
  [...keys].sort((a, b) => a - b).forEach((k) => {
    plus += byKey[k] || 0;
    plus -= monthPayout(mode, plus, stored && stored[k]);
  });
  return -plus / 60;
}
