import sharp from "sharp";

// Everything here is generated locally from code: no downloads, no real people or animals.

const escapePdf = (text: string) =>
  text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

// A one-page PDF with plain Helvetica text. Only ASCII is used, so byte offsets equal string
// lengths and the cross-reference table stays correct.
export function demoPdf(title: string, lines: string[]): Buffer {
  const text = [title, "", ...lines, "", "DEMO - fictional content, not a real document"].map(
    (line) => line.replace(/[^\x20-\x7e]/g, "?"),
  );
  const content = [
    "BT",
    "/F1 16 Tf",
    "56 780 Td",
    "20 TL",
    ...text.map((line, index) => `${index === 0 ? "" : "T* "}(${escapePdf(line)}) Tj`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

type Palette = { background: string; coat: string; patch: string; ear: string; accent: string };

function portraitSvg(palette: Palette, variant: "front" | "side", cat: boolean): string {
  const earShape = cat
    ? `<polygon points="150,130 190,40 235,125" fill="${palette.ear}"/><polygon points="365,125 410,40 450,130" fill="${palette.ear}"/>`
    : `<ellipse cx="140" cy="190" rx="45" ry="95" fill="${palette.ear}" transform="rotate(18 140 190)"/><ellipse cx="460" cy="190" rx="45" ry="95" fill="${palette.ear}" transform="rotate(-18 460 190)"/>`;
  const shift = variant === "side" ? 40 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="${palette.background}"/>
  <circle cx="${480 - shift}" cy="110" r="46" fill="${palette.accent}" opacity="0.7"/>
  <rect x="0" y="470" width="600" height="130" fill="${palette.accent}" opacity="0.35"/>
  <g transform="translate(${shift - 20} 0)">
    ${earShape}
    <ellipse cx="300" cy="400" rx="150" ry="140" fill="${palette.coat}"/>
    <ellipse cx="300" cy="420" rx="55" ry="85" fill="${palette.patch}"/>
    <circle cx="300" cy="250" r="115" fill="${palette.coat}"/>
    <ellipse cx="300" cy="295" rx="55" ry="40" fill="${palette.patch}"/>
    <circle cx="258" cy="235" r="13" fill="#ffffff"/><circle cx="342" cy="235" r="13" fill="#ffffff"/>
    <circle cx="260" cy="237" r="7" fill="#1b1b1b"/><circle cx="344" cy="237" r="7" fill="#1b1b1b"/>
    <ellipse cx="300" cy="280" rx="20" ry="14" fill="#1b1b1b"/>
  </g>
</svg>`;
}

export const LUNA_PALETTE: Palette = {
  background: "#dbeafe",
  coat: "#1f2937",
  patch: "#f9fafb",
  ear: "#111827",
  accent: "#93c5fd",
};
export async function demoPortrait(palette: Palette, variant: "front" | "side"): Promise<Buffer> {
  return sharp(Buffer.from(portraitSvg(palette, variant, false)))
    .jpeg({ quality: 82 })
    .toBuffer();
}
