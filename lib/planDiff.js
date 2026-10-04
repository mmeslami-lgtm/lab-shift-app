// Differences between two versions of a month, using the same rules as the database function
// publish_month (so the preview the Leitung/Inhaber sees matches what gets recorded):
//   cover      somebody takes over a shift of somebody else (pairs are matched in order of staff id)
//   extra      somebody gets an additional shift
//   cancelled  somebody's shift is removed without replacement
// Rows look like { staff_id, shift_date, shift_key }.
export function computeChanges(oldRows, newRows) {
  const k = (r) => `${r.staff_id}|${r.shift_date}|${r.shift_key}`;
  const oldSet = new Set(oldRows.map(k));
  const newSet = new Set(newRows.map(k));
  const group = (rows, other) => {
    const m = new Map();
    rows.forEach((r) => {
      if (other.has(k(r))) return; // unchanged
      const g = `${r.shift_date}|${r.shift_key}`;
      if (!m.has(g)) m.set(g, []);
      m.get(g).push(r.staff_id);
    });
    m.forEach((a) => a.sort());
    return m;
  };
  const removed = group(oldRows, newSet);
  const added = group(newRows, oldSet);
  const out = [];
  [...new Set([...removed.keys(), ...added.keys()])].sort().forEach((g) => {
    const [date, key] = g.split("|");
    const r = removed.get(g) || [];
    const a = added.get(g) || [];
    for (let i = 0; i < Math.max(r.length, a.length); i++) {
      const both = a[i] && r[i];
      out.push({ date, key, staffId: a[i] || r[i], replacedId: both ? r[i] : null, kind: both ? "cover" : a[i] ? "extra" : "cancelled" });
    }
  });
  return out;
}
