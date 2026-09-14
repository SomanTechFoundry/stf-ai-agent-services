import { isReservedSlug, slugify } from "@/lib/utils/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Test Salon")).toBe("test-salon");
    expect(slugify("  Oak & Ivy  ")).toBe("oak-ivy");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });
});

describe("isReservedSlug", () => {
  it("blocks platform routes", () => {
    expect(isReservedSlug("dashboard")).toBe(true);
    expect(isReservedSlug("onboard")).toBe(true);
    expect(isReservedSlug("test-salon")).toBe(false);
  });
});
