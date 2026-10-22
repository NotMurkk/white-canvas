// Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, embedded commas/newlines, CRLF, UTF-8 BOM.

export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      fieldStarted = false;
    } else {
      field += c;
      fieldStarted = true;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (fieldStarted || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop blank lines
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parses a CSV with a header row into objects keyed by column name. */
export function parseCsvRecords(text: string, required: readonly string[] = []): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) return [];
  const names = header.map((h) => h.trim());
  const missing = required.filter((r) => !names.includes(r));
  if (missing.length) throw new Error(`CSV is missing column(s): ${missing.join(', ')}`);
  return rows.map((r) => {
    const rec: Record<string, string> = {};
    names.forEach((n, i) => {
      rec[n] = (r[i] ?? '').trim();
    });
    return rec;
  });
}
