import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./sanitize-filename";

describe("sanitizeFilename", () => {
  it.each([
    ["../../etc/passwd", "passwd.pdf"],
    ["C:\\Users\\me\\Vet invoice.PDF", "Vet invoice.pdf"],
    ["<b>alert(1)<b>.pdf", "b_alert_1_b.pdf"],
    ["a/<script>.pdf", "script.pdf"],
    ["inv\u0000oice\r\n.pdf", "inv_oice.pdf"],
    ["  .. hidden name", "hidden name.pdf"],
    ["", "file.pdf"],
    ["NUL.pdf", "_NUL.pdf"],
    ["Passeport é.pdf", "Passeport é.pdf"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizeFilename(input, "pdf")).toBe(expected);
  });

  it("limits the length and forces the supplied extension", () => {
    const result = sanitizeFilename(`${"a".repeat(300)}.exe`, "png");
    expect(result).toBe(`${"a".repeat(100)}.png`);
  });
});
