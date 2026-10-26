import { expect, it } from "vitest";
import { contentDisposition } from "./content-disposition";

it("keeps the header well formed for hostile names", () => {
  const header = contentDisposition("attachment", 'a"; filename=evil.exe\r\nX: y é.pdf');
  expect(header).not.toMatch(/[\r\n]/);
  expect(header.startsWith("attachment; filename=")).toBe(true);
  expect(header.match(/filename="/g)).toHaveLength(1);
  expect(header).toContain("filename*=UTF-8''a%22%3B%20filename%3Devil.exe");
});

it("encodes non-ASCII names", () => {
  expect(contentDisposition("inline", "Passeport é.pdf")).toBe(
    "inline; filename=\"Passeport _.pdf\"; filename*=UTF-8''Passeport%20%C3%A9.pdf",
  );
});
