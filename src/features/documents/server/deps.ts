import "server-only";
import { getUploadDeps } from "@/features/files";
import type { DocumentDeps } from "./service";

export function getDocumentDeps(): DocumentDeps {
  return getUploadDeps();
}
