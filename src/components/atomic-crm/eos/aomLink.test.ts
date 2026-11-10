import { describe, expect, it } from "vitest";
import { aomHref } from "./aomLink";

describe("aomHref", () => {
  const P = "/playbooks/assign?assignment=abc#x";
  it("prefixes a relative path with an http(s) origin (trailing slashes trimmed)", () => {
    expect(aomHref(P, "https://aom.example")).toBe(`https://aom.example${P}`);
    expect(aomHref(P, "http://localhost:5000//")).toBe(`http://localhost:5000${P}`);
  });
  it("reduces an absolute http(s) path before prefixing", () => {
    expect(aomHref("https://other.example/a/b?c=1", "https://aom.example")).toBe(
      "https://aom.example/a/b?c=1",
    );
  });
  it.each(["/\\evil.example", "//evil.example/x", "relative", "", "mailto:a@b.example", "javascript:alert(1)", "/ok\n", "/ok ", "/\tx", "/" + "a".repeat(2048)])(
    "returns null for bad path %j",
    (p) => {
      expect(aomHref(p, "https://aom.example")).toBeNull();
    },
  );
  it("accepts a 2048-char path", () => {
    const p = "/" + "a".repeat(2047);
    expect(aomHref(p, "https://aom.example")).toBe(`https://aom.example${p}`);
  });
  it.each([undefined, null, "", "   ", "javascript:alert(1)", "//evil.example", "ftp://aom.example", "garbage", "/relative"])(
    "returns null for bad origin %j",
    (o) => {
      expect(aomHref(P, o as any)).toBeNull();
    },
  );
});
