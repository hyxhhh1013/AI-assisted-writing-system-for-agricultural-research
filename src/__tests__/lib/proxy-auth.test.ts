import { describe, it, expect } from "vitest";
import {
  USER_ID_HEADER,
  forwardRequestHeadersWithUserId,
} from "@/lib/auth";

describe("forwardRequestHeadersWithUserId", () => {
  it("sets x-user-id on cloned request headers", () => {
    const incoming = new Headers({ "x-custom": "1" });
    const out = forwardRequestHeadersWithUserId(incoming, "user-abc");
    expect(out.get(USER_ID_HEADER)).toBe("user-abc");
    expect(out.get("x-custom")).toBe("1");
  });

  it("does not set header when userId is null", () => {
    const incoming = new Headers();
    const out = forwardRequestHeadersWithUserId(incoming, null);
    expect(out.get(USER_ID_HEADER)).toBeNull();
  });

  it("does not mutate the original Headers instance", () => {
    const incoming = new Headers();
    forwardRequestHeadersWithUserId(incoming, "user-abc");
    expect(incoming.get(USER_ID_HEADER)).toBeNull();
  });
});
