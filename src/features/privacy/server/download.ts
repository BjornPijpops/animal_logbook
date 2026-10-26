import "server-only";
import type { Ctx } from "@/features/households";
import type { Result } from "@/lib/result";
import { getPrivacyDeps } from "./deps";
import { getExportDownload } from "./service";

export function getExportDownloadForUser(
  ctx: Ctx,
  exportId: string,
): Promise<Result<{ data: Buffer; filename: string }>> {
  return getExportDownload(getPrivacyDeps(), ctx, exportId);
}
