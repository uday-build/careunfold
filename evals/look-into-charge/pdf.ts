function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function syntheticPdf(text: string): Uint8Array {
  const lines = text.split("\n").slice(0, 40).map((line) => escapePdfText(line.slice(0, 90)));
  const operators = ["BT /F1 11 Tf 50 750 Td", ...lines.flatMap((line) => [`(${line}) Tj`, "0 -14 Td"]), "ET"].join("\n");
  const stream = `${operators}\n`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}endstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const startxref = Buffer.byteLength(body);
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`,
    `startxref\n${startxref}\n%%EOF\n`,
  ].join("");
  return new Uint8Array(Buffer.from(body + xref));
}
