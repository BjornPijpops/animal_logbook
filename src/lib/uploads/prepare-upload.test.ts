// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareUpload } from "./prepare-upload";

const limits = { maxBytes: 1024 * 1024 };
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

async function jpegWithGps() {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: "#369" } })
    .jpeg()
    .withExif({ IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" } })
    .toBuffer();
}

const reason = (result: Awaited<ReturnType<typeof prepareUpload>>) =>
  result.ok ? "ok" : result.error.message;

describe("prepareUpload", () => {
  it("accepts a PDF and records checksum, type and a safe name", async () => {
    const result = await prepareUpload(
      { data: pdf, fileName: "../Vet invoice.PDF", declaredType: "application/pdf" },
      limits,
    );
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.mimeType).toBe("application/pdf");
    expect(result.value.originalName).toBe("Vet invoice.pdf");
    expect(result.value.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.value.sizeBytes).toBe(pdf.byteLength);
  });

  it("strips EXIF/GPS from images but keeps the format", async () => {
    const original = await jpegWithGps();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const result = await prepareUpload({ data: original, fileName: "scan.jpeg" }, limits);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.mimeType).toBe("image/jpeg");
    expect(result.value.originalName).toBe("scan.jpg");
    expect((await sharp(result.value.data).metadata()).exif).toBeUndefined();
  });

  it("rejects SVG, HTML and plain text, whatever they claim to be", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");
    for (const data of [svg, html, Buffer.from("hello")]) {
      const result = await prepareUpload(
        { data, fileName: "doc.pdf", declaredType: "application/pdf" },
        limits,
      );
      expect(reason(result)).toBe("unsupported_type");
    }
  });

  it("rejects spoofed types and extensions", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(reason(await prepareUpload({ data: png, fileName: "x.pdf" }, limits))).toBe(
      "type_mismatch",
    );
    expect(
      reason(
        await prepareUpload({ data: pdf, fileName: "x.pdf", declaredType: "image/png" }, limits),
      ),
    ).toBe("type_mismatch");
    expect(reason(await prepareUpload({ data: pdf, fileName: "x.exe" }, limits))).toBe(
      "type_mismatch",
    );
  });

  it("rejects empty, oversized and corrupt files", async () => {
    expect(reason(await prepareUpload({ data: Buffer.alloc(0), fileName: "a.pdf" }, limits))).toBe(
      "empty",
    );
    expect(reason(await prepareUpload({ data: pdf, fileName: "a.pdf" }, { maxBytes: 10 }))).toBe(
      "too_large",
    );
    const truncated = (await jpegWithGps()).subarray(0, 120);
    expect(reason(await prepareUpload({ data: truncated, fileName: "a.jpg" }, limits))).toBe(
      "corrupt",
    );
  });
});
