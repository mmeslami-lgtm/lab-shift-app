// "Stundenzettel" for the payroll office (Lohnbuchhaltung / Personalabteilung): one A4 page per person
// and month, made from the stamps (Zeiterfassung), the published plan and the absences.
// Same rules as the employee app ("Zeiten"):
//   Netto = time between Kommen and Gehen minus the legal break (> 6 h: 30 min, > 9 h: 45 min, § 4 ArbZG)
//   Soll  = planned shifts of the published plan (shift length minus 30 min break)
//   Tag GLZ = Netto − Soll; Krank / Urlaub / Fortbildung / Sonstiges count as Soll (no minus)
//   GLZ (Zeitkonto) runs on from the closed months + all days since Zeiterfassung started
// Surcharge hours (no euro amounts – the rates are the payroll office's business):
//   Nacht 22–6 Uhr, Sonntag, Feiertag (nationwide German public holidays)
import { ABSENCE, absenceMap } from "./absence";
import { walkBalance, monthPayout } from "./overtime";

const pad = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
export const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const breakFor = (gross) => (gross > 9 * 60 ? 45 : gross > 6 * 60 ? 30 : 0);
const plannedOf = (s) => { const d = (new Date(s.planned_end) - new Date(s.planned_start)) / 60000; return d > 6 * 60 ? d - 30 : d; };
export const hm = (min, sign = false) => { const neg = min < 0; const a = Math.round(Math.abs(min)); return `${neg ? "−" : sign ? "+" : ""}${pad(Math.floor(a / 60))}:${pad(a % 60)}`; };
const clock = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Soll "Vertrag" (feature soll_vertrag): weekly hours ÷ 5 on Monday–Friday that are not a
// public holiday, 0 on weekends and holidays – so the monthly Soll changes with the number of workdays.
export const contractDailyMin = (weeklyHours) => (Number(weeklyHours) || 0) * 60 / 5;
export function isWorkday(iso) {
  const d = new Date(iso + "T12:00:00"); const wd = d.getDay();
  return wd >= 1 && wd <= 5 && !germanHolidays(d.getFullYear())[iso];
}
// Soll of one day: mode "vertrag" -> contract, else the published plan
export function sollOf(mode, weeklyHours, iso, plannedMin) {
  return mode === "vertrag" ? (isWorkday(iso) ? contractDailyMin(weeklyHours) : 0) : plannedMin;
}

// nationwide public holidays in Germany (state holidays are not included)
export function germanHolidays(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day, 12);
  const plus = (n) => { const x = new Date(easter); x.setDate(x.getDate() + n); return isoOf(x); };
  return {
    [`${year}-01-01`]: "Neujahr", [plus(-2)]: "Karfreitag", [plus(0)]: "Ostersonntag", [plus(1)]: "Ostermontag", [`${year}-05-01`]: "Tag der Arbeit",
    [plus(39)]: "Christi Himmelfahrt", [plus(49)]: "Pfingstsonntag", [plus(50)]: "Pfingstmontag", [`${year}-10-03`]: "Tag der Deutschen Einheit",
    [`${year}-12-25`]: "1. Weihnachtstag", [`${year}-12-26`]: "2. Weihnachtstag",
  };
}

// minutes of [a, b) that fall into the windows produced by winOf(dayStart) for each calendar day
function overlap(a, b, winOf) {
  let t = 0;
  for (let d = new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1); d < b; d.setDate(d.getDate() + 1)) {
    (winOf(new Date(d)) || []).forEach(([s, e]) => { const x = Math.max(a, s), y = Math.min(b, e); if (y > x) t += (y - x) / 60000; });
  }
  return t;
}

// all days of one person: { iso: { sessions, gross, pause, worked, planned, daily, absence, labels, night, sunday, holiday } }
export function computeDays({ sessions, shifts, absences, approved, holidaysOf }) {
  const map = {};
  const get = (iso) => map[iso] || (map[iso] = { iso, sessions: [], shifts: [], gross: 0, pause: 0, worked: 0, planned: 0, daily: 0, night: 0, saturday: 0, sunday: 0, holiday: 0 });
  (sessions || []).forEach((s) => get(isoOf(new Date(s.check_in || s.check_out))).sessions.push(s));
  (shifts || []).forEach((s) => get(String(s.shift_date).slice(0, 10)).shifts.push(s));
  const am = absenceMap(absences, approved);
  Object.keys(am).forEach((iso) => { get(iso).absence = am[iso]; });
  Object.values(map).forEach((d) => {
    d.sessions.sort((x, y) => new Date(x.check_in || x.check_out) - new Date(y.check_in || y.check_out));
    d.gross = d.sessions.reduce((t, s) => t + (s.check_in && s.check_out ? (new Date(s.check_out) - new Date(s.check_in)) / 60000 : 0), 0);
    d.pause = breakFor(d.gross);
    d.worked = Math.max(0, d.gross - d.pause);
    d.planned = d.shifts.reduce((t, s) => t + plannedOf(s), 0);
    const credit = d.absence && ABSENCE[d.absence.kind] && ABSENCE[d.absence.kind].credit;
    d.daily = credit ? Math.max(d.worked, d.planned) - d.planned : d.worked - d.planned;
    d.sessions.forEach((s) => {
      if (!s.check_in || !s.check_out) return;
      const a = new Date(s.check_in), b = new Date(s.check_out);
      const n = overlap(a, b, (day) => [[new Date(day.getFullYear(), day.getMonth(), day.getDate(), 22), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 6)]]);
      if (n > 120) d.night += Math.max(0, n - breakFor((b - a) / 60000)); // Nachtarbeit = more than 2 h in 22–6 (§ 2 ArbZG), minus the break
      d.saturday += overlap(a, b, (day) => (day.getDay() === 6 ? [[new Date(day), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)]] : []));
      d.sunday += overlap(a, b, (day) => (day.getDay() === 0 ? [[new Date(day), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)]] : []));
      d.holiday += overlap(a, b, (day) => (holidaysOf(day.getFullYear())[isoOf(day)] ? [[new Date(day), new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)]] : []));
    });
  });
  return map;
}

// one person, one month -> data for one page
export function buildSheet({ name, year, month, days, startIso, closedRows, corrected, mode, weeklyHours, vacation, overtime }) {
  const first = `${year}-${pad(month + 1)}-01`;
  const last = isoOf(new Date(year, month + 1, 0));
  const todayIso = isoOf(new Date());
  const EMPTY = { sessions: [], shifts: [], worked: 0, pause: 0, planned: 0, daily: 0, night: 0, saturday: 0, sunday: 0, holiday: 0 };
  // Soll + day difference by the company's rule (plan or contract)
  const evalDay = (iso) => {
    const d = days[iso] || EMPTY;
    const soll = sollOf(mode, weeklyHours, iso, d.planned);
    const credit = d.absence && ABSENCE[d.absence.kind] && ABSENCE[d.absence.kind].credit;
    const netto = credit ? Math.max(d.worked, soll) : d.worked; // paid absence counts as worked time
    return { d, soll, netto, daily: netto - soll };
  };
  // Urlaub / Krank of this year BEFORE the month (workdays only) – for "Stand Monatsanfang"
  let urlaubBefore = 0, krankBefore = 0;
  for (let dt = new Date(year, 0, 1, 12); isoOf(dt) < first; dt.setDate(dt.getDate() + 1)) {
    const iso = isoOf(dt), d = days[iso];
    if (!d || !d.absence || !isWorkday(iso)) continue;
    if (d.absence.kind === "urlaub") urlaubBefore++;
    if (d.absence.kind === "krank") krankBefore++;
  }
  // contract mode: the closed months (plan vs. contract) are already inside the day differences
  // plan mode: a closed month adds plan − contract at its end ("Monatsabschluss"); contract mode: already in the days
  const closedMap = {};
  if (mode !== "vertrag") (closedRows || []).forEach((r) => { const k = r.year * 12 + r.month - 1; closedMap[k] = (closedMap[k] || 0) + (Number(r.planned_hours) - Number(r.contract_hours)) * 60; });
  const ckeys = Object.keys(closedMap).map(Number).sort((a, b) => a - b);
  const firstClosedIso = ckeys.length ? `${Math.floor(ckeys[0] / 12)}-${pad((ckeys[0] % 12) + 1)}-01` : null;
  const fromIso = [startIso, firstClosedIso].filter(Boolean).sort()[0] || null;
  const ot = overtime || { mode: "konto", stored: {} };
  const dailyOf = (iso) => (startIso && iso >= startIso && iso < todayIso ? evalDay(iso).daily : 0);
  let glz = walkBalance({ fromIso, untilIso: first, dailyOf, closedOf: (k) => closedMap[k] || 0, mode: ot.mode, stored: ot.stored }).balance;
  const glzStart = glz;
  const hol = germanHolidays(year);
  const rows = [];
  let netto = 0, soll = 0, krank = 0, urlaub = 0, night = 0, saturday = 0, sunday = 0, holiday = 0, satDays = 0, sunDays = 0, holDays = 0, nightDays = 0;
  for (let dt = new Date(year, month, 1, 12); isoOf(dt) <= last; dt.setDate(dt.getDate() + 1)) {
    const iso = isoOf(dt), { d, soll: dSoll, netto: dNetto, daily } = evalDay(iso);
    const counts = startIso && iso >= startIso && iso < todayIso;
    if (counts) glz += daily;
    netto += dNetto; soll += dSoll; night += d.night; sunday += d.sunday; holiday += d.holiday;
    saturday += d.saturday;
    if (d.saturday > 0) satDays++; if (d.sunday > 0) sunDays++; if (d.holiday > 0) holDays++; if (d.night > 0) nightDays++;
    // Urlaub / Krank are counted on workdays only
    const workday = dt.getDay() >= 1 && dt.getDay() <= 5 && !hol[iso];
    if (d.absence && d.absence.kind === "krank" && workday) krank++;
    if (d.absence && d.absence.kind === "urlaub" && workday) urlaub++;
    const info = [];
    if (hol[iso]) info.push(`Feiertag (${hol[iso]})`); else if (dt.getDay() === 0 || dt.getDay() === 6) info.push("Wochenende");
    d.shifts.forEach((s) => info.push(s.shift_label || s.shift_key));
    if (d.absence) info.push(ABSENCE[d.absence.kind].label + (d.absence.source === "antrag" ? " (Antrag)" : ""));
    if (d.sessions.some((s) => corrected && corrected.has(s.id))) info.push("korrigiert ✎");
    const open = d.sessions.find((s) => s.check_in && !s.check_out);
    if (open && Date.now() - new Date(open.check_in).getTime() > 12 * 3600000) info.push("Gehen fehlt");
    rows.push({
      date: `${pad(dt.getDate())}.${pad(month + 1)}.${year}`, wd: WD[dt.getDay()],
      begin: d.sessions.length ? (d.sessions[0].check_in ? clock(d.sessions[0].check_in) : "?") : "",
      end: d.sessions.length ? (() => { const s = d.sessions[d.sessions.length - 1]; if (!s.check_out) return "?"; const plus = isoOf(new Date(s.check_out)) !== iso ? " (+1)" : ""; return clock(s.check_out) + plus; })() : "",
      multi: d.sessions.length > 1 ? `${d.sessions.length} Einträge` : "",
      pause: d.sessions.length ? hm(d.pause) : "", netto: hm(dNetto), soll: hm(dSoll),
      day: counts ? hm(daily, true) : "", glz: counts ? hm(glz, true) : "",
      zus: [d.night ? `Nacht ${hm(d.night)}` : "", d.sunday ? `Sonntag ${hm(d.sunday)}` : "", d.holiday ? `Feiertag ${hm(d.holiday)}` : ""].filter(Boolean).join(" · "),
      info: info.join("; "), weekend: dt.getDay() === 0 || dt.getDay() === 6 || !!hol[iso],
    });
  }
  // end of the month: Monatsabschluss (plan mode) and Überstunden-Auszahlung – only once the month is over
  const dayDiff = glz - glzStart;
  const key = year * 12 + month;
  let closedAdj = 0, paidOut = 0;
  if (last < todayIso) {
    closedAdj = closedMap[key] || 0; glz += closedAdj;
    paidOut = monthPayout(ot.mode, glz, ot.stored && ot.stored[key]); glz -= paidOut;
  }
  const avail = vacation ? Number(vacation.entitlement || 0) + Number(vacation.carryover || 0) - urlaubBefore : null;
  return { name, year, month, rows, netto, soll, glzStart, glzEnd: glz, dayDiff, closedAdj, paidOut, otMode: ot.mode, otCode: ot.code || "", krank, urlaub, krankBefore, urlaubBefore, vacAvailStart: avail, vacAvailEnd: avail == null ? null : avail - urlaub, night, saturday, sunday, holiday, satDays, sunDays, holDays, nightDays };
}

// Zuschläge (optional, set by the Leitung in "Anwesenheit"): per kind either a percentage (the sheet shows the
// hours, payroll calculates) or a fixed amount per day (the sheet shows amount × days). Nothing set = hours only.
export const SURCHARGES = [
  { key: "nacht", label: "Nachtzuschlag (22–6 Uhr)", hours: (s) => s.night, days: (s) => s.nightDays },
  { key: "samstag", label: "Samstagszuschlag", hours: (s) => s.saturday, days: (s) => s.satDays },
  { key: "sonntag", label: "Sonntagszuschlag", hours: (s) => s.sunday, days: (s) => s.sunDays },
  { key: "feiertag", label: "Feiertagszuschlag", hours: (s) => s.holiday, days: (s) => s.holDays },
];
const fmtDays = (n) => String(Math.round(Number(n) * 10) / 10).replace(".", ",");
const euro = (n) => (Math.round(n * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
function surchargeRows(s, cfg) {
  if (!cfg) return null; // never set up
  return SURCHARGES.filter((z) => cfg[z.key] && cfg[z.key].mode && cfg[z.key].mode !== "off").map((z) => {
    const c = cfg[z.key], h = z.hours(s), d = z.days(s);
    const total = c.mode === "perDay" ? `${euro(Number(c.value) || 0)} × ${d} Tag(e) = ${euro((Number(c.value) || 0) * d)}` : `${hm(h)} Std. × ${String(c.value || 0).replace(".", ",")} %`;
    return { label: z.label, code: c.code || "", total, used: h > 0 || d > 0 };
  });
}

export function buildTimesheetHtml(sheets, meta) {
  const page = (s) => `
<section class="page">
  <div class="head">
    <div><div class="org">${esc(meta.orgName || "")}</div><div class="who">${esc(s.name)}</div><div class="what">Stundenzettel ${MONTHS[s.month]} ${s.year}</div></div>
    <table class="sum"><tr><th>Netto</th><th>Soll</th><th>Zeitkonto</th></tr><tr><td>${hm(s.netto)}</td><td>${hm(s.soll)}</td><td>${hm(s.glzEnd, true)}</td></tr></table>
  </div>
  <div class="boxes">
    <div class="box"><b>Zeitkonto</b><div>Stand Monatsanfang <span>${hm(s.glzStart, true)}</span></div><div>Veränderung <span>${hm(s.dayDiff, true)}</span></div>${s.closedAdj ? `<div>Monatsabschluss (Plan/Vertrag) <span>${hm(s.closedAdj, true)}</span></div>` : ""}${s.paidOut ? `<div>Ausgezahlt <span>${hm(-s.paidOut, true)}</span></div>` : ""}<div class="end">Stand Monatsende <span>${hm(s.glzEnd, true)}</span></div></div>
    <div class="box"><b>Urlaub</b>${s.vacAvailStart == null ? `<div>Genommen (Werktage) <span>${s.urlaub}</span></div><div class="sm">Urlaubsanspruch nicht eingetragen</div>` : `<div>Verfügbar Monatsanfang <span>${fmtDays(s.vacAvailStart)}</span></div><div>Genommen <span>${s.urlaub ? "−" + s.urlaub : "0"}</span></div><div class="end">Verfügbar Monatsende <span>${fmtDays(s.vacAvailEnd)}</span></div>`}</div>
    <div class="box"><b>Krankheit</b><div>Stand Monatsanfang <span>${s.krankBefore}</span></div><div>Veränderung <span>${s.krank}</span></div><div class="end">Stand Monatsende <span>${s.krankBefore + s.krank}</span></div></div>
    ${meta.surcharges && !surchargeRows(s, meta.surcharges).length ? "" : `<div class="box"><b>Zuschlagsstunden</b><div>Nacht (22–6 Uhr) <span>${hm(s.night)}</span></div><div>Sonntag <span>${s.sunDays} Tag(e) · ${hm(s.sunday)}</span></div><div>Feiertag <span>${s.holDays} Tag(e) · ${hm(s.holiday)}</span></div></div>`}
  </div>
  <table class="days">
    <thead><tr><th>Datum</th><th>Wochentag</th><th>Beginn</th><th>Ende</th><th>Pause</th><th>Netto</th><th>Soll</th><th>Tag</th><th>Zeitkonto</th><th>Zuschläge</th><th>Information</th></tr></thead>
    <tbody>${s.rows.map((r) => `<tr class="${r.weekend ? "we" : ""}"><td>${r.date}</td><td>${r.wd}</td><td>${r.begin}</td><td>${r.end}${r.multi ? `<div class="sm">${r.multi}</div>` : ""}</td><td>${r.pause}</td><td class="b">${r.netto}</td><td>${r.soll}</td><td>${r.day}</td><td>${r.glz}</td><td class="sm">${esc(r.zus)}</td><td class="sm">${esc(r.info)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="5">Summe ${MONTHS[s.month]} ${s.year}</td><td class="b">${hm(s.netto)}</td><td>${hm(s.soll)}</td><td>${hm(s.dayDiff, true)}</td><td>${hm(s.glzEnd, true)}</td><td colspan="2"></td></tr></tfoot>
  </table>
  ${(() => { const zr = (surchargeRows(s, meta.surcharges) || []).concat(s.paidOut ? [{ label: "Überstunden ausgezahlt", code: s.otCode, total: `${hm(s.paidOut)} Std.` }] : []); return zr && zr.length ? `<table class="zus"><thead><tr><th>Zuschläge</th><th>Code</th><th>Gesamt</th></tr></thead><tbody>${zr.map((z) => `<tr><td>${esc(z.label)}</td><td>${esc(z.code)}</td><td>${esc(z.total)}</td></tr>`).join("")}</tbody></table>` : ""; })()}
  <div class="foot">Netto = Anwesenheit laut Zeiterfassung minus gesetzliche Pause (§ 4 ArbZG). ${meta.mode === "vertrag" ? "Soll = Vertrag (Wochenstunden ÷ 5 an Werktagen Mo–Fr ohne Feiertage)." : "Soll = veröffentlichter Dienstplan."} Urlaub/Krank/Fortbildung zählen als Arbeitszeit (Netto = Soll). Nachtstunden: nur Nachtarbeit (mehr als 2 Std. zwischen 22 und 6 Uhr), ohne Pause. Feiertage: bundesweit + Oster-/Pfingstsonntag. Erstellt am ${new Date().toLocaleDateString("de-DE")} · Dienstplaner</div>
</section>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Stundenzettel ${MONTHS[meta.month]} ${meta.year}</title><style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; } body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1B2433; margin: 0; }
.page { page-break-after: always; padding: 4mm 2mm; } .page:last-child { page-break-after: auto; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.org { font-size: 11px; color: #5B6578; } .who { font-size: 18px; font-weight: 750; } .what { font-size: 14px; font-weight: 650; }
.sum th { font-size: 10px; color: #5B6578; font-weight: 600; padding: 0 8px; text-align: right; } .sum td { font-size: 14px; font-weight: 700; padding: 0 8px; text-align: right; }
.boxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 6px 0 10px; }
.box { border: 1px solid #D9DEE7; border-radius: 8px; padding: 6px 8px; font-size: 11px; } .box b { display: block; margin-bottom: 3px; font-size: 12px; }
.box div { display: flex; justify-content: space-between; padding: 1px 0; } .box .end { border-top: 1px solid #D9DEE7; margin-top: 2px; font-weight: 700; }
table.days { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.days th { text-align: left; border-bottom: 1.5px solid #1B2433; padding: 3px 3px; font-size: 9px; }
.days td { border-bottom: 1px solid #E3E7EE; padding: 2.5px 3px; vertical-align: top; white-space: nowrap; }
.days td.sm, .days .sm { font-size: 8.5px; color: #4B5568; white-space: normal; } .days td.b { font-weight: 700; }
.days tr.we td { background: #F3F5F9; } .days tfoot td { border-top: 1.5px solid #1B2433; font-weight: 700; padding-top: 4px; }
.foot { margin-top: 8px; font-size: 8.5px; color: #6B7588; }
table.zus { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 10px; }
.zus th { text-align: left; border-bottom: 1.5px solid #1B2433; padding: 3px 4px; } .zus td { border-bottom: 1px solid #E3E7EE; padding: 4px; }
.zus th:last-child, .zus td:last-child { text-align: right; }
.bar { position: sticky; top: 0; background: #12485A; color: #fff; padding: 10px 14px; display: flex; gap: 10px; align-items: center; font-size: 14px; }
.bar button { border: 0; border-radius: 10px; padding: 8px 14px; font-weight: 650; cursor: pointer; }
@media print { .bar { display: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Drucken / Als PDF speichern</button><span>${sheets.length} Stundenzettel · ${MONTHS[meta.month]} ${meta.year}</span></div>
${sheets.map(page).join("")}
<script>window.addEventListener("load", function () { setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 400); });</script>
</body></html>`;
}

// print right on top of the page (hidden frame); iPhone/iPad: new tab
export function openHtmlPrint(html) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) { const w = window.open("", "_blank"); if (!w) return false; w.document.open(); w.document.write(html); w.document.close(); return true; }
  const old = document.getElementById("stundenzettel-print-frame"); if (old) old.remove();
  const f = document.createElement("iframe");
  f.id = "stundenzettel-print-frame"; f.setAttribute("aria-hidden", "true"); f.tabIndex = -1;
  f.style.cssText = "position:fixed;left:-12000px;top:0;width:900px;height:1200px;border:0;opacity:0;pointer-events:none;";
  f.srcdoc = html; document.body.appendChild(f);
  return true;
}
