const MAX_BASE_LENGTH = 100;
// Names Windows treats as devices even with an extension; harmless on Linux but kept portable.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

// The result is only ever used as a download name, never as a path. The extension is supplied by
// the caller (derived from the detected file type), so a client cannot pick it.
export function sanitizeFilename(original: string, extension: string): string {
  const lastSegment = original.split(/[\\/]/).pop() ?? "";
  const withoutExtension = lastSegment.replace(/\.[^.]{1,8}$/, "");
  let base = withoutExtension
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/_{2,}/g, "_")
    .replace(/^[.\s_-]+|[.\s_-]+$/g, "")
    .slice(0, MAX_BASE_LENGTH)
    .trim();
  if (base === "" || RESERVED.test(base)) base = base === "" ? "file" : `_${base}`;
  return `${base}.${extension}`;
}
