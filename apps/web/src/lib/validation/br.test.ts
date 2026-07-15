import { describe, expect, it } from "vitest";
import { formatCPF, isValidCEP, isValidCPF } from "./br";

describe("CPF helpers", () => {
  it("accepts valid formatted and unformatted CPFs", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("11144477735")).toBe(true);
  });

  it("rejects invalid and repeated CPFs", () => {
    expect(isValidCPF("123.456.789-00")).toBe(false);
    expect(isValidCPF("111.111.111-11")).toBe(false);
  });

  it("formats a CPF progressively", () => {
    expect(formatCPF("52998224725")).toBe("529.982.247-25");
  });
});

describe("CEP helpers", () => {
  it("accepts formatted and unformatted CEPs with eight digits", () => {
    expect(isValidCEP("60160-230")).toBe(true);
    expect(isValidCEP("60160230")).toBe(true);
  });

  it("rejects incomplete CEPs", () => {
    expect(isValidCEP("60160-23")).toBe(false);
  });
});
