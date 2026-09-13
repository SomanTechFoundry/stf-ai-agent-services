import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a token", () => {
    const token = "ya29.example-refresh-token";
    const enc = encryptSecret(token);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc)).toBe(token);
  });

  it("returns legacy plaintext unchanged", () => {
    expect(decryptSecret("not-encrypted")).toBe("not-encrypted");
  });
});
