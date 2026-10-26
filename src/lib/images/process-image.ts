import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { err, ok, type Result } from "@/lib/result";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_PIXELS = 50_000_000;
const DISPLAY_MAX_PX = 1600;
const THUMB_MAX_PX = 320;

export type ProcessedImage = {
  display: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
};

export type ImageLimits = { maxBytes: number };

// The client-declared MIME type and file name are ignored: the type is decided from magic bytes,
// and the image is fully re-encoded, which drops all metadata (EXIF, GPS, XMP, ICC comments).
export async function processImage(
  input: Buffer,
  limits: ImageLimits,
): Promise<Result<ProcessedImage>> {
  if (input.byteLength === 0) return err("validation", "Empty file");
  if (input.byteLength > limits.maxBytes) return err("validation", "File too large");

  const detected = await fileTypeFromBuffer(input);
  if (!detected || !ALLOWED_MIME.has(detected.mime)) {
    return err("validation", "Unsupported file type");
  }

  try {
    const pipeline = () =>
      sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
    const display = await pipeline()
      .resize({
        width: DISPLAY_MAX_PX,
        height: DISPLAY_MAX_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await pipeline()
      .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "cover" })
      .webp({ quality: 75 })
      .toBuffer();
    return ok({
      display: display.data,
      thumbnail,
      width: display.info.width,
      height: display.info.height,
    });
  } catch {
    return err("validation", "Image could not be read");
  }
}
