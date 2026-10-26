import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { STORAGE_KEY_PATTERN, type StorageAdapter } from "./types";

export class LocalDiskAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  // Rejects anything but our own key format, which also rules out path traversal.
  private resolve(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, ...key.split("/"));
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async list(): Promise<{ key: string; modifiedAt: Date }[]> {
    const found: { key: string; modifiedAt: Date }[] = [];
    let households: string[];
    try {
      households = await readdir(this.root);
    } catch (error) {
      if (isNotFound(error)) return found;
      throw error;
    }
    for (const household of households) {
      const dir = path.join(this.root, household);
      const entries = await readdir(dir).catch(() => []);
      for (const name of entries) {
        const key = `${household}/${name}`;
        if (!STORAGE_KEY_PATTERN.test(key)) continue;
        found.push({ key, modifiedAt: (await stat(path.join(dir, name))).mtime });
      }
    }
    return found;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
