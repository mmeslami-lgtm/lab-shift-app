// "Beste von N Varianten": the generator is run many times (it decides ties by chance) and every
// result is scored here; the plan with the LOWEST score is shown. Every rule the generator follows
// stays in force for every variant – the score only decides between plans that are all built by
// those rules. What counts (biggest first):
//   1. warnings (a rule could not be kept, a shift stayed empty)            1000 each
//      (only "fewer than 2 Saturdays/Sundays" is a soft fairness warning:      20 each)
//   2. a wanted place stayed empty (e.g. Frühdienst with 1 person)             150 each; overtime notes 15
//   3. uneven hours: everybody should be the same share above/below the goal  (std. deviation)
//   4. hours above the goal                                                      (sum)
//   5. uneven nights among those who do nights                                  (max − min, std.)
//   6. uneven weekends among those who work weekends                            (max − min)
//   7. Saturday and Sunday of a weekend with different people on a shift     1000 each (core rule)
//   8. uneven MIX of day shifts: everybody should get a similar share of Früh / Mittel / Spät …
//      (not one person only mornings, another only lates)                      (std. of shares, + 0-of-a-kind)
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) * (x - m)))); };

export function scorePlan(plan, staffList, nightKeys, mixKeys) {
  const { days, hours = {}, targetOf = {}, warnings = [], notes = [] } = plan;
  const soft = (w) => /weniger als 2 (Samstage|Sonntage)/.test(w);
  const hoursWarn = (w) => /Abweichung vom Stundenziel/.test(w); // measured below (3.), not counted twice
  let sc = warnings.filter((w) => !soft(w) && !hoursWarn(w)).length * 1000 + warnings.filter(soft).length * 20;
  sc += notes.filter((n) => /statt|1 Person/.test(n)).length * 150;   // a place stayed empty
  sc += notes.filter((n) => /Überstunden|Mehrstunden/.test(n)).length * 15;

  const withGoal = staffList.filter((s) => (targetOf[s.id] || 0) > 0);
  const rel = withGoal.map((s) => ((hours[s.id] || 0) - targetOf[s.id]) / targetOf[s.id]);
  sc += std(rel) * 5000;
  sc += rel.filter((r) => r > 0.02).reduce((a, r) => a + r, 0) * 800;

  const nightSet = new Set(nightKeys || []);
  const nightOk = staffList.filter((s) => !s.nightExempt);
  if (nightSet.size && nightOk.length > 1) {
    // nights in relation to the person's hours (a Minijob is not expected to do as many nights)
    const n = nightOk.map((s) => days.reduce((c, d) => c + [...nightSet].filter((k) => (d.shifts[k] || []).includes(s.id)).length, 0) / Math.max(0.25, (targetOf[s.id] || 160) / 160));
    sc += (Math.max(...n) - Math.min(...n)) * 25 + std(n) * 40;
  }

  const weOk = staffList.filter((s) => !s.weekendExempt);
  if (weOk.length > 1) {
    const w = weOk.map((s) => days.reduce((c, d) => c + ((d.weekday === 0 || d.weekday === 6) && Object.keys(d.shifts).some((k) => (d.shifts[k] || []).includes(s.id)) ? 1 : 0), 0));
    sc += (Math.max(...w) - Math.min(...w)) * 60 + std(w) * 60; // full-timers: weekends as even as possible
  }

  for (let i = 0; i + 1 < days.length; i++) {
    const sa = days[i], su = days[i + 1];
    if (sa.weekday !== 6 || su.weekday !== 0 || sa.isClosed || su.isClosed) continue;
    Object.keys(sa.shifts).forEach((k) => {
      const a = (sa.shifts[k] || []).filter(Boolean).sort().join(), b = (su.shifts[k] || []).filter(Boolean).sort().join();
      if (a && b && a !== b) sc += 1000; // Saturday = Sunday is a core rule
    });
  }
  // 8. shift mix: share of each day-shift kind per person (only people with enough day shifts)
  const mk = (mixKeys || []).filter(Boolean);
  if (mk.length > 1) {
    const counts = staffList.map((s) => {
      const c = {}; mk.forEach((k) => { c[k] = 0; });
      days.forEach((d) => mk.forEach((k) => { if ((d.shifts[k] || []).includes(s.id)) c[k]++; }));
      const tot = mk.reduce((t, k) => t + c[k], 0);
      return { c, tot };
    }).filter((x) => x.tot >= 6);
    if (counts.length > 1) {
      mk.forEach((k) => {
        const shares = counts.map((x) => x.c[k] / x.tot);
        if (avg(shares) < 0.08) return;                     // a kind almost nobody does (e.g. rare shift)
        sc += std(shares) * 160;   // secondary: nights, weekends, Sa=So, rest rules weigh more
        sc += counts.filter((x) => x.c[k] === 0).length * 40; // nobody should never get a common shift
      });
    }
  }
  return sc;
}

export const VARIANTS = 60;
