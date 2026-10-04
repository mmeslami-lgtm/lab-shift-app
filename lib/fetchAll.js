// Reads every row of a query even when it has more rows than the server's page limit (1000).
// makeQuery must return a fresh query each time, e.g. () => sb.from("t").select("*").eq(...)
export async function fetchAll(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
