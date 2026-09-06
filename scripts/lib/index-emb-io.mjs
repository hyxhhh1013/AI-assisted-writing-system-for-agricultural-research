/**
 * 分类索引 JSON + .emb 的增量读写。
 * 供 index-pdfs.mjs 使用：新增文献只追加 JSON，按 chunk id pread 复制向量，
 * 避免把全库 embedding 读进 JS 堆、避免 skip-stage3 时误删 .emb。
 */
import fs from "fs";
import path from "path";

export const EMB_HEADER_SIZE = 8;

export function writeFloat32LE(arr) {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

export function readFloat32LE(buf, offset, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = buf.readFloatLE(offset + i * 4);
  return out;
}

export function saveJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function stripEmbeddingsFromChunks(chunks) {
  const embeddings = [];
  let dim = 0;
  const stripped = chunks.map((c) => {
    const emb = Array.isArray(c.embedding) && c.embedding.length > 0 ? c.embedding : null;
    embeddings.push(emb);
    if (emb && dim === 0) dim = emb.length;
    const { embedding: _e, ...rest } = c;
    return rest;
  });
  return { stripped, embeddings, dim };
}

export function mergeCategoryChunks(existingChunks, newChunks, dropSources) {
  const drop = dropSources instanceof Set ? dropSources : new Set(dropSources || []);
  const kept = (existingChunks || []).filter((c) => !drop.has(c.metadata?.source));
  return [...kept, ...(newChunks || [])];
}

/** merged 前缀与 old 的 chunk id 顺序完全一致（纯追加） */
export function isPrefixPreservingAppend(oldChunks, mergedChunks) {
  if (!Array.isArray(oldChunks) || !Array.isArray(mergedChunks)) return false;
  if (mergedChunks.length < oldChunks.length) return false;
  for (let i = 0; i < oldChunks.length; i++) {
    if ((oldChunks[i].metadata?.id || "") !== (mergedChunks[i].metadata?.id || "")) return false;
  }
  return true;
}

export function pruneStage1Orphans(oldState, validNames, { isPartial } = {}) {
  if (isPartial) return { state: oldState, removed: [] };
  const valid = validNames instanceof Set ? validNames : new Set(validNames || []);
  const next = { ...oldState };
  const removed = [];
  for (const name of Object.keys(next)) {
    if (!valid.has(name)) {
      delete next[name];
      removed.push(name);
    }
  }
  return { state: next, removed };
}

export function readEmbMeta(embPath) {
  if (!embPath || !fs.existsSync(embPath)) return { exists: false, dim: 0, count: 0 };
  const fd = fs.openSync(embPath, "r");
  try {
    const header = Buffer.alloc(EMB_HEADER_SIZE);
    fs.readSync(fd, header, 0, EMB_HEADER_SIZE, 0);
    const version = header.readUInt32LE(0);
    const dim = header.readUInt32LE(4);
    if (version !== 1 || dim <= 0) return { exists: true, dim: 0, count: 0 };
    const size = fs.fstatSync(fd).size;
    const count = Math.floor((size - EMB_HEADER_SIZE) / (dim * 4));
    return { exists: true, dim, count };
  } finally {
    fs.closeSync(fd);
  }
}

export function writeEmbeddingFile(filePath, embeddings, dim) {
  const header = Buffer.alloc(EMB_HEADER_SIZE);
  header.writeUInt32LE(1, 0);
  header.writeUInt32LE(dim, 4);
  const parts = [header];
  for (const emb of embeddings) {
    if (!emb || emb.length !== dim) {
      parts.push(writeFloat32LE(new Array(dim).fill(0)));
    } else {
      parts.push(writeFloat32LE(emb));
    }
  }
  fs.writeFileSync(filePath, Buffer.concat(parts));
}

export function appendEmbeddings(embPath, embeddings, dim) {
  if (!embeddings.length) return;
  const meta = readEmbMeta(embPath);
  if (!meta.exists) {
    writeEmbeddingFile(embPath, embeddings, dim);
    return;
  }
  if (meta.dim !== dim) {
    throw new Error(`appendEmbeddings dim mismatch: file=${meta.dim} new=${dim}`);
  }
  const fd = fs.openSync(embPath, "a");
  try {
    for (const emb of embeddings) {
      fs.writeSync(fd, writeFloat32LE(emb.length === dim ? emb : new Array(dim).fill(0)));
    }
  } finally {
    fs.closeSync(fd);
  }
}

function resolveDim(attached, embPath) {
  const first = attached.find((e) => Array.isArray(e) && e.length > 0);
  if (first) return first.length;
  return readEmbMeta(embPath).dim || 0;
}

/**
 * 按 merged 顺序写 .emb：优先用 chunk 上已挂的向量，否则按 id 从旧 .emb pread。
 * 末尾连续缺失的向量不写（JSON 可比 .emb 更长，检索侧 i >= count 视为无向量）。
 */
export function rewriteEmbById({
  oldEmbPath,
  newEmbPath,
  oldChunks,
  mergedChunks,
  attachedEmbeddings,
}) {
  const outPath = newEmbPath || oldEmbPath;
  const attached = attachedEmbeddings || mergedChunks.map((c) => (
    Array.isArray(c.embedding) && c.embedding.length > 0 ? c.embedding : null
  ));
  const dim = resolveDim(attached, oldEmbPath);
  if (!dim) return { written: 0, dim: 0 };

  const idToOld = new Map();
  for (let i = 0; i < (oldChunks || []).length; i++) {
    const id = oldChunks[i].metadata?.id;
    if (id) idToOld.set(id, i);
  }

  let oldFd = null;
  let oldCount = 0;
  let oldDim = dim;
  if (oldEmbPath && fs.existsSync(oldEmbPath)) {
    oldFd = fs.openSync(oldEmbPath, "r");
    const header = Buffer.alloc(EMB_HEADER_SIZE);
    fs.readSync(oldFd, header, 0, EMB_HEADER_SIZE, 0);
    oldDim = header.readUInt32LE(4) || dim;
    const size = fs.fstatSync(oldFd).size;
    oldCount = oldDim > 0 ? Math.floor((size - EMB_HEADER_SIZE) / (oldDim * 4)) : 0;
  }

  const hasVec = mergedChunks.map((c, i) => {
    if (attached[i] && attached[i].length === dim) return true;
    const oldi = idToOld.get(c.metadata?.id);
    return oldi != null && oldi < oldCount && oldDim === dim;
  });
  let lastPresent = -1;
  for (let i = 0; i < hasVec.length; i++) {
    if (hasVec[i]) lastPresent = i;
  }
  if (lastPresent < 0) {
    if (oldFd != null) fs.closeSync(oldFd);
    return { written: 0, dim };
  }

  const tmp = `${outPath}.tmp`;
  const outFd = fs.openSync(tmp, "w");
  try {
    const header = Buffer.alloc(EMB_HEADER_SIZE);
    header.writeUInt32LE(1, 0);
    header.writeUInt32LE(dim, 4);
    fs.writeSync(outFd, header);
    const vecBuf = Buffer.alloc(dim * 4);
    const zeroBuf = Buffer.alloc(dim * 4);
    for (let i = 0; i <= lastPresent; i++) {
      const att = attached[i];
      if (att && att.length === dim) {
        fs.writeSync(outFd, writeFloat32LE(att));
      } else {
        const oldi = idToOld.get(mergedChunks[i].metadata?.id);
        if (oldi != null && oldi < oldCount && oldDim === dim) {
          fs.readSync(oldFd, vecBuf, 0, dim * 4, EMB_HEADER_SIZE + oldi * dim * 4);
          fs.writeSync(outFd, vecBuf);
        } else {
          fs.writeSync(outFd, zeroBuf);
        }
      }
    }
  } finally {
    fs.closeSync(outFd);
    if (oldFd != null) fs.closeSync(oldFd);
  }
  fs.renameSync(tmp, outPath);
  return { written: lastPresent + 1, dim };
}

/**
 * 写出 index_<cat>.json，并按需保留/追加/重写 .emb。
 * skipEmbRewrite + 纯追加：不读不改旧 .emb（新 chunk 仅 BM25，直到 Stage 3）。
 * 禁止在「新 chunk 没有向量」时删除已有 .emb。
 *
 * @param {{
 *   indexPath: string,
 *   embPath: string,
 *   chunks: object[],
 *   previousChunks?: object[] | null,
 *   skipEmbRewrite?: boolean,
 * }} opts
 */
export function writeCategoryIndexFiles({
  indexPath,
  embPath,
  chunks,
  previousChunks = null,
  skipEmbRewrite = false,
}) {
  const { stripped, embeddings, dim: attachedDim } = stripEmbeddingsFromChunks(chunks || []);
  saveJSON(indexPath, stripped);

  if (stripped.length === 0) {
    if (embPath && fs.existsSync(embPath)) fs.unlinkSync(embPath);
    return { jsonPath: indexPath, embPath, chunkCount: 0, hasEmb: false, action: "empty" };
  }

  const oldExists = !!(embPath && fs.existsSync(embPath));
  const prefixAppend = previousChunks
    ? isPrefixPreservingAppend(previousChunks, stripped)
    : false;
  const newAttached = prefixAppend && previousChunks
    ? embeddings.slice(previousChunks.length)
    : [];
  const completeNew = newAttached.filter((e) => e && e.length > 0);
  const canAppendNew = prefixAppend && oldExists
    && newAttached.length > 0
    && completeNew.length === newAttached.length;

  if (canAppendNew) {
    const dim = attachedDim || completeNew[0].length;
    appendEmbeddings(embPath, completeNew, dim);
    return {
      jsonPath: indexPath,
      embPath,
      chunkCount: stripped.length,
      hasEmb: true,
      action: "append-emb",
    };
  }

  if (skipEmbRewrite && prefixAppend && oldExists) {
    return {
      jsonPath: indexPath,
      embPath,
      chunkCount: stripped.length,
      hasEmb: true,
      action: "preserve-emb",
    };
  }

  const hasAnyAttached = embeddings.some((e) => e && e.length > 0);

  if (!hasAnyAttached && !oldExists) {
    return {
      jsonPath: indexPath,
      embPath,
      chunkCount: stripped.length,
      hasEmb: false,
      action: "json-only",
    };
  }

  const result = rewriteEmbById({
    oldEmbPath: embPath,
    newEmbPath: embPath,
    oldChunks: previousChunks || stripped,
    mergedChunks: stripped,
    attachedEmbeddings: embeddings,
  });
  if (result.written === 0 && oldExists && skipEmbRewrite && prefixAppend) {
    return {
      jsonPath: indexPath,
      embPath,
      chunkCount: stripped.length,
      hasEmb: true,
      action: "preserve-emb",
    };
  }
  if (result.written === 0 && oldExists && !prefixAppend) {
    fs.unlinkSync(embPath);
    return {
      jsonPath: indexPath,
      embPath,
      chunkCount: stripped.length,
      hasEmb: false,
      action: "drop-stale-emb",
    };
  }
  return {
    jsonPath: indexPath,
    embPath,
    chunkCount: stripped.length,
    hasEmb: result.written > 0 || oldExists,
    action: result.written > 0 ? "rewrite-emb" : "json-only",
  };
}
