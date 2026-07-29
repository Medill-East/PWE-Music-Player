import assert from "node:assert/strict";
import test from "node:test";

import * as catalogBuilder from "../scripts/build-catalog.mjs";
import {
  CURATED,
  buildTrackUrl,
  dedupeByWork,
  isAllowedItem,
  normalizeTitleKey,
  parseDuration,
  summarizeFacets,
} from "../scripts/build-catalog.mjs";

test("parseDuration accepts seconds and clock notation", () => {
  assert.equal(parseDuration("613.4"), 613);
  assert.equal(parseDuration("10:13"), 613);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("not-a-duration"), null);
});

test("isAllowedItem enforces licensing and source exclusions", () => {
  const allowed = {
    title: "Chopin Nocturnes",
    creator: "Community pianist",
    description: "Piano recordings",
    collection: ["opensource_audio"],
    licenseurl: "https://creativecommons.org/licenses/by/4.0/",
  };

  assert.equal(isAllowedItem(allowed), true);
  assert.equal(isAllowedItem({ ...allowed, licenseurl: "" }), false);
  assert.equal(isAllowedItem({ ...allowed, licenseurl: "https://example.com/license" }), false);
  assert.equal(isAllowedItem({ ...allowed, collection: ["librivoxaudio"] }), false);
  assert.equal(isAllowedItem({ ...allowed, creator: "Sony Classical" }), false);
});

test("commercial label filter matches whole words only", () => {
  const base = {
    creator: "OnClassical",
    description: "",
    collection: ["opensource_audio"],
    licenseurl: "https://creativecommons.org/licenses/by-nc-nd/3.0/",
  };

  // 回归：曾用子串匹配，"emi" 命中 pr-emi-eres / boh-emi-an，误杀正当曲目。
  assert.equal(isAllowedItem({ ...base, title: "R. Hahn - Premieres Valses" }), true);
  assert.equal(isAllowedItem({ ...base, title: "Bohemian Dances" }), true);
  assert.equal(isAllowedItem({ ...base, title: "A Chemistry of Sound" }), true);

  // 真厂牌仍要拒绝
  assert.equal(isAllowedItem({ ...base, title: "EMI Classics reissue" }), false);
  assert.equal(isAllowedItem({ ...base, title: "Deutsche Grammophon box set" }), false);
  assert.equal(isAllowedItem({ ...base, title: "Decca Records collection" }), false);
});

test("curated strategy does not reject a licensed item by identifier prefix", () => {
  const allowed = {
    title: "OnClassical",
    creator: "Classical guitarist",
    description: "Guitar recordings",
    collection: ["opensource_audio"],
    licenseurl: "https://creativecommons.org/licenses/by/4.0/",
  };

  assert.equal(isAllowedItem(allowed, "jamendo-170782"), true);
});

test("itemTracks keeps curated Unknown-composer files and applies item facets", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        metadata: {
          title: "Unidentified piano recording",
          creator: "Community performer",
          subject: "instrumental",
          collection: ["opensource_audio"],
          licenseurl: "https://creativecommons.org/licenses/by/4.0/",
        },
        files: [{
          name: "ambient-recording.mp3",
          title: "Ambient Recording",
          format: "VBR MP3",
          length: "120",
        }],
      };
    },
  });

  assert.deepEqual(await catalogBuilder.itemTracks([
    "community-recording",
    "solo",
    "guitar",
    false,
  ]), [{
    id: "community-recording/ambient-recording.mp3",
    title: "Ambient Recording",
    composer: "Unknown",
    url: "https://archive.org/download/community-recording/ambient-recording.mp3",
    duration: 120,
    source: "community-recording",
    sourceTitle: "Unidentified piano recording",
    license: "https://creativecommons.org/licenses/by/4.0/",
    kind: "solo",
    instrument: "guitar",
    historical: false,
  }]);
});

test("curated whitelist and facet summary reflect track tags", () => {
  // 只校验结构不变量，不写死条目数——曲库会持续扩充。
  const KINDS = new Set(["solo", "chamber", "orchestral"]);
  const INSTRUMENTS = new Set(["piano", "guitar", "strings", "orchestra"]);

  assert.ok(CURATED.length > 0, "白名单不能为空");
  const identifiers = CURATED.map(([identifier]) => identifier);
  assert.equal(new Set(identifiers).size, identifiers.length, "白名单不能有重复 identifier");

  for (const [identifier, kind, instrument, historical, fallbackComposer] of CURATED) {
    assert.ok(identifier && typeof identifier === "string", `identifier 无效: ${identifier}`);
    assert.ok(KINDS.has(kind), `${identifier} 的 kind 非法: ${kind}`);
    assert.ok(INSTRUMENTS.has(instrument), `${identifier} 的 instrument 非法: ${instrument}`);
    assert.equal(typeof historical, "boolean", `${identifier} 的 historical 必须是布尔值`);
    assert.ok(fallbackComposer && typeof fallbackComposer === "string",
      `${identifier} 缺少 fallbackComposer（否则会显示 Unknown）`);
  }

  assert.deepEqual(summarizeFacets([
    { kind: "solo", instrument: "piano", historical: false },
    { kind: "solo", instrument: "guitar", historical: true },
    { kind: "orchestral", instrument: "orchestra", historical: false },
  ]), {
    kind: { solo: 2, orchestral: 1 },
    instrument: { piano: 1, guitar: 1, orchestra: 1 },
    historical: { false: 2, true: 1 },
  });
});

test("buildTrackUrl encodes archive filenames", () => {
  assert.equal(
    buildTrackUrl("musopen-chopin", "Ballade no. 1 - Op. 23.mp3"),
    "https://archive.org/download/musopen-chopin/Ballade%20no.%201%20-%20Op.%2023.mp3",
  );
});

test("normalizeTitleKey treats punctuation variants of one work as equal", () => {
  const commaTitle = {
    composer: "Chopin",
    title: "Ballade no. 1, op. 23",
  };
  const dashTitle = {
    composer: "Chopin",
    title: "Ballade no. 1 - Op. 23",
  };

  assert.equal(normalizeTitleKey(commaTitle), normalizeTitleKey(dashTitle));
  assert.equal(dedupeByWork([commaTitle, dashTitle]).length, 1);
});

test("dedupeByWork keeps genuinely different works", () => {
  const firstBallade = {
    composer: "Chopin",
    title: "Ballade no. 1, op. 23",
  };
  const secondBallade = {
    composer: "Chopin",
    title: "Ballade no. 2, op. 38",
  };

  assert.equal(dedupeByWork([firstBallade, secondBallade]).length, 2);
});
