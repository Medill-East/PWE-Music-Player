import { readFile, writeFile } from "node:fs/promises";

import { getLicenseLabel } from "../license.js";

const ARCHIVE_ORIGIN = "https://archive.org";
const PANDORA_ORIGIN = "https://www.ibiblio.org/pandora/mp3/";

function toText(value) {
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return Object.values(value).map(toText).filter(Boolean).join(", ");
  return value == null ? "" : String(value).trim();
}

function escapeMarkdown(value) {
  return String(value).replace(/([\\`*_[\]])/g, "\\$1");
}

async function getItemMetadata(identifier) {
  const response = await fetch(`${ARCHIVE_ORIGIN}/metadata/${encodeURIComponent(identifier)}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()).metadata || {};
}

function summarizeSources(tracks) {
  const sources = new Map();
  for (const track of tracks) {
    const summary = sources.get(track.source) || {
      identifier: track.source,
      sourceTitle: track.sourceTitle,
      count: 0,
      licenses: new Set(),
    };
    summary.count += 1;
    summary.licenses.add(track.license);
    sources.set(track.source, summary);
  }
  return [...sources.values()].sort((a, b) => a.identifier.localeCompare(b.identifier, "en"));
}

async function buildCredits() {
  const catalog = JSON.parse(await readFile(new URL("../catalog.json", import.meta.url), "utf8"));
  const sources = summarizeSources(catalog.tracks || []);
  const entries = await Promise.all(sources.map(async (source) => {
    if (source.identifier.startsWith("pandora/")) {
      return { ...source, metadata: { title: source.sourceTitle, creator: "Pandora Records" }, pandora: true };
    }
    try {
      return { ...source, metadata: await getItemMetadata(source.identifier) };
    } catch (error) {
      console.warn(`无法读取 ${source.identifier} 的元数据：${error.message}`);
      return { ...source, metadata: {}, metadataError: true };
    }
  }));

  const lines = [
    "# 音乐来源与授权 / Music Credits",
    "",
    `本文件由 \`node scripts/build-credits.mjs\` 根据 \`catalog.json\` 自动生成。当前曲库包含 ${catalog.count} 首曲目，来自 ${entries.length} 个来源。`,
    "",
    "This file is generated from `catalog.json` by `node scripts/build-credits.mjs`. The current catalog contains "
      + `${catalog.count} tracks from ${entries.length} sources.`,
    "",
  ];

  for (const entry of entries) {
    const metadata = entry.metadata;
    const title = toText(metadata.title) || entry.identifier;
    const attribution = toText(metadata.creator) || toText(metadata.uploader)
      || (entry.metadataError ? "元数据暂时无法读取 / Metadata unavailable" : "未标注 / Not specified");
    const licenses = [...entry.licenses].map((url) => {
      const label = getLicenseLabel(url);
      return `[${escapeMarkdown(label)}](${url})`;
    }).join("、");

    const sourceLink = entry.pandora
      ? `- Pandora Records：<${new URL(`${entry.identifier.slice("pandora/".length)}/`, PANDORA_ORIGIN).href}>`
      : `- Internet Archive：<https://archive.org/details/${encodeURIComponent(entry.identifier)}>`;

    lines.push(
      `## ${escapeMarkdown(title)}`,
      "",
      sourceLink,
      `- 演奏者/上传者 / Performer or uploader：${escapeMarkdown(attribution)}`,
      `- 授权 / License：${licenses}`,
      `- 曲目数 / Tracks：${entry.count}`,
      "",
    );
  }

  await writeFile(new URL("../CREDITS.md", import.meta.url), `${lines.join("\n")}\n`);
  console.log(`CREDITS.md 已生成：${entries.length} 个来源，${catalog.count} 首曲目`);
}

buildCredits().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
