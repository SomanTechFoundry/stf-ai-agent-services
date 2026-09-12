import { logger } from "@/lib/logger";

describe("logger", () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "debug";
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    delete process.env.LOG_LEVEL;
  });

  it("writes structured JSON in production", () => {
    logger.info("test message", { businessId: "biz-1" });
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("test message");
    expect(parsed.context?.businessId).toBe("biz-1");
    expect(parsed.timestamp).toBeDefined();
  });

  it("writes errors to stderr in production", () => {
    logger.error("something failed", new Error("boom"));
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.level).toBe("error");
    expect(parsed.error?.message).toBe("boom");
  });

  it("withContext pre-populates context fields", () => {
    const scoped = logger.withContext({ businessId: "biz-2", requestId: "req-abc" });
    scoped.info("scoped message", { tool: "checkAvailability" });
    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.context?.businessId).toBe("biz-2");
    expect(parsed.context?.requestId).toBe("req-abc");
    expect(parsed.context?.tool).toBe("checkAvailability");
  });

  it("does not log below configured level", () => {
    process.env.LOG_LEVEL = "warn";
    logger.debug("this should not appear");
    logger.info("this should not appear either");
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it("redacts sensitive context keys", () => {
    logger.info("auth attempt", { password: "secret", email: "a@b.com" });
    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.context?.password).toBe("[REDACTED]");
    expect(parsed.context?.email).toBe("a@b.com");
  });

  it("records named operational events", () => {
    logger.event("dashboard_login_success", "signed in", {
      userId: "u1",
      outcome: "success",
    });
    const output = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.context?.event).toBe("dashboard_login_success");
    expect(parsed.context?.outcome).toBe("success");
    expect(parsed.service).toBe("stf-ai-agent-services");
  });
});
