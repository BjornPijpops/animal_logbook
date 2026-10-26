// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processImage } from "./process-image";

const limits = { maxBytes: 5 * 1024 * 1024 };

async function jpegWithGps(width = 40, height = 20): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "#c0803f" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "SecretCam" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .toBuffer();
}

describe("processImage", () => {
  it("strips all EXIF metadata including GPS", async () => {
    const input = await jpegWithGps();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await processImage(input, limits);
    if (!result.ok) throw new Error("expected ok");

    for (const output of [result.value.display, result.value.thumbnail]) {
      const meta = await sharp(output).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(output.includes(Buffer.from("SecretCam"))).toBe(false);
      expect(meta.format).toBe("webp");
    }
  });

  it("applies EXIF orientation before stripping it", async () => {
    const rotated = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#fff" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processImage(rotated, limits);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.width).toBe(20);
    expect(result.value.height).toBe(40);
  });

  it("downsizes large images and produces a small thumbnail", async () => {
    const big = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#336" },
    })
      .png()
      .toBuffer();
    const result = await processImage(big, limits);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.width).toBe(1600);
    expect(result.value.height).toBe(1067);
    const thumb = await sharp(result.value.thumbnail).metadata();
    expect(thumb.width).toBe(320);
    expect(thumb.height).toBe(320);
  });

  it("rejects files whose bytes are not an allowed image, whatever they claim to be", async () => {
    const cases = [
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
      Buffer.from("<html><script>alert(1)</script></html>"),
      Buffer.from("%PDF-1.7 fake"),
      Buffer.from("MZ not really an image"),
    ];
    for (const input of cases) {
      const result = await processImage(input, limits);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects empty, oversized and truncated files", async () => {
    expect((await processImage(Buffer.alloc(0), limits)).ok).toBe(false);
    const input = await jpegWithGps();
    expect((await processImage(input, { maxBytes: 10 })).ok).toBe(false);
    expect((await processImage(input.subarray(0, 40), limits)).ok).toBe(false);
  });
});
