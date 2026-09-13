import { ForbiddenError } from "@/lib/errors";
import {
  assertWidgetAllowed,
  createChatSessionToken,
  requireChatSession,
  verifyChatSessionToken,
} from "@/lib/security/chat-access";

describe("chat widget access", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      API_SECRET_KEY: "chat-test-secret",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("allows the first-party app origin without a token", () => {
    expect(() =>
      assertWidgetAllowed({
        origin: "http://localhost:3000",
        storedToken: "secret",
        allowedOrigins: [],
      })
    ).not.toThrow();
  });

  it("rejects an unknown site without a token", () => {
    expect(() =>
      assertWidgetAllowed({
        origin: "https://evil.example",
        storedToken: "secret",
        allowedOrigins: [],
      })
    ).toThrow(ForbiddenError);
  });

  it("allows an unknown site that presents the widget token", () => {
    expect(() =>
      assertWidgetAllowed({
        origin: "https://salon.example",
        widgetToken: "secret",
        storedToken: "secret",
        allowedOrigins: [],
      })
    ).not.toThrow();
  });

  it("rejects a token site that is not on the allow list", () => {
    expect(() =>
      assertWidgetAllowed({
        origin: "https://other.example",
        widgetToken: "secret",
        storedToken: "secret",
        allowedOrigins: ["https://salon.example"],
      })
    ).toThrow(ForbiddenError);
  });

  it("signs and verifies a chat session for one business", () => {
    const token = createChatSessionToken({ businessId: "biz-1" });
    expect(verifyChatSessionToken(token)).toEqual({ businessId: "biz-1" });
    expect(() => requireChatSession(token, "biz-2")).toThrow(ForbiddenError);
  });
});
