import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { err, ok, type Result } from "@/lib/result";
import { UPLOAD_REJECTIONS, type UploadRejection } from "./rejections";
import { sanitizeFilename } from "./sanitize-filename";

// Machine-readable reason carried in the error message of a validation failure.
export const reject = (reason: UploadRejection) => err("validation", reason);

export function rejectionOf(message: string): UploadRejection | null {
  return UPLOAD_REJECTIONS.find((r) => r === message) ?? null;
}

const ALLOWED = {
  "application/pdf": { extension: "pdf", names: ["pdf"] },
  "image/jpeg": { extension: "jpg", names: ["jpg", "jpeg"] },
  "image/png": { extension: "png", names: ["png"] },
  "image/webp": { extension: "webp", names: ["webp"] },
} as const;
type AllowedMime = keyof typeof ALLOWED;

const isAllowed = (mime: string): mime is AllowedMime => mime in ALLOWED;
const MAX_INPUT_PIXELS = 50_000_000;

export type PreparedUpload = {
  data: Buffer;
  mimeType: AllowedMime;
  sizeBytes: number;
  checksumSha256: string;
  originalName: string;
};

export type UploadInput = { data: Buffer; fileName: string; declaredType?: string };

// Decides the type from magic bytes only. A declared MIME type or extension that disagrees marks
// the upload as spoofed. Images are re-encoded in their own format, which drops EXIF/GPS.
export async function prepareUpload(
  input: UploadInput,
  limits: { maxBytes: number },
): Promise<Result<PreparedUpload>> {
  if (input.data.byteLength === 0) return reject("empty");
  if (input.data.byteLength > limits.maxBytes) return reject("too_large");

  const detected = await fileTypeFromBuffer(input.data);
  if (!detected || !isAllowed(detected.mime)) return reject("unsupported_type");
  const rule = ALLOWED[detected.mime];

  const declared = input.declaredType?.split(";")[0]?.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== detected.mime) {
    return reject("type_mismatch");
  }
  const dot = input.fileName.lastIndexOf(".");
  const extension = dot >= 0 ? input.fileName.slice(dot + 1).toLowerCase() : "";
  const known = extension !== "" && extension.length <= 8;
  const allowedNames: readonly string[] = rule.names;
  if (known && !allowedNames.includes(extension)) return reject("type_mismatch");

  let data = input.data;
  if (detected.mime !== "application/pdf") {
    const cleaned = await stripImageMetadata(input.data, detected.mime);
    if (!cleaned) return reject("corrupt");
    data = cleaned;
    if (data.byteLength > limits.maxBytes) return reject("too_large");
  }

  return ok({
    data,
    mimeType: detected.mime,
    sizeBytes: data.byteLength,
    checksumSha256: createHash("sha256").update(data).digest("hex"),
    originalName: sanitizeFilename(input.fileName, rule.extension),
  });
}

async function stripImageMetadata(
  data: Buffer,
  mime: Exclude<AllowedMime, "application/pdf">,
): Promise<Buffer | null> {
  try {
    const pipeline = sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
    switch (mime) {
      case "image/jpeg":
        return await pipeline.jpeg({ quality: 92 }).toBuffer();
      case "image/png":
        return await pipeline.png().toBuffer();
      case "image/webp":
        return await pipeline.webp({ quality: 92 }).toBuffer();
    }
  } catch {
    return null;
  }
}
