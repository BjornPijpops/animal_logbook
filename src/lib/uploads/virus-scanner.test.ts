// @vitest-environment node
import { createServer, type Server } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ClamAvScanner, NoopScanner } from "./virus-scanner";

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

// A fake clamd: reads the INSTREAM frames, then answers with the configured reply.
async function fakeClamd(reply: string | null): Promise<{ port: number; received: () => Buffer }> {
  let payload = Buffer.alloc(0);
  server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      const header = "zINSTREAM\0".length;
      if (buffer.length < header) return;
      let offset = header;
      const parts: Buffer[] = [];
      for (;;) {
        if (buffer.length < offset + 4) return;
        const length = buffer.readUInt32BE(offset);
        if (length === 0) break;
        if (buffer.length < offset + 4 + length) return;
        parts.push(buffer.subarray(offset + 4, offset + 4 + length));
        offset += 4 + length;
      }
      payload = Buffer.concat(parts);
      if (reply === null) socket.destroy();
      else socket.end(`${reply}\0`);
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { port: address.port, received: () => payload };
}

describe("NoopScanner", () => {
  it("reports every file as clean", async () => {
    expect(await new NoopScanner().scan()).toEqual({ status: "clean" });
  });
});

describe("ClamAvScanner", () => {
  it("streams the file in frames and reads a clean verdict", async () => {
    const clamd = await fakeClamd("stream: OK");
    const data = Buffer.alloc(200_000, 7);
    const scanner = new ClamAvScanner({ host: "127.0.0.1", port: clamd.port });
    expect(await scanner.scan(data)).toEqual({ status: "clean" });
    expect(clamd.received().equals(data)).toBe(true);
  });

  it("reports the signature of an infected file", async () => {
    const clamd = await fakeClamd("stream: Eicar-Test-Signature FOUND");
    const scanner = new ClamAvScanner({ host: "127.0.0.1", port: clamd.port });
    expect(await scanner.scan(Buffer.from("x"))).toEqual({
      status: "infected",
      signature: "Eicar-Test-Signature",
    });
  });

  it("throws when clamd cannot give a verdict (fail closed)", async () => {
    const broken = await fakeClamd("INSTREAM size limit exceeded. ERROR");
    await expect(
      new ClamAvScanner({ host: "127.0.0.1", port: broken.port }).scan(Buffer.from("x")),
    ).rejects.toThrow(/Unexpected clamd reply/);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
    await expect(
      new ClamAvScanner({ host: "127.0.0.1", port: broken.port, timeoutMs: 500 }).scan(
        Buffer.from("x"),
      ),
    ).rejects.toThrow();
  });
});
