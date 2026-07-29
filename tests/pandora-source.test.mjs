import assert from "node:assert/strict";
import test from "node:test";

import {
  durationFromMpegHeader,
  parseDirectoryLinks,
} from "../scripts/pandora-source.mjs";

test("durationFromMpegHeader skips ID3v2 and reads MPEG1 Layer III bitrate", () => {
  const buffer = Buffer.alloc(32);
  buffer.write("ID3", 0, "ascii");
  buffer[6] = 0;
  buffer[7] = 0;
  buffer[8] = 0;
  buffer[9] = 4;
  buffer.set([0xff, 0xfb, 0x90, 0x00], 14); // MPEG1 Layer III, 128 kbps

  assert.equal(durationFromMpegHeader(buffer, 1_600_000), 100);
});

test("durationFromMpegHeader rejects buffers without a valid MPEG frame", () => {
  assert.equal(durationFromMpegHeader(Buffer.alloc(32), 1_600_000), null);
});

test("parseDirectoryLinks accepts uppercase tags and skips parent symlinks", () => {
  const html = [
    '<A HREF="piece_one.mp3">piece one</A>',
    '<a href="subdir/index.html">subdir</a>',
    '<A HREF="../historical_instruments/duplicate.mp3">duplicate</A>',
    '<A HREF="notes.txt">notes</A>',
  ].join("\n");

  assert.deepEqual(parseDirectoryLinks(html), {
    audio: ["piece_one.mp3"],
    directories: ["subdir/index.html"],
  });
});
