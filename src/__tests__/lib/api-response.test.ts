import { describe, it, expect } from "vitest";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  notFoundResponse,
  validationErrorResponse,
} from "@/lib/api-response";

describe("api-response helpers", () => {
  it("successResponse returns correct shape", async () => {
    const res = successResponse({ id: "1" });
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { id: "1" } });
    expect(res.status).toBe(200);
  });

  it("successResponse accepts custom status", () => {
    const res = successResponse({ id: "1" }, 201);
    expect(res.status).toBe(201);
  });

  it("errorResponse returns correct shape", async () => {
    const res = errorResponse("something went wrong", 500);
    const json = await res.json();
    expect(json).toEqual({ success: false, error: "something went wrong" });
    expect(res.status).toBe(500);
  });

  it("errorResponse includes details when provided", async () => {
    const res = errorResponse("validation failed", 400, { name: ["required"] });
    const json = await res.json();
    expect(json).toEqual({ success: false, error: "validation failed", details: { name: ["required"] } });
  });

  it("unauthorizedResponse returns 401", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("notFoundResponse returns 404", async () => {
    const res = notFoundResponse();
    expect(res.status).toBe(404);
  });

  it("validationErrorResponse returns 400 with errors", async () => {
    const res = validationErrorResponse({ title: ["必填"] });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.details).toEqual({ title: ["必填"] });
  });
});
