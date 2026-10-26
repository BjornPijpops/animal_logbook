import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { NoopScanner, type VirusScanner } from "@/lib/uploads/virus-scanner";
import { createMemoryStorage } from "@/test/db";
import type { DocumentInput } from "../schemas";
import type { DocumentDeps } from "../server/service";

export function makeDocumentDeps(
  db: Database,
  overrides: Partial<DocumentDeps> & { scanner?: VirusScanner } = {},
) {
  const storage = createMemoryStorage();
  const deps: DocumentDeps = {
    db,
    storage,
    scanner: new NoopScanner(),
    maxUploadBytes: 1024 * 1024,
    householdQuotaBytes: 10 * 1024 * 1024,
    ...overrides,
  };
  return { deps, storage };
}

export function documentInput(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    type: "invoice",
    title: `Invoice ${randomUUID().slice(0, 6)}`,
    notes: "Annual check-up",
    expiresOn: "",
    animalId: "",
    ...overrides,
  };
}

export function pdfFile(name = "invoice.pdf", extra = "") {
  return {
    data: Buffer.from(`%PDF-1.4\n1 0 obj\n<<>>\nendobj\n${extra}trailer\n<<>>\n%%EOF\n`),
    fileName: name,
    declaredType: "application/pdf",
  };
}

export async function pngFile(name = "scan.png") {
  const data = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#fa0" },
  })
    .png()
    .toBuffer();
  return { data, fileName: name, declaredType: "image/png" };
}
