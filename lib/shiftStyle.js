// Small helpers shared by screens that draw shifts from the database (colours, short codes, hours).

export const PALETTE = [
  { solid: "#F2B544", soft: "#FFF1D2", ink: "#7A4E00" },
  { solid: "#D9586F", soft: "#FCE5EA", ink: "#8A2A3E" },
  { solid: "#3D4BA8", soft: "#E3E6F8", ink: "#222C7E" },
  { solid: "#2F9E8F", soft: "#DDF3EF", ink: "#17625A" },
  { solid: "#8E5CC9", soft: "#EDE3F8", ink: "#4F2A82" },
  { solid: "#E07B39", soft: "#FCE9DA", ink: "#8A4313" },
  { solid: "#6B8E23", soft: "#EAF1D8", ink: "#3D5210" },
];

export const hhmm = (t) => String(t || "").slice(0, 5);
export const toMin = (t) => { const [h, m] = String(t).split(":"); return (+h || 0) * 60 + (+m || 0); };

// paid hours of one shift = time span minus the 30 minute unpaid break (same rule as the planners)
export function netHours(def) {
  const s = toMin(def.start_time ?? def.start), e0 = toMin(def.end_time ?? def.end);
  const e = e0 <= s ? e0 + 1440 : e0;
  return Math.max(0, (e - s - 30) / 60);
}

// short unique code per shift for compact tables
export function makeCodes(defs) {
  const used = new Set(); const codes = {};
  defs.forEach((d) => {
    const letters = String(d.label || "").replace(/[^A-Za-zÄÖÜäöüß]/g, "").toUpperCase();
    let len = 1, code = letters.slice(0, 1) || "X";
    while (used.has(code) && len < letters.length) { len++; code = letters.slice(0, len); }
    let n = 2; const base = code; while (used.has(code)) { code = base + n; n++; }
    used.add(code); codes[d.key] = code;
  });
  return codes;
}
