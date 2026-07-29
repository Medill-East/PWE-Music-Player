import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ARCHIVE_ORIGIN = "https://archive.org";
const TARGET_TRACKS = 500;
// 必须按词边界匹配，不能用子串包含。
// 踩过的坑："emi" 会命中曲名 "R. Hahn - Premieres Valses" 里的 pr-emi-eres，
// 把一张正经的 OnClassical 室内乐专辑当成 EMI 盗版拒掉（同理 Bohemian、chemistry）。
const COMMERCIAL_LABEL_PATTERN = new RegExp(
  "\\b(" + [
    "deutsche grammophon",
    "decca",
    "emi",
    "rca",
    "sony classical",
    "warner",
    "naxos",
    "philips",
    "columbia records",
  ].join("|") + ")\\b",
  "i",
);
const AUDIOBOOK_COLLECTIONS = ["librivoxaudio", "audio_bookspoetry"];
const COMPOSERS = [
  ["Chopin", /\bchopin\b/i],
  ["Debussy", /\bdebussy\b/i],
  ["Satie", /\bsatie\b/i],
  ["Grieg", /\bgrieg\b/i],
  ["Schumann", /\bschumann\b/i],
  ["Schubert", /\bschubert\b/i],
  ["Liszt", /\bliszt\b/i],
  ["Ravel", /\bravel\b/i],
  ["Fauré", /\b(?:faur[eé])\b/i],
  ["Bach", /\bbach\b/i],
  ["Mozart", /\bmozart\b/i],
  ["Beethoven", /\bbeethoven\b/i],
  ["Brahms", /\bbrahms\b/i],
  ["Mendelssohn", /\bmendelssohn\b/i],
  ["Tchaikovsky", /\b(?:tchaikovsky|chaikovsky)\b/i],
];

// 人工核验白名单。新增条目前必须逐项确认下面三条，否则不要加：
//
//  1) 看 subject / creator，别看 identifier 里的词。
//     踩过的坑：「Sacred Harp Singing」的 harp 指人声不是竖琴；
//     「The Infinite Lute Compilation」的 lute 是网络厂牌名，实际是冷波后朋。
//
//  2) 区分 CC0 与 PDM。
//     CC0 (publicdomain/zero) 是权利人主动放弃权利，可信；
//     PDM (publicdomain/mark) 只是上传者单方面主张「这已是公版」，谁都能贴。
//     踩过的坑：「Bruton Music - BRC 6 - 1979」是至今仍在运营的商业配乐库，
//     1979 年英国录音版权到 2049 年，却被贴了 PDM。已移除。
//     用 PDM 的条目必须另行查证其公版来源（如 Kimiko Ishizaka 的 Open WTC
//     有 2015 年新闻稿与 Kickstarter 记录佐证，可信）。
//
//  3) 确认体裁与乐器标注与实际内容相符，别只看曲目数和授权。
//
// identifier, kind, instrument, historical, fallbackComposer
export const CURATED = [
  ["musopen-chopin-complete-works-flac",           "solo",       "piano",     false, "Chopin"],
  ["musopen-chopin",                               "solo",       "piano",     false, "Chopin"],
  ["bach-well-tempered-clavier-book-1",            "solo",       "piano",     false, "Bach"],
  // 注意：不要加 "master-tracks-the-open-well-tempered-clavier"——
  // 那是原始多轨母带（单支话筒拾音，如 "Mic 06 (Neumann M50): Surround Right"），
  // 供录音工程用，不是给人听的成品混音。成品就是上面那条 bach-well-tempered-clavier-book-1。
  ["The_Open_Goldberg_Variations-11823",           "solo",       "piano",     false, "Bach"],
  //
  // 以下三项已移除，勿再加回：
  //
  // "CHOPINEtudes-Cortot-NEWTRANSFER"：描述自陈 "HMV 78rpm discs D.B.2027-2029,
  //   Recorded July 4, 5, 15, 1933" —— EMI/HMV 的商业录音。上传者贴的 CC BY-NC-SA
  //   无效（他不是权利人），美国 2033 年才进入公有领域。
  //
  // "GRIEGPeerGyntcomplete"：creator "Per Dreier / London Symphony Orchestra"，1978 年，
  //   附完整独唱歌手名单 —— 商业厂牌录音，英国版权到 2048 年。与 Bruton 同一模式。
  //
  // "Complete_Chopin_Nocturnes"：S D Rodrian 的 **MIDI 合成音频**，非真人演奏
  //   （其个人站 chopin.sdrodrian.com 声明「未经书面许可不得复制」，与此处的
  //   CC BY-NC-ND 标注矛盾）。质量与授权双重问题。
  ["jamendo-170782",                               "solo",       "guitar",    false, "Mark Bodino"],
  ["schumann-kinderszenen-op.-15",                 "solo",       "piano",     false, "Schumann"],
  // OnClassical：意大利 CC 古典厂牌，厂牌自己授权，录音为专业演奏
  ["jamendo-174987",                               "solo",       "piano",     false, "Beethoven"],
  ["jamendo-169927",                               "solo",       "piano",     false, "Various"],
  ["jamendo-166969",                               "chamber",    "strings",   false, "Various"],
  ["jamendo-167051",                               "chamber",    "strings",   false, "Various"],
  ["jamendo-167061",                               "chamber",    "strings",   false, "Various"],
  // Michał Jałochowski 自行释出的古典吉他作品集（只收第 2 版，第 1 版是同曲目重录，会造成重复）
  ["jamendo-455387",                               "solo",       "guitar",    false, "Michał Jałochowski"],

  // OnClassical 专辑集（厂牌自授权，演奏者均具名的专业录音）
  ["jamendo-175216",                               "solo",       "piano",     false, "Grieg"],
  ["jamendo-175047",                               "solo",       "piano",     false, "Chopin"],
  ["jamendo-175086",                               "solo",       "piano",     false, "Mozart"],
  ["jamendo-178400",                               "chamber",    "strings",   false, "Beethoven"],
  ["jamendo-175220",                               "solo",       "piano",     false, "Bach"],
  ["jamendo-175013",                               "solo",       "piano",     false, "Beethoven"],
  ["jamendo-174561",                               "solo",       "piano",     false, "Scott Joplin"],
  ["jamendo-140751",                               "solo",       "piano",     false, "Various"],
  ["jamendo-175204",                               "solo",       "piano",     false, "Bach"],
  ["jamendo-175593",                               "solo",       "piano",     false, "Beethoven"],
  ["jamendo-175231",                               "solo",       "piano",     false, "Chopin"],
  ["jamendo-187250",                               "solo",       "piano",     false, "Mussorgsky"],
  ["jamendo-169923",                               "solo",       "piano",     false, "Various"],
  ["jamendo-175339",                               "solo",       "piano",     false, "Debussy"],
  ["jamendo-199730",                               "solo",       "piano",     false, "Chopin"],
  ["jamendo-169916",                               "solo",       "piano",     false, "Satie"],
  ["jamendo-178145",                               "solo",       "piano",     false, "Chopin"],
  ["jamendo-178124",                               "solo",       "piano",     false, "Janáček"],
  // Satie: Vexations —— 曲内动机重复是作曲家的刻意设计，属作品本身。
  // 本播放器承诺的「不重复」指的是**曲目**不重复，与此不冲突。
  ["jamendo-169920",                               "solo",       "piano",     false, "Satie"],
];

function toText(value) {
  if (Array.isArray(value)) return value.map(toText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(toText).join(" ");
  return value == null ? "" : String(value);
}

// 有些厂牌（如 OnClassical）把曲名存成
// `{演奏者}_{专辑slug}_{序号}_{真实曲名}` 的下划线长串，直接显示极难读。
// 通用解法：同一专辑内所有曲名的最长公共前缀，就是演奏者+专辑名那段，剥掉即可。
// 不硬编码任何厂牌规则，对其他来源天然无副作用（它们的公共前缀本就为空）。
export function stripCommonPrefix(titles) {
  const usable = titles.filter((title) => title.length > 0);
  if (usable.length < 2) return titles;

  let prefix = usable[0];
  for (const title of usable.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < title.length && prefix[i] === title[i]) i += 1;
    prefix = prefix.slice(0, i);
    if (!prefix) return titles;
  }
  // 只在下划线/空格边界处截断，避免把半个单词吃掉
  const boundary = Math.max(prefix.lastIndexOf("_"), prefix.lastIndexOf(" "));
  if (boundary < 4) return titles;
  const cut = boundary + 1;

  // 剥完若普遍所剩无几，说明这批曲名本来就高度雷同，保持原样更安全
  const stripped = titles.map((title) => (title.startsWith(prefix.slice(0, cut)) ? title.slice(cut) : title));
  if (stripped.some((title) => title.trim().length < 4)) return titles;
  return stripped;
}

function getLicense(metadata) {
  const candidates = Array.isArray(metadata.licenseurl)
    ? metadata.licenseurl
    : [metadata.licenseurl];
  return candidates.map(toText).find((value) => {
    const normalized = value.toLowerCase();
    return normalized.includes("creativecommons.org") || normalized.includes("publicdomain");
  }) || "";
}

export function parseDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string" || !value.trim()) return null;

  const parts = value.trim().split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 1) return Math.round(parts[0]);
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return null;
}

export function isAllowedItem(metadata) {
  if (!getLicense(metadata)) return false;

  const collections = toText(metadata.collection).toLowerCase();
  if (AUDIOBOOK_COLLECTIONS.some((name) => collections.includes(name))) return false;

  const identity = toText([
    metadata.title,
    metadata.creator,
    metadata.description,
  ]);
  return !COMMERCIAL_LABEL_PATTERN.test(identity);
}

export function buildTrackUrl(identifier, filename) {
  return `${ARCHIVE_ORIGIN}/download/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
}

function inferComposer(...values) {
  const haystack = values.map(toText).join(" ");
  return COMPOSERS.find(([, pattern]) => pattern.test(haystack))?.[0] || "Unknown";
}

// 先看曲目自身能否识别出作曲家；识别不出就用白名单里人工核验过的署名。
export function resolveComposer(file, metadata, fallbackComposer) {
  const inferred = inferComposer(file.title, file.name, metadata.title, metadata.subject, metadata.creator);
  if (inferred !== "Unknown") return inferred;
  return fallbackComposer || "Unknown";
}

// "OnClassical - Classical Music - Debussy: (Complete) Preludes" → "Debussy: (Complete) Preludes"
function shortAlbum(sourceTitle) {
  const parts = String(sourceTitle).split(" - ");
  return (parts[parts.length - 1] || sourceTitle).trim();
}

// 同一专辑内的曲目按定义就是不同录音，绝不能因为清洗后曲名撞车而被后续去重吃掉。
// 例：贝多芬《「看啊，凯旋的英雄」主题 12 变奏》14 个乐章的元数据只靠开头序号区分，
// 剥掉序号后全部同名 —— 这里给它们补 "· No. N" 保持可区分。
export function disambiguate(titles) {
  const counts = new Map();
  for (const title of titles) counts.set(title, (counts.get(title) || 0) + 1);

  const running = new Map();
  return titles.map((title) => {
    if (counts.get(title) === 1) return title;
    const n = (running.get(title) || 0) + 1;
    running.set(title, n);
    return `${title} · No. ${n}`;
  });
}

function rawTitle(file) {
  return (toText(file.title).trim() || toText(file.name))
    .replace(/\.(mp3|m4a|flac|ogg|wav|aac|wma)$/i, "");   // 曲名里可能残留任意音频扩展名
}

export function cleanTitle(value, { fallback = "", index = 0 } = {}) {
  let text = String(value)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 剥完公共前缀后常残留「卷号 + 曲目序号」，如 "I 28 mazurka..." / "To 140 01 71"。
  // 规则：开头是纯数字就剥；是罗马数字或连接词时，只有当**后面紧跟数字**才剥
  // ——这样 "II. Andante" 这种合法乐章编号会被保留，不会被误伤成 "Andante"。
  let previous;
  do {
    previous = text;
    text = text
      .replace(/^\d+[\s.·:-]*/, "")
      .replace(/^(?:[ivxlcm]+|to)[\s.·:-]+(?=\d)/i, "")
      .trim();
  } while (text !== previous);

  // 有些来源的元数据里根本没有真实曲名，只有编号（如德彪西前奏曲剥完只剩 "I 01 1"）。
  // 这种情况退回「专辑名 · 第 N 首」，至少可读且能区分。
  const meaningless = !text || /^[\divxlcm\s.·:-]+$/i.test(text);
  if (meaningless) {
    return fallback ? `${fallback} · No. ${index + 1}` : `No. ${index + 1}`;
  }

  // 全小写的多为文件名转来的，首字母大写读起来正常些；已有大小写的保持原样。
  return text === text.toLowerCase() ? text.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : text;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "PWE-Music-Player catalog builder" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export async function itemTracks(curatedItem) {
  const [identifier, kind, instrument, historical, fallbackComposer] = curatedItem;
  const item = await fetchJson(`${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(identifier)}`);
  const metadata = item.metadata || {};
  if (!isAllowedItem(metadata)) return [];

  const license = getLicense(metadata);
  // 存下 item 的可读标题用于署名展示；没有就退回 identifier。
  const sourceTitle = toText(metadata.title).trim() || identifier;

  const usable = (item.files || []).filter((file) => {
    if (file.format !== "VBR MP3" || !file.name) return false;
    const duration = parseDuration(file.length);
    // 下限只用来掐掉片段/静音/报幕，不能定太高：
    // 古典曲目短的是常态（肖邦前奏曲、贝多芬变奏、萨蒂小品常在 40–60 秒），
    // 曾用 60 秒下限，把贝多芬那套 12 变奏里的 12 首全刷掉了。
    return duration !== null && duration >= 25 && duration <= 30 * 60;
  });
  // 先在整张专辑范围内剥掉公共前缀，再逐条清洗
  const titles = disambiguate(
    stripCommonPrefix(usable.map((file) => rawTitle(file)))
      .map((title, index) => cleanTitle(title, { fallback: shortAlbum(sourceTitle), index })),
  );

  return usable.flatMap((file, index) => {
    const duration = parseDuration(file.length);

    return [{
      id: `${identifier}/${file.name}`,
      title: titles[index],
      composer: resolveComposer(file, metadata, fallbackComposer),
      url: buildTrackUrl(identifier, file.name),
      duration,
      source: identifier,
      sourceTitle,
      license,
      kind,
      instrument,
      historical,
    }];
  });
}

function countBy(tracks, field) {
  return tracks.reduce((counts, track) => {
    const value = String(track[field]);
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

export function summarizeFacets(tracks) {
  return {
    kind: countBy(tracks, "kind"),
    instrument: countBy(tracks, "instrument"),
    historical: countBy(tracks, "historical"),
  };
}

// 同一首作品可能同时存在于两个合集（如 musopen 的两套肖邦），
// 文件 id 不同但听感上就是重复。按「作曲家 + 规范化曲名」再去重一次。
export function normalizeTitleKey(track) {
  const title = String(track.title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${String(track.composer).toLowerCase()}::${title}`;
}

export function dedupeByWork(tracks) {
  const seen = new Set();
  return tracks.filter((track) => {
    const key = normalizeTitleKey(track);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function buildCatalog() {
  const tracks = new Map();
  const batchSize = 4;

  for (let offset = 0; offset < CURATED.length; offset += batchSize) {
    const batch = CURATED.slice(offset, offset + batchSize);
    const results = await Promise.all(batch.map(async (curatedItem) => {
      try {
        return await itemTracks(curatedItem);
      } catch (error) {
        console.warn(`跳过 ${curatedItem[0]}：${error.message}`);
        return [];
      }
    }));

    for (const track of results.flat()) tracks.set(track.id, track);
    console.log(`已处理 ${Math.min(offset + batch.length, CURATED.length)}/${CURATED.length} 个白名单 item`);
  }

  const byId = [...tracks.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
  const sortedTracks = dedupeByWork(byId);
  const dropped = byId.length - sortedTracks.length;
  if (dropped > 0) console.log(`同作品去重：移除 ${dropped} 首重复曲目`);
  if (sortedTracks.length < TARGET_TRACKS) {
    console.warn(
      `警告：白名单过滤后仅 ${sortedTracks.length} 首，低于 ${TARGET_TRACKS} 首目标，但仍已写出 catalog.json`,
    );
  }

  const catalog = {
    generated: new Date().toISOString(),
    count: sortedTracks.length,
    facets: summarizeFacets(sortedTracks),
    tracks: sortedTracks,
  };
  await writeFile(new URL("../catalog.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`catalog.json 已生成：${catalog.count} 首`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  buildCatalog().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
