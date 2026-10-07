// Print / PDF view of a Dienstplan for the notice board ("Drucken / PDF" in both planners).
// Gets the SAME input object as the Excel export (see buildScheduleXlsx in the planners) and opens
// a clean A4-landscape page in a new tab, two sheets:
//   1) "nach Schicht": the whole month, in rows of 7 days (Monday first), shift types on the left, names in the cells
//   2) "nach Mitarbeitenden": one row per person, days across, shift code in the cell
// The browser's print window prints it or saves it as PDF ("Als PDF speichern").
// Privacy: only shifts are printed. Absences, vacation (U) and sickness (K) are never printed.

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");

// which people work a shift type on a day, and how many required places stay empty
function cellFor(input, d, key) {
  const reduced = d.isWeekend || d.isHoliday;
  const names = [];
  let open = 0;
  let needed = false;
  input.columns.forEach((col) => {
    if (col.key !== key) return;
    const id = ((d.shifts && d.shifts[col.key]) || [])[col.slotIndex];
    if (id) { names.push(input.nameOf[id] || ""); needed = true; return; }
    if (reduced && (input.skipKeys.has(col.key) || col.slotIndex >= 1)) return; // weekends/holidays: 1 person per shift
    if (input.quotaKeys && input.quotaKeys.has(col.key)) return; // monthly-quota shift: not needed every day
    open += 1; needed = true;
  });
  return { names: names.filter(Boolean), open, needed };
}

export function buildPrintHtml(input, meta) {
  const { year, monthIdx, orgName, status, printedAt } = meta;
  const shiftByKey = {}; input.shifts.forEach((s) => { shiftByKey[s.key] = s; });
  const shiftByCode = {}; input.shifts.forEach((s) => { shiftByCode[s.code] = s; });
  const usedKeys = new Set(input.columns.map((c) => c.key));
  const rows = input.shifts.filter((s) => usedKeys.has(s.key));
  const slotsOf = (key) => input.columns.filter((c) => c.key === key).length;
  const wdShort = input.weekdayNames.map((w) => w.slice(0, 2));
  const dayByNum = {}; input.days.forEach((d) => { dayByNum[d.day] = d; });
  const nDays = input.days.length;

  // calendar weeks, Monday first
  const first = new Date(year, monthIdx, 1);
  const offset = (first.getDay() + 6) % 7; // 0 = Monday
  const weeks = [];
  for (let start = 1 - offset; start <= nDays; start += 7) weeks.push(Array.from({ length: 7 }, (_, i) => start + i));

  // size page 1 so that all weeks fit on one A4-landscape sheet
  const linesPerWeek = 1.5 + rows.reduce((sum, s) => sum + Math.max(1, slotsOf(s.key)), 0);
  const lineMm = Math.max(2.6, Math.min(5.2, 168 / (weeks.length * linesPerWeek)));
  const font1 = Math.max(5.5, Math.min(10, lineMm / 1.25 / 0.3528)).toFixed(1);
  const lineMm2 = Math.max(3.2, Math.min(6.5, 150 / (input.staff.length + 3)));
  const font2 = Math.max(5.5, Math.min(9.5, lineMm2 / 1.35 / 0.3528)).toFixed(1);

  const title = `Dienstplan ${esc(input.monthName)} ${year}`;
  const stamp = `Stand: ${pad(printedAt.getDate())}.${pad(printedAt.getMonth() + 1)}.${printedAt.getFullYear()}, ${pad(printedAt.getHours())}:${pad(printedAt.getMinutes())} Uhr`;
  const statusText = status === "published" ? "Veröffentlichte Fassung" : status === "draft" ? "Entwurf – noch nicht veröffentlicht" : "";
  const head = (sub) => `<header><div><h1>${title}</h1><div class="sub">${esc(orgName || "")}${orgName ? " · " : ""}${sub}</div></div><div class="stamp">${stamp}${statusText ? `<br><b class="${status}">${statusText}</b>` : ""}</div></header>`;
  const legend = `<div class="legend">${rows.map((s) => `<span class="chip" style="background:#${s.hex.soft};color:#${s.hex.ink};border-color:#${s.hex.solid}"><b>${esc(s.code)}</b> ${esc(s.label)} ${esc(s.time)}</span>`).join("")}</div>`;
  const foot = `<footer>Änderungen sind möglich. Der aktuelle Plan steht immer in der App „Meine Schichten“.</footer>`;

  // ---- page 1: by shift, one block per week ----
  let p1 = "";
  weeks.forEach((week) => {
    p1 += `<tr class="wk"><th class="lab"></th>${week.map((n) => {
      const d = dayByNum[n];
      if (!d) return `<th class="out"></th>`;
      const cls = d.isHoliday ? "hol" : d.isWeekend ? "we" : "";
      return `<th class="${cls}">${wdShort[d.weekday]} ${pad(n)}.${pad(monthIdx + 1)}.${d.isHoliday ? " <small>Feiertag</small>" : ""}</th>`;
    }).join("")}</tr>`;
    rows.forEach((s) => {
      const lines = Math.max(1, slotsOf(s.key));
      p1 += `<tr style="height:${(lines * lineMm).toFixed(2)}mm"><td class="lab" style="border-left:3mm solid #${s.hex.solid}"><b>${esc(s.label)}</b> <small>${esc(s.time)}</small></td>${week.map((n) => {
        const d = dayByNum[n];
        if (!d) return `<td class="out"></td>`;
        const c = cellFor(input, d, s.key);
        const bg = c.names.length ? `background:#${s.hex.soft};color:#${s.hex.ink}` : "";
        const we = !c.names.length && (d.isWeekend || d.isHoliday) ? " we" : "";
        const inner = c.names.map((nm) => `<div class="nm">${esc(nm)}</div>`).join("") +
          (c.open ? `<div class="open">${c.open > 1 ? c.open + " × " : ""}unbesetzt</div>` : "") +
          (!c.needed ? `<div class="dash">–</div>` : "");
        const wkd = d.isWeekend || d.isHoliday ? " wkd" : "";
        return `<td class="cell${we}${wkd}" style="${bg}">${inner}</td>`;
      }).join("")}</tr>`;
    });
  });

  // ---- page 2: by person ----
  const dayHead = input.days.map((d) => `<th class="${d.isHoliday ? "hol" : d.isWeekend ? "we" : ""}">${d.day}<br><small>${wdShort[d.weekday]}</small></th>`).join("");
  const p2rows = input.staff.map((p) => `<tr style="height:${lineMm2.toFixed(2)}mm"><td class="name">${esc(p.name)}</td>${input.days.map((d) => {
    const code = input.matrix[p.id] && input.matrix[p.id][d.day];
    const s = code && code !== "U" && code !== "K" ? shiftByCode[code] : null; // never print vacation or sickness
    if (!s) return `<td class="${d.isWeekend || d.isHoliday ? "we" : ""}"></td>`;
    return `<td class="code" style="background:#${s.hex.soft};color:#${s.hex.ink}">${esc(s.code)}</td>`;
  }).join("")}</tr>`).join("");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
@page { size: A4 landscape; margin: 8mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; background: #e5e7eb; }
.bar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 14px; background: #134e4a; color: #fff; font-size: 14px; }
.bar button { border: 0; border-radius: 10px; padding: 9px 14px; font-size: 14px; font-weight: 700; cursor: pointer; }
.bar button:active { transform: translateY(1px); opacity: .85; }
.bar .pri { background: #fff; color: #134e4a; }
.bar .sec { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
.bar span { opacity: .85; font-size: 13px; }
.page { box-sizing: content-box; width: 281mm; margin: 12px auto; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.15); padding: 6mm; }
header { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; margin-bottom: 3mm; }
h1 { margin: 0; font-size: 17pt; color: #134e4a; }
.sub { font-size: 9pt; color: #4b5563; margin-top: 1mm; }
.stamp { font-size: 8.5pt; color: #4b5563; text-align: right; white-space: nowrap; }
.stamp .draft { color: #b45309; } .stamp .published { color: #047857; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 0.25mm solid #9ca3af; padding: 0.4mm 1mm; vertical-align: middle; }
.t1 { font-size: ${font1}pt; line-height: 1.2; }
.t1 col.lab { width: 33mm; }
.t1 tr.wk th { background: #d5ece9; color: #134e4a; font-weight: 700; text-align: center; padding: 0.8mm 1mm; }
.t1 tr.wk th.we { background: #134e4a; color: #fff; } .t1 tr.wk th.hol { background: #b45309; color: #fff; }
.t1 tr.wk th.lab { text-align: left; }
.t1 th.out, .t1 td.out { background: #f3f4f6; border-color: #e5e7eb; }
.t1 td.lab { line-height: 1.1; } .t1 td.lab small { color: #6b7280; font-size: 0.8em; white-space: nowrap; }
.t1 td.cell { text-align: center; }
.nm { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.open { color: #b91c1c; font-weight: 700; background: #fee2e2; border-radius: 1mm; }
.dash { color: #9ca3af; }
td.we { background: #cbd5e1; }
.t1 td.wkd { border-left-color: #134e4a; border-right-color: #134e4a; }
.t2 { font-size: ${font2}pt; }
.t2 col.name { width: 42mm; }
.t2 th { background: #d5ece9; color: #134e4a; text-align: center; font-weight: 700; padding: 0.6mm 0; line-height: 1.1; }
.t2 th.we { background: #134e4a; color: #fff; } .t2 th.hol { background: #b45309; color: #fff; }
.t2 th.nm2 { text-align: left; padding-left: 1.5mm; }
.t2 td { text-align: center; padding: 0; }
.t2 td.name { text-align: left; font-weight: 700; padding-left: 1.5mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t2 td.code { font-weight: 700; }
.legend { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 3mm; font-size: 8.5pt; }
.chip { border: 0.3mm solid; border-radius: 1.5mm; padding: 0.6mm 2mm; }
footer { margin-top: 2.5mm; font-size: 8pt; color: #6b7280; }
@media print {
  html, body { background: #fff; }
  .bar { display: none; }
  .page { margin: 0; box-shadow: none; width: auto; min-height: 0; padding: 0; break-after: page; page-break-after: always; }
  .page:last-child { break-after: auto; page-break-after: auto; }
}
</style></head><body>
<div class="bar"><button class="pri" onclick="window.print()">Drucken / Als PDF speichern</button><button class="sec" onclick="window.close()">Schließen</button><span>Im Druckfenster als Ziel „Als PDF speichern“ wählen, um eine PDF-Datei zu erhalten.</span></div>
<section class="page">${head("nach Schicht")}
<table class="t1"><colgroup><col class="lab">${"<col>".repeat(7)}</colgroup>${p1}</table>
${legend}${foot}</section>
<section class="page">${head("nach Mitarbeitenden")}
<table class="t2"><colgroup><col class="name">${input.days.map(() => "<col>").join("")}</colgroup><tr><th class="nm2">Name</th>${dayHead}</tr>${p2rows}</table>
${legend}${foot}</section>
<script>
// make every sheet fit on ONE A4-landscape page: shrink the text step by step if it is too tall
function fitPages() {
  var mm = 96 / 25.4, limit = 192 * mm;
  Array.prototype.forEach.call(document.querySelectorAll(".page"), function (pg) {
    var t = pg.querySelector("table"), size = parseFloat(getComputedStyle(t).fontSize) * 72 / 96;
    var guard = 0;
    while (pg.scrollHeight > limit && size > 5 && guard++ < 60) { size -= 0.25; t.style.fontSize = size + "pt"; Array.prototype.forEach.call(t.querySelectorAll("tr[style]"), function (tr) { tr.style.height = ""; }); }
  });
}
window.addEventListener("load", function () { fitPages(); setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 400); });
</script>
</body></html>`;
}

// Opens the browser's print window (with its own preview) right on top of the planner, using a
// hidden frame: the planner page stays exactly as it is, nothing has to be loaded again.
// iPhone/iPad print frames badly, so there the sheets open in a new tab instead.
// Returns false only when the browser blocked that new tab.
export function openPrintView(input, meta) {
  const html = buildPrintHtml(input, { ...meta, printedAt: meta.printedAt || new Date() });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) {
    const w = window.open("", "_blank");
    if (!w) return false;
    w.document.open(); w.document.write(html); w.document.close();
    return true;
  }
  const old = document.getElementById("dienstplan-print-frame");
  if (old) old.remove();
  const f = document.createElement("iframe");
  f.id = "dienstplan-print-frame";
  f.setAttribute("aria-hidden", "true");
  f.tabIndex = -1;
  f.style.cssText = "position:fixed;left:-12000px;top:0;width:1200px;height:900px;border:0;opacity:0;pointer-events:none;";
  f.srcdoc = html; // the page inside fits itself to A4 and then opens the print window
  document.body.appendChild(f);
  return true;
}
