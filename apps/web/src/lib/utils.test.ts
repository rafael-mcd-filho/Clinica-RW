import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("typography class merging", () => {
  it.each([
    ["text-control font-medium", "text-primary-foreground"],
    ["text-caption font-medium", "text-success-foreground"],
    ["text-body-sm", "text-muted-foreground"],
    ["text-heading-sm font-semibold", "text-foreground"],
    ["text-table", "text-secondary-foreground"],
  ])("preserves %s when adding %s", (typography, color) => {
    expect(cn(typography, color)).toBe(`${typography} ${color}`);
  });

  it("replaces the size without dropping the foreground color", () => {
    expect(cn("text-control text-foreground", "text-reading")).toBe(
      "text-foreground text-reading",
    );
    expect(cn("text-body text-foreground", "text-sm")).toBe(
      "text-foreground text-sm",
    );
    expect(cn("text-sm text-foreground", "text-body")).toBe(
      "text-foreground text-body",
    );
  });

  it("keeps responsive sizes independent of responsive colors", () => {
    expect(
      cn(
        "text-control md:text-reading md:text-muted-foreground",
        "md:text-body md:text-foreground",
      ),
    ).toBe("text-control md:text-body md:text-foreground");
  });
});
