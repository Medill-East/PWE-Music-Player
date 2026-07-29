// 全量校验 catalog.json 里每一首曲目是否真的可播。
//
// 为什么不能只抽样：曲库按 item 组织，一个 item 出问题就是几十首一起坏，
// 随机抽 10 首很容易整批躲过去。这个脚本逐首检查。
//
// 为什么不能只看 HTTP 状态码：archive.org 可能返回 200 但内容是错误页，
// 所以还要校验返回的字节是不是 MP3（ID3 标签或 MPEG 帧同步字）。
//
// 为什么要重试：archive.org 的 /download/ 会重定向到具体存储节点，
// 个别节点有明显的瞬时失败率（实测同一 URL 连发 5 次会出现一次 500）。
// 不重试就会把正常曲目误判成死链。
//
// 用法：node scripts/check-catalog.mjs [--concurrency 6]

import { readFile } from "node:fs/promises";

const CONCURRENCY = Number(process.argv[process.argv.indexOf("--concurrency") + 1]) || 6;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 40_000;

function looksLikeMp3(bytes) {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;      // "ID3"
  return bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;                            // MPEG 帧同步
}

async function probe(track, attempt = 0) {
  const url = attempt > 0 ? `${track.url}?retry=${attempt}` : track.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Range: "bytes=0-2047", "User-Agent": "PWE-Music-Player catalog check" },
      signal: controller.signal,
    });
    if (response.ok || response.status === 206) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (looksLikeMp3(bytes)) return { ok: true };
      return retryOrFail(track, attempt, `${response.status} 但内容不是 MP3`);
    }
    return retryOrFail(track, attempt, String(response.status));
  } catch (error) {
    return retryOrFail(track, attempt, error.name === "AbortError" ? "超时" : error.message);
  } finally {
    clearTimeout(timer);
  }
}

function retryOrFail(track, attempt, reason) {
  if (attempt + 1 < MAX_ATTEMPTS) return probe(track, attempt + 1);
  return { ok: false, reason };
}

const catalog = JSON.parse(await readFile(new URL("../catalog.json", import.meta.url), "utf8"));
const tracks = catalog.tracks;
const failures = [];
let done = 0;

const queue = [...tracks];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const track = queue.pop();
    const result = await probe(track);
    done += 1;
    if (!result.ok) failures.push({ ...track, reason: result.reason });
    if (done % 150 === 0) console.log(`  已检查 ${done}/${tracks.length}，失败 ${failures.length}`);
  }
}));

console.log(`\n全量检查完成：${tracks.length} 首，失败 ${failures.length} 首`);

if (failures.length) {
  const bySource = new Map();
  for (const f of failures) bySource.set(f.source, (bySource.get(f.source) || 0) + 1);
  console.log("\n按来源分组：");
  for (const [source, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
    const total = tracks.filter((t) => t.source === source).length;
    console.log(`  ${n}/${total}  ${source}`);
  }
  console.log("\n明细（前 20 条）：");
  for (const f of failures.slice(0, 20)) console.log(`  [${f.reason}] ${f.title}`);
  process.exitCode = 1;
}
