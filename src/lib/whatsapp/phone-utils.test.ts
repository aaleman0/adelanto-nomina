import { describe, expect, it } from "vitest";
import { classifyPhone, normalizePhoneForMeta, normalizePhoneFromCsv } from "./phone-utils";

describe("phone-utils", () => {
  it("normalizes Mexican local mobile numbers to WhatsApp 521 format", () => {
    expect(normalizePhoneFromCsv("8713330257")).toBe("5218713330257");
    expect(normalizePhoneForMeta("8713330257")).toBe("5218713330257");
  });

  it("normalizes Mexican 52 numbers to WhatsApp 521 format", () => {
    expect(normalizePhoneFromCsv("528713330257")).toBe("5218713330257");
    expect(normalizePhoneFromCsv("+52 871 333 0257")).toBe("5218713330257");
    expect(normalizePhoneForMeta("528713330257")).toBe("5218713330257");
  });

  it("keeps Mexican WhatsApp 521 numbers unchanged", () => {
    expect(normalizePhoneFromCsv("5218713330257")).toBe("5218713330257");
    expect(normalizePhoneForMeta("5218713330257")).toBe("5218713330257");
  });

  it("keeps other international numbers unchanged", () => {
    expect(normalizePhoneFromCsv("573001112233")).toBe("573001112233");
    expect(normalizePhoneFromCsv("15551234567")).toBe("15551234567");
    expect(normalizePhoneFromCsv("34600111222")).toBe("34600111222");
  });

  it("classifies Mexican 52 numbers as fixable long distance issue", () => {
    expect(classifyPhone("528713330257")).toEqual({
      issue: "long_distance",
      suggested_fix: "5218713330257",
    });
  });
});
