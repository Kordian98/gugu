import { crc32, deflateRawSync } from "node:zlib";
import type { PayrollMonth } from "@gugu/contracts";
import { createI18n } from "@gugu/localization";

type Cell = string | number;

/** Header + one row per person + totals + the "estimate" note (localized from the `crm` namespace). */
export function payrollTable(p: PayrollMonth, locale: "vi" | "en"): Cell[][] {
  const { t } = createI18n(locale);
  const col = (k: string) => t(`crm:payroll.export.${k}`);
  const header = [
    col("name"),
    col("baseType"),
    col("workingDays"),
    col("base"),
    col("commission"),
    col("bonus"),
    col("deduction"),
    col("advance"),
    col("total"),
    col("paidOn"),
  ];
  const rows: Cell[][] = p.rows.map((r) => [
    r.displayName,
    r.baseType ? t(`crm:payroll.baseType.${r.baseType}`) : "",
    r.workingDays,
    r.base,
    r.commission,
    r.bonus,
    r.deduction,
    r.advance,
    r.total,
    r.paidOn ?? "",
  ]);
  const totals: Cell[] = [
    col("totals"),
    "",
    "",
    p.totals.base,
    p.totals.commission,
    p.totals.bonus,
    p.totals.deduction,
    p.totals.advance,
    p.totals.total,
    "",
  ];
  return [[`${col("title")} ${p.month}`], header, ...rows, totals, [], [col("note")]];
}

const BOM = String.fromCharCode(0xfeff);

/** RFC 4180 CSV with a UTF-8 BOM so Excel shows Vietnamese correctly. Formula-like cells are quoted. */
export function toCsv(table: Cell[][]): Buffer {
  const esc = (c: Cell) => {
    if (typeof c === "number") return String(c);
    // Spreadsheet formula injection guard (names are entered by the salon).
    const v = /^[=+\-@\t\r]/.test(c) ? `'${c}` : c;
    return /[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return Buffer.from(`${BOM}${table.map((r) => r.map(esc).join(",")).join("\r\n")}\r\n`, "utf8");
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const colName = (i: number): string => {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** Minimal Office Open XML workbook (one sheet, inline strings, numbers as numbers). */
export function toXlsx(table: Cell[][], sheetName: string): Buffer {
  const rows = table
    .map((r, ri) => {
      const cells = r
        .map((c, ci) => {
          const ref = `${colName(ci)}${String(ri + 1)}`;
          return typeof c === "number"
            ? `<c r="${ref}"><v>${String(c)}</v></c>`
            : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`;
        })
        .join("");
      return `<row r="${String(ri + 1)}">${cells}</row>`;
    })
    .join("");
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ],
    [
      "xl/worksheets/sheet1.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    ],
  ];
  return zip(files.map(([name, body]) => ({ name, data: Buffer.from(body, "utf8") })));
}

/** ZIP container (deflate) — just enough for an .xlsx. */
function zip(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = deflateRawSync(e.data);
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}
