import { classifySmsCommand } from "@/lib/sms/commands";

describe("classifySmsCommand", () => {
  it("classifies STOP keywords", () => {
    expect(classifySmsCommand("stop")).toBe("stop");
    expect(classifySmsCommand("  UNSUBSCRIBE  ")).toBe("stop");
    expect(classifySmsCommand("QUIT")).toBe("stop");
  });

  it("classifies START keywords", () => {
    expect(classifySmsCommand("start")).toBe("start");
    expect(classifySmsCommand("YES")).toBe("start");
    expect(classifySmsCommand("unstop")).toBe("start");
  });

  it("classifies HELP keywords", () => {
    expect(classifySmsCommand("help")).toBe("help");
    expect(classifySmsCommand("INFO")).toBe("help");
  });

  it("returns null for booking messages", () => {
    expect(classifySmsCommand("I want a haircut tomorrow")).toBeNull();
    expect(classifySmsCommand("stop please")).toBeNull();
    expect(classifySmsCommand("")).toBeNull();
  });
});
