import {
  parseBody,
  createBusinessSchema,
  createCustomerSchema,
  createServiceSchema,
  businessHoursEntrySchema,
  createKnowledgeItemSchema,
  inviteTeamUserSchema,
  changePasswordSchema,
} from "@/lib/validation";
import { ValidationError } from "@/lib/errors";

describe("parseBody", () => {
  it("returns parsed data on success", () => {
    const result = parseBody(createServiceSchema, {
      name: "Women's Haircut",
      durationMinutes: 60,
      price: 65,
    });
    expect(result.name).toBe("Women's Haircut");
    expect(result.currency).toBe("USD"); // default
    expect(result.isActive).toBe(true);  // default
  });

  it("throws ValidationError with field details on failure", () => {
    expect(() =>
      parseBody(createServiceSchema, { name: "", durationMinutes: -1, price: -5 })
    ).toThrow(ValidationError);

    try {
      parseBody(createServiceSchema, { name: "", durationMinutes: -1, price: -5 });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.fields).toBeDefined();
    }
  });
});

describe("createBusinessSchema", () => {
  const validBusiness = {
    name: "Sunset Salon",
    slug: "sunset-salon",
    industry: "SALON",
  };

  it("accepts valid input", () => {
    const result = parseBody(createBusinessSchema, validBusiness);
    expect(result.slug).toBe("sunset-salon");
    expect(result.country).toBe("US"); // default
  });

  it("rejects slug with uppercase", () => {
    expect(() =>
      parseBody(createBusinessSchema, { ...validBusiness, slug: "Sunset-Salon" })
    ).toThrow(ValidationError);
  });

  it("rejects slug with spaces", () => {
    expect(() =>
      parseBody(createBusinessSchema, { ...validBusiness, slug: "sunset salon" })
    ).toThrow(ValidationError);
  });

  it("rejects invalid industry", () => {
    expect(() =>
      parseBody(createBusinessSchema, { ...validBusiness, industry: "DENTIST" })
    ).toThrow(ValidationError);
  });
});

describe("createCustomerSchema", () => {
  it("requires at least phone or email", () => {
    expect(() =>
      parseBody(createCustomerSchema, { name: "John" })
    ).toThrow(ValidationError);
  });

  it("accepts phone only", () => {
    const result = parseBody(createCustomerSchema, { phone: "+12145551234" });
    expect(result.phone).toBe("+12145551234");
    expect(result.smsOptIn).toBe(false); // default
  });

  it("accepts email only", () => {
    const result = parseBody(createCustomerSchema, { email: "test@example.com" });
    expect(result.email).toBe("test@example.com");
  });
});

describe("businessHoursEntrySchema", () => {
  it("rejects closeTime before openTime when open", () => {
    expect(() =>
      parseBody(businessHoursEntrySchema, {
        dayOfWeek: "MONDAY",
        isOpen: true,
        openTime: "18:00",
        closeTime: "09:00",
      })
    ).toThrow(ValidationError);
  });

  it("accepts valid hours", () => {
    const result = parseBody(businessHoursEntrySchema, {
      dayOfWeek: "TUESDAY",
      isOpen: true,
      openTime: "09:00",
      closeTime: "17:00",
    });
    expect(result.dayOfWeek).toBe("TUESDAY");
  });

  it("accepts closed day with any times", () => {
    const result = parseBody(businessHoursEntrySchema, {
      dayOfWeek: "SUNDAY",
      isOpen: false,
      openTime: "00:00",
      closeTime: "00:00",
    });
    expect(result.isOpen).toBe(false);
  });
});

describe("createKnowledgeItemSchema", () => {
  it("defaults category and priority", () => {
    const result = parseBody(createKnowledgeItemSchema, {
      question: "Do you take walk-ins?",
      answer: "When we have openings.",
    });
    expect(result.category).toBe("faq");
    expect(result.priority).toBe(100);
    expect(result.isActive).toBe(true);
  });
});

describe("inviteTeamUserSchema", () => {
  it("creates a front-desk invite", () => {
    const result = parseBody(inviteTeamUserSchema, {
      name: "Alex Desk",
      email: "alex@sunsetsalon.example",
    });
    expect(result.role).toBe("STAFF");
  });
});

describe("changePasswordSchema", () => {
  it("rejects the same password", () => {
    expect(() =>
      parseBody(changePasswordSchema, {
        currentPassword: "Sunset2026!",
        newPassword: "Sunset2026!",
      })
    ).toThrow(ValidationError);
  });
});
