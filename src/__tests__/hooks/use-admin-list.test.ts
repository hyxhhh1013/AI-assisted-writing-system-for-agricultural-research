import { describe, expect, it } from "vitest";
import {
  buildAdminListQuerySignature,
  planAdminListFetch,
} from "@/hooks/use-admin-list";

describe("planAdminListFetch", () => {
  it("筛选变化且不在第 1 页时应先翻页", () => {
    expect(
      planAdminListFetch({
        prevSignature: '{"grade":"A"}\0',
        querySignature: '{"grade":"B"}\0',
        page: 3,
      }),
    ).toBe("reset-page");
  });

  it("筛选未变或已在第 1 页时应直接请求", () => {
    expect(
      planAdminListFetch({
        prevSignature: '{"grade":"A"}\0',
        querySignature: '{"grade":"A"}\0',
        page: 3,
      }),
    ).toBe("fetch");

    expect(
      planAdminListFetch({
        prevSignature: '{"grade":"A"}\0',
        querySignature: '{"grade":"B"}\0',
        page: 1,
      }),
    ).toBe("fetch");
  });
});

describe("buildAdminListQuerySignature", () => {
  it("相同 filterKey 与搜索词生成稳定签名", () => {
    const sig = buildAdminListQuerySignature('{"a":1}', "hello");
    expect(sig).toBe('{"a":1}\0hello');
    expect(buildAdminListQuerySignature('{"a":1}', "hello")).toBe(sig);
  });

  it("搜索词变化应产生不同签名", () => {
    const a = buildAdminListQuerySignature("{}", "foo");
    const b = buildAdminListQuerySignature("{}", "bar");
    expect(a).not.toBe(b);
  });
});
