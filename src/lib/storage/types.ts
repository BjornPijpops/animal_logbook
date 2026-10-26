export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Keys are opaque server-generated paths: `<householdId>/<uuid>`.
export const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
