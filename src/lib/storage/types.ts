export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  // Used by the cleanup job to find bytes that no database row points to.
  list(): Promise<{ key: string; modifiedAt: Date }[]>;
}

// Keys are opaque server-generated paths: `<householdId>/<uuid>`.
export const STORAGE_KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
