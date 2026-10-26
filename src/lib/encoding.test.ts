import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TEXT = /\.(ts|tsx|js|mjs|json|md|sql|yml|yaml|css|html|prompt\.md|agent\.md|example)$/;
// UTF-8 text decoded as Windows-1252 leaves these sequences behind (for example the ellipsis).
const MOJIBAKE = /\u00e2\u20ac|\u00c3[\u0080-\u00bf]|\u00c2[\u00a0-\u00bf]|\ufffd/;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter((file) => TEXT.test(file) || file.endsWith(".env.example"));

describe("tracked text files", () => {
  it.each(files)("%s is clean UTF-8", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text.charCodeAt(0)).not.toBe(0xfeff);
    expect(MOJIBAKE.test(text)).toBe(false);
  });
});
