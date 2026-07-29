const PANDORA_ORIGIN = "https://www.ibiblio.org/pandora/mp3/";
const PANDORA_LICENSE = "https://www.eff.org/pages/open-audio-license";
const BITRATES_MPEG1_LAYER3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MAX_CONCURRENCY = 6;

export const PANDORA = [
  ["historical_instruments/Chopin_etudes",       "solo",    "piano",       "Chopin"],
  ["historical_instruments/Chopin_Liszt",        "solo",    "piano",       "Chopin"],
  ["historical_instruments/Flemish_harpsichord", "solo",    "harpsichord", "Various"],
  ["historical_instruments/Italian_harpsichord", "solo",    "harpsichord", "Various"],
  ["historical_instruments/Revival_harpsichord", "solo",    "harpsichord", "Various"],
  ["historical_instruments/keyboard_lute",       "solo",    "harpsichord", "Various"],
  ["historical_instruments/Bach_traverso",       "chamber", "wind",        "Bach"],
  ["historical_instruments/traverso",            "chamber", "wind",        "Various"],
  ["historical_instruments/Baset_horn",          "chamber", "wind",        "Beethoven"],
  ["historical_instruments/Schubert_Octet",      "chamber", "strings",     "Schubert"],
  ["piano",                                      "solo",    "piano",       "Various"],
  ["2_pianos",                                   "solo",    "piano",       "Various"],
  ["organ",                                      "solo",    "organ",       "Various"],
  ["chamber_orchestra",                          "chamber", "strings",     "Various"],
  ["strings",                                    "chamber", "strings",     "Various"],
  ["violin",                                     "chamber", "strings",     "Various"],
  ["viola",                                      "chamber", "strings",     "Various"],
  ["cello",                                      "chamber", "strings",     "Various"],
  ["flute",                                      "chamber", "wind",        "Various"],
  ["Galway",                                     "chamber", "wind",        "Various"],
  ["bassoon",                                    "chamber", "wind",        "Various"],
  ["oboe",                                       "chamber", "wind",        "Various"],
  ["horn",                                       "chamber", "wind",        "Various"],
  ["trombone",                                   "chamber", "wind",        "Various"],
  ["wind_quintet",                               "chamber", "wind",        "Various"],
];

export function parseDirectoryLinks(html) {
  const audio = [];
  const directories = [];
  const pattern = /<A HREF="([^"]+)"/gi;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith("..")) continue;
    if (/\.mp3$/i.test(href)) audio.push(href);
    else if (/\/index\.html$/i.test(href)) directories.push(href);
  }

  return { audio, directories };
}

export function durationFromMpegHeader(data, contentLength) {
  if (!Number.isFinite(contentLength) || contentLength <= 0 || data.length < 4) return null;

  let frameStart = 0;
  if (data.length >= 10 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    const tagLength = ((data[6] & 0x7f) << 21)
      | ((data[7] & 0x7f) << 14)
      | ((data[8] & 0x7f) << 7)
      | (data[9] & 0x7f);
    frameStart = 10 + tagLength;
  }

  for (let index = frameStart; index + 3 < data.length; index += 1) {
    if (data[index] !== 0xff || (data[index + 1] & 0xe0) !== 0xe0) continue;
    const version = (data[index + 1] >> 3) & 3;
    const layer = (data[index + 1] >> 1) & 3;
    if (version !== 3 || layer !== 1) continue;

    const bitrate = BITRATES_MPEG1_LAYER3[(data[index + 2] >> 4) & 0xf];
    if (!bitrate) continue;
    return Math.round((contentLength * 8) / (bitrate * 1000));
  }

  return null;
}

async function fetchWithRetry(fetchImpl, url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetchImpl(url, {
        ...options,
        headers: {
          "User-Agent": "PWE-Music-Player catalog builder",
          ...options.headers,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function relativePath(url) {
  const prefix = new URL(PANDORA_ORIGIN).pathname;
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

async function crawlDirectory(fetchImpl, directory, depth, discovered) {
  const indexUrl = new URL(`${directory.replace(/\/$/, "")}/index.html`, PANDORA_ORIGIN);
  const response = await fetchWithRetry(fetchImpl, indexUrl);
  const { audio, directories } = parseDirectoryLinks(await response.text());

  for (const href of audio) {
    const url = new URL(href, indexUrl);
    if (url.origin === new URL(PANDORA_ORIGIN).origin) discovered.set(url.href, url);
  }
  if (depth >= 2) return;

  for (const href of directories) {
    const childIndex = new URL(href, indexUrl);
    const childDirectory = relativePath(childIndex).replace(/\/index\.html$/i, "");
    await crawlDirectory(fetchImpl, childDirectory, depth + 1, discovered);
  }
}

export async function fetchPandoraDuration(url, fetchImpl = fetch) {
  const head = await fetchWithRetry(fetchImpl, url, { method: "HEAD" });
  const contentLength = Number(head.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) return null;

  const prefix = await fetchWithRetry(fetchImpl, url, {
    headers: { Range: "bytes=0-8191" },
  });
  const data = new Uint8Array(await prefix.arrayBuffer());
  return durationFromMpegHeader(data, contentLength);
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function pandoraTracks({ cleanTitle, resolveComposer, fetchImpl = fetch } = {}) {
  if (typeof cleanTitle !== "function" || typeof resolveComposer !== "function") {
    throw new TypeError("pandoraTracks requires cleanTitle and resolveComposer helpers");
  }

  const discovered = new Map();
  for (const source of PANDORA) {
    const [directory, kind, instrument, fallbackComposer] = source;
    const files = new Map();
    try {
      await crawlDirectory(fetchImpl, directory, 0, files);
    } catch (error) {
      console.warn(`跳过 Pandora 目录 ${directory}：${error.message}`);
      continue;
    }
    for (const [href, url] of files) {
      if (!discovered.has(href)) discovered.set(href, { url, kind, instrument, fallbackComposer });
    }
  }

  let durationFailures = 0;
  let durationFiltered = 0;
  const entries = [...discovered.values()];
  const tracks = await mapWithConcurrency(entries, MAX_CONCURRENCY, async (entry) => {
    const path = relativePath(entry.url);
    let duration;
    try {
      duration = await fetchPandoraDuration(entry.url, fetchImpl);
    } catch (error) {
      console.warn(`跳过 Pandora 文件 ${path}：${error.message}`);
      durationFailures += 1;
      return null;
    }
    if (duration === null) {
      durationFailures += 1;
      return null;
    }
    if (duration < 25 || duration > 30 * 60) {
      durationFiltered += 1;
      return null;
    }

    const filename = path.split("/").pop();
    const directory = path.slice(0, -(filename.length + 1));
    const rawTitle = filename.replace(/\.mp3$/i, "");
    return {
      id: `pandora/${path}`,
      title: cleanTitle(rawTitle),
      composer: resolveComposer(
        { name: filename, title: rawTitle },
        // Pandora 的目录名里常带作曲家（piano/Goldstein/Brahms_Walzes），一并交给识别
        { title: entry.directory },
        entry.fallbackComposer,
      ),
      url: entry.url.href,
      duration,
      source: `pandora/${directory}`,
      sourceTitle: `Pandora Records — ${directory.split("/").pop().replace(/_/g, " ")}`,
      license: PANDORA_LICENSE,
      kind: entry.kind,
      instrument: entry.instrument,
      historical: false,
    };
  });

  const accepted = tracks.filter(Boolean);
  console.log(
    `Pandora：发现 ${entries.length} 个 MP3，收录 ${accepted.length} 首，`
      + `时长解析失败 ${durationFailures} 首，时长过滤 ${durationFiltered} 首`,
  );
  return accepted;
}
