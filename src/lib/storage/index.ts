import "server-only";
import { getEnv } from "@/lib/env";
import { LocalDiskAdapter } from "./local-disk";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";

let adapter: StorageAdapter | undefined;

// Swap this for an S3-compatible adapter later without touching callers.
export function getStorage(): StorageAdapter {
  adapter ??= new LocalDiskAdapter(getEnv().UPLOAD_DIR);
  return adapter;
}
