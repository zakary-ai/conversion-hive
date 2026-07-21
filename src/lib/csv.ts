// Minimal CSV parser that handles quoted fields and escaped quotes.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length === 1 && !rows[i][0]) continue;
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => { obj[h] = (rows[i][idx] ?? "").trim(); });
    out.push(obj);
  }
  return out;
}
