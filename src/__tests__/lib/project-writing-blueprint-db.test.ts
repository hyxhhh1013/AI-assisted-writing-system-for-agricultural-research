import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import prisma from "@/lib/prisma";
import {
  readWritingBlueprint,
  writeWritingBlueprint,
} from "@/lib/project-writing-blueprint-db";

describe("project-writing-blueprint-db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("readWritingBlueprint returns column value", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ writingBlueprint: '{"version":1}' }]);
    await expect(readWritingBlueprint("p1")).resolves.toBe('{"version":1}');
  });

  it("readWritingBlueprint returns null when missing", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    await expect(readWritingBlueprint("p1")).resolves.toBeNull();
  });

  it("writeWritingBlueprint executes update", async () => {
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1);
    await writeWritingBlueprint("p1", "blob");
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});
