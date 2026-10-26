import { connect } from "node:net";

export type ScanResult = { status: "clean" } | { status: "infected"; signature: string };

// Implementations must throw when they cannot reach a verdict; callers then reject the upload
// (fail closed) instead of storing an unscanned file.
export interface VirusScanner {
  scan(data: Buffer): Promise<ScanResult>;
}

export class NoopScanner implements VirusScanner {
  async scan(): Promise<ScanResult> {
    return { status: "clean" };
  }
}

type ClamAvOptions = { host: string; port: number; timeoutMs?: number };

const CHUNK_SIZE = 64 * 1024;

// Speaks clamd's INSTREAM protocol: zero-terminated command, then length-prefixed chunks.
export class ClamAvScanner implements VirusScanner {
  constructor(private readonly options: ClamAvOptions) {}

  scan(data: Buffer): Promise<ScanResult> {
    const { host, port, timeoutMs = 15_000 } = this.options;
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port });
      const chunks: Buffer[] = [];
      socket.setTimeout(timeoutMs, () => socket.destroy(new Error("clamd timed out")));
      socket.on("error", reject);
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("close", () => {
        const reply = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
        const verdict = parseReply(reply);
        if (verdict) resolve(verdict);
        else reject(new Error(`Unexpected clamd reply: ${reply.slice(0, 80)}`));
      });
      socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < data.byteLength; offset += CHUNK_SIZE) {
          const part = data.subarray(offset, offset + CHUNK_SIZE);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(part.byteLength);
          socket.write(length);
          socket.write(part);
        }
        socket.end(Buffer.alloc(4));
      });
    });
  }
}

function parseReply(reply: string): ScanResult | null {
  if (/^stream:\s*OK$/.test(reply)) return { status: "clean" };
  const found = /^stream:\s*(.+?)\s+FOUND$/.exec(reply);
  return found?.[1] ? { status: "infected", signature: found[1] } : null;
}
