import { buildAppointmentIcs, escapeIcsText, toIcsUtc } from "@/lib/utils/ics";

describe("toIcsUtc", () => {
  it("formats a UTC timestamp", () => {
    expect(toIcsUtc(new Date("2026-09-15T18:30:00.000Z"))).toBe("20260915T183000Z");
  });
});

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, and newlines", () => {
    expect(escapeIcsText("Hi; there, line\n2")).toBe("Hi\\; there\\, line\\n2");
  });
});

describe("buildAppointmentIcs", () => {
  it("builds a VEVENT with the appointment id", () => {
    const ics = buildAppointmentIcs({
      appointmentId: "appt_123",
      title: "Cut at Sunset Salon",
      description: "Your Cut appointment.",
      location: "100 Main St, Dallas, TX",
      start: new Date("2026-09-15T18:00:00.000Z"),
      end: new Date("2026-09-15T19:00:00.000Z"),
      organizerEmail: "hello@sunsetsalon.example",
    });

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:appt_123@stf-ai-agent");
    expect(ics).toContain("DTSTART:20260915T180000Z");
    expect(ics).toContain("DTEND:20260915T190000Z");
    expect(ics).toContain("SUMMARY:Cut at Sunset Salon");
    expect(ics).toContain("LOCATION:100 Main St\\, Dallas\\, TX");
    expect(ics).toContain("ORGANIZER:mailto:hello@sunsetsalon.example");
    expect(ics).toContain("END:VCALENDAR");
  });
});
