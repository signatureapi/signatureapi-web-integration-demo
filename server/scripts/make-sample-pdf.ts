// Writes assets/sample.pdf: a one-page, dependency-free PDF whose labels line
// up with the places in src/sample-document.ts.

import { mkdir, writeFile } from "node:fs/promises";
import { PAGE_HEIGHT, SAMPLE_TEXT } from "../src/sample-document.ts";

const escapePdfString = (value: string) => value.replace(/[\\()]/g, (char) => `\\${char}`);

const content = SAMPLE_TEXT.map(
  ({ left, top, size, value }) => `BT /F1 ${size} Tf ${left} ${PAGE_HEIGHT - top} Td (${escapePdfString(value)}) Tj ET`,
).join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${PAGE_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
];

let pdf = "%PDF-1.4\n";
const offsets: number[] = [];
objects.forEach((body, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

const assets = new URL("../assets/", import.meta.url);
await mkdir(assets, { recursive: true });
await writeFile(new URL("sample.pdf", assets), pdf);
console.info("wrote assets/sample.pdf");
