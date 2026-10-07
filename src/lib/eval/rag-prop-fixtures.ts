/**
 * 主张题库类型。校验规则在 scripts/lib/rag-prop-fixtures.mjs，
 * 脚本和单测共用，避免两套「缺 expectSources 就拒绝」的口径。
 */

export type RagPropQuery = {
  query: string;
  title: string;
  section: string;
  expectSources: string[];
  note: string;
};

export { parseRagPropQueries } from "../../../scripts/lib/rag-prop-fixtures.mjs";
