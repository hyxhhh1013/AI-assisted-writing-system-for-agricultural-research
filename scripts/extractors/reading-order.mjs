/**
 * 影子阅读顺序：先切横带，再在带内按 x 空隙分栏。
 * 不删页眉页脚。跨栏空隙的片段标 crossColumn，正文不得写入。
 */

const Y_TOL = 3;
const FULL_WIDTH_RATIO = 0.62;

function boxesOf(items) {
  const boxes = [];
  for (const item of items || []) {
    const str = typeof item?.str === "string" ? item.str.trim() : "";
    if (!str) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    const width =
      typeof item.width === "number" && item.width > 0
        ? item.width
        : Math.max(4, str.length * 4);
    boxes.push({ str, x, y, width, right: x + width });
  }
  return boxes;
}

function groupRawLines(boxes) {
  const sorted = [...boxes].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const box of sorted) {
    const last = lines[lines.length - 1];
    if (!last || Math.abs(last.y - box.y) > Y_TOL) {
      lines.push({ y: box.y, boxes: [box] });
    } else {
      last.boxes.push(box);
    }
  }
  for (const line of lines) line.boxes.sort((a, b) => a.x - b.x);
  return lines;
}

function pageGeom(boxes) {
  if (boxes.length === 0) return { minX: 0, maxR: 1, width: 1 };
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxR = Math.max(...boxes.map((b) => b.right));
  return { minX, maxR, width: Math.max(1, maxR - minX) };
}

function splitSegments(lineBoxes, pageW) {
  if (lineBoxes.length === 0) return [];
  const gapMin = Math.max(18, pageW * 0.08);
  const segs = [];
  let cur = [lineBoxes[0]];
  for (let i = 1; i < lineBoxes.length; i++) {
    const gap = lineBoxes[i].x - lineBoxes[i - 1].right;
    if (gap >= gapMin) {
      segs.push(cur);
      cur = [lineBoxes[i]];
    } else {
      cur.push(lineBoxes[i]);
    }
  }
  segs.push(cur);
  return segs;
}

function segSpan(seg) {
  return {
    left: seg[0].x,
    right: seg[seg.length - 1].right,
    text: seg
      .map((b) => b.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function isFullWidth(seg, geom) {
  const span = segSpan(seg);
  const wide = span.right - span.left >= geom.width * FULL_WIDTH_RATIO;
  const reachLeft = span.left - geom.minX <= geom.width * 0.12;
  const reachRight = geom.maxR - span.right <= geom.width * 0.12;
  return wide && reachLeft && reachRight;
}

function finish(lines) {
  const bodyText = lines
    .filter((line) => !line.crossColumn && line.text)
    .map((line) => line.text)
    .join("\n");
  return { lines, bodyText };
}

/**
 * @param {Array<{ str: string, transform?: number[], width?: number }>} items
 */
export function orderPage(items) {
  const boxes = boxesOf(items);
  const geom = pageGeom(boxes);
  const described = groupRawLines(boxes).map((line) => {
    const segs = splitSegments(line.boxes, geom.width);
    return {
      y: line.y,
      segs,
      full: segs.length === 1 && isFullWidth(segs[0], geom),
    };
  });

  const multi = described.filter((line) => line.segs.length >= 2);
  if (multi.length === 0) {
    return finish(
      described
        .filter((line) => line.segs.length === 1)
        .map((line) => ({
          text: segSpan(line.segs[0]).text,
          y: line.y,
          column: 0,
          crossColumn: false,
        })),
    );
  }

  const mids = [];
  const centers = [];
  for (const line of multi) {
    for (let i = 0; i < line.segs.length; i++) {
      const span = segSpan(line.segs[i]);
      const center = (span.left + span.right) / 2;
      if (!centers.some((x) => Math.abs(x - center) < geom.width * 0.18)) {
        centers.push(center);
      }
      if (i < line.segs.length - 1) {
        const next = segSpan(line.segs[i + 1]);
        const mid = (span.right + next.left) / 2;
        if (!mids.some((x) => Math.abs(x - mid) < geom.width * 0.08)) mids.push(mid);
      }
    }
  }
  centers.sort((a, b) => a - b);

  const columnOf = (seg) => {
    const span = segSpan(seg);
    const center = (span.left + span.right) / 2;
    let best = 0;
    let bestD = Infinity;
    centers.forEach((columnCenter, index) => {
      const distance = Math.abs(columnCenter - center);
      if (distance < bestD) {
        bestD = distance;
        best = index;
      }
    });
    return best;
  };

  const crossesGutter = (seg) => {
    const span = segSpan(seg);
    return mids.some((mid) => span.left < mid - 6 && span.right > mid + 6);
  };

  const bands = [];
  let index = 0;
  while (index < described.length) {
    const full = described[index].full;
    const group = [];
    while (index < described.length && described[index].full === full) {
      group.push(described[index]);
      index += 1;
    }
    bands.push({ type: full ? "full" : "columns", lines: group });
  }

  const output = [];
  for (const band of bands) {
    if (band.type === "full") {
      for (const line of band.lines) {
        output.push({
          text: segSpan(line.segs[0]).text,
          y: line.y,
          column: null,
          crossColumn: false,
        });
      }
      continue;
    }
    const buckets = centers.map(() => []);
    for (const line of band.lines) {
      for (const seg of line.segs) {
        const span = segSpan(seg);
        buckets[columnOf(seg)].push({
          text: span.text,
          y: line.y,
          column: columnOf(seg),
          crossColumn: crossesGutter(seg),
        });
      }
    }
    for (const bucket of buckets) output.push(...bucket);
  }
  return finish(output);
}

/**
 * 有跨栏片段时保留旧正文，不把新错句写入影子。
 */
export function shadowPageFromItems(items, oldText) {
  const ordered = orderPage(items);
  const crossColumn = ordered.lines.filter((line) => line.crossColumn).length;
  if (crossColumn > 0) {
    return {
      text: oldText ?? "",
      keptOld: true,
      crossColumn,
      lines: ordered.lines,
    };
  }
  return {
    text: ordered.bodyText,
    keptOld: false,
    crossColumn: 0,
    lines: ordered.lines,
  };
}

export function normalizeMarginKey(text) {
  return String(text || "")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function marginZone(y, minY, maxY) {
  const span = Math.max(1, maxY - minY);
  const band = Math.max(24, span * 0.12);
  if (y >= maxY - band) return "top";
  if (y <= minY + band) return "bottom";
  return "body";
}

/**
 * 只删页面最上、最下一带里，去掉数字后仍在至少 3 页重复的行。
 * @param {{ lines: { text: string, y: number }[] }[]} pages
 */
export function stripRepeatedMarginLines(pages) {
  const zoned = (pages || []).map((page) => {
    const ys = (page.lines || []).map((line) => line.y);
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;
    return (page.lines || []).map((line) => ({
      ...line,
      zone: marginZone(line.y, minY, maxY),
    }));
  });

  const counts = new Map();
  for (const lines of zoned) {
    const seen = new Set();
    for (const line of lines) {
      if (line.zone === "body") continue;
      const key = `${line.zone}\0${normalizeMarginKey(line.text)}`;
      if (!normalizeMarginKey(line.text) || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return zoned.map((lines) => ({
    lines: lines
      .filter((line) => {
        if (line.zone === "body") return true;
        const key = `${line.zone}\0${normalizeMarginKey(line.text)}`;
        return (counts.get(key) || 0) < 3;
      })
      .map(({ text, y }) => ({ text, y })),
  }));
}
