import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isPrismaUniqueViolation,
  renumberReferencesInOrder,
} from "@/lib/project-references";

describe("project references order", () => {
  it("renumberReferencesInOrder removes duplicate order gaps", () => {
    const normalized = renumberReferencesInOrder([
      { id: "c", order: 2 },
      { id: "a", order: 0 },
      { id: "b", order: 0 },
    ]);
    expect(normalized.map((r) => r.order)).toEqual([0, 1, 2]);
    expect(normalized.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("detects Prisma unique constraint violations", () => {
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    expect(isPrismaUniqueViolation(err)).toBe(true);
    expect(isPrismaUniqueViolation(new Error("other"))).toBe(false);
  });
});
