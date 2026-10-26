export const UPLOAD_REJECTIONS = [
  "empty",
  "too_large",
  "unsupported_type",
  "type_mismatch",
  "corrupt",
  "quota_exceeded",
  "infected",
  "scan_unavailable",
] as const;
export type UploadRejection = (typeof UPLOAD_REJECTIONS)[number];
