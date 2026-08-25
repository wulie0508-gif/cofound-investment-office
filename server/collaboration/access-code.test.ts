import { describe, expect, it } from "vitest";
import {
  createShareAccessSession,
  hashShareAccessCode,
  isShareAccessCodeHash,
  verifyShareAccessCode,
  verifyShareAccessSession,
} from "./access-code";

describe("share access codes", () => {
  it("stores a salted slow hash instead of the six digit code", () => {
    const first = hashShareAccessCode("240815");
    const second = hashShareAccessCode("240815");
    expect(first).not.toContain("240815");
    expect(first).not.toBe(second);
    expect(isShareAccessCodeHash(first)).toBe(true);
    expect(isShareAccessCodeHash("240815")).toBe(false);
    expect(verifyShareAccessCode("240815", first)).toBe(true);
    expect(verifyShareAccessCode("240816", first)).toBe(false);
  });

  it("rejects malformed access codes and hashes", () => {
    expect(() => hashShareAccessCode("12345")).toThrow(/6 位数字/u);
    expect(verifyShareAccessCode("123456", "not-a-hash")).toBe(false);
  });

  it("binds a short-lived session to the share token and current hash", () => {
    const hash = hashShareAccessCode("240815");
    const session = createShareAccessSession("share-a", hash, 1_000);
    expect(verifyShareAccessSession("share-a", hash, session, 1_001)).toBe(
      true
    );
    expect(verifyShareAccessSession("share-b", hash, session, 1_001)).toBe(
      false
    );
    expect(verifyShareAccessSession("share-a", hash, session, 50_000)).toBe(
      false
    );
  });
});
