import "server-only";
import type { Ctx } from "@/features/households";
import type { Result } from "@/lib/result";
import { getPrivacyDeps } from "./deps";
import { exportPersonalData } from "./personal-export";
import { getExportDownload } from "./service";

export function getExportDownloadForUser(
  ctx: Ctx,
  exportId: string,
): Promise<Result<{ data: Buffer; filename: string }>> {
  return getExportDownload(getPrivacyDeps(), ctx, exportId);
}

export function exportPersonalDataForUser(
  ctx: Ctx,
  password: string,
): Promise<Result<{ json: string; filename: string }>> {
  const { db, limiter } = getPrivacyDeps();
  return exportPersonalData({ db, limiter }, ctx, password);
}
