import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseNextTrack,
  defaultFilters,
  getPoolStatus,
  matchesFilter,
  canControlVolume,
  trackSourceUrl,
} from "../app.js";
import { getLicenseLabel } from "../license.js";

const tracks = Array.from({ length: 60 }, (_, index) => ({
  id: `source/track-${index}.mp3`,
  kind: "solo",
  instrument: "piano",
  historical: false,
}));

const soloPianoFilters = {
  kinds: new Set(["solo"]),
  instruments: new Set(["piano"]),
  includeHistorical: false,
};

test("choosing 50 tracks never repeats a heard track", () => {
  const heard = new Set();

  for (let index = 0; index < 50; index += 1) {
    const track = chooseNextTrack(tracks, heard, new Set(), () => 0);
    assert.ok(track);
    assert.equal(heard.has(track.id), false);
    heard.add(track.id);
  }

  assert.equal(heard.size, 50);
});

test("bad tracks are excluded and an exhausted pool returns null", () => {
  const heard = new Set(tracks.slice(0, 59).map((track) => track.id));
  const bad = new Set([tracks[59].id]);

  assert.equal(chooseNextTrack(tracks, heard, bad), null);
});

test("solo-only filters exclude orchestral tracks", () => {
  assert.equal(matchesFilter(tracks[0], soloPianoFilters), true);
  assert.equal(matchesFilter({
    ...tracks[0],
    kind: "orchestral",
    instrument: "orchestra",
  }, soloPianoFilters), false);
});

test("historical recordings are excluded unless enabled", () => {
  const historicalTrack = { ...tracks[0], historical: true };

  assert.equal(matchesFilter(historicalTrack, soloPianoFilters), false);
  assert.equal(matchesFilter(historicalTrack, {
    ...soloPianoFilters,
    includeHistorical: true,
  }), true);
});

test("multiple selected instruments use union semantics", () => {
  const filters = {
    ...soloPianoFilters,
    instruments: new Set(["piano", "guitar"]),
  };

  assert.equal(matchesFilter({ ...tracks[0], instrument: "piano" }, filters), true);
  assert.equal(matchesFilter({ ...tracks[0], instrument: "guitar" }, filters), true);
  assert.equal(matchesFilter({ ...tracks[0], instrument: "lute" }, filters), false);
});

test("next-track candidates are filtered before played and bad exclusions", () => {
  const candidates = [
    { ...tracks[0], id: "orchestra", kind: "orchestral", instrument: "orchestra" },
    { ...tracks[0], id: "heard" },
    { ...tracks[0], id: "guitar", instrument: "guitar" },
  ];

  assert.equal(
    chooseNextTrack(candidates, new Set(["heard"]), new Set(), () => 0, soloPianoFilters),
    null,
  );
});

test("an empty filtered set is distinct from an exhausted matching set", () => {
  const orchestralOnly = [{
    ...tracks[0],
    id: "orchestra",
    kind: "orchestral",
    instrument: "orchestra",
  }];

  assert.equal(getPoolStatus(orchestralOnly, new Set(), new Set(), soloPianoFilters), "filtered-empty");
  assert.equal(getPoolStatus(tracks.slice(0, 1), new Set([tracks[0].id]), new Set(), soloPianoFilters), "exhausted");
});

test("default filters include solo and chamber but exclude orchestral", () => {
  assert.deepEqual([...defaultFilters().kinds], ["solo", "chamber"]);
});

test("license URLs are reduced to readable attribution labels", () => {
  assert.equal(
    getLicenseLabel("https://creativecommons.org/publicdomain/zero/1.0/"),
    "CC0",
  );
  assert.equal(
    getLicenseLabel("https://creativecommons.org/licenses/by/4.0/"),
    "CC BY",
  );
  assert.equal(
    getLicenseLabel("https://creativecommons.org/licenses/by-nc-nd/3.0/"),
    "CC BY-NC-ND",
  );
  assert.equal(
    getLicenseLabel("https://www.eff.org/pages/open-audio-license"),
    "EFF Open Audio License",
  );
});

test("canControlVolume detects read-only volume without clobbering it", () => {
  // iOS Safari 的 volume 是只读的：赋值不报错，只是静默无效。
  // 只能写入后读回来判断，不能靠 UA 嗅探。
  const writable = { volume: 0.78 };
  assert.equal(canControlVolume(writable), true);
  assert.equal(writable.volume, 0.78, "探测不能改变原有音量");

  const readOnly = { _v: 1, get volume() { return this._v; }, set volume(_x) {} };
  assert.equal(canControlVolume(readOnly), false);

  const throws = { get volume() { throw new Error("unavailable"); } };
  assert.equal(canControlVolume(throws), false, "取值抛异常时要安全地判为不支持");
});

test("trackSourceUrl points each source at its own host", () => {
  assert.equal(
    trackSourceUrl({ source: "musopen-chopin" }),
    "https://archive.org/details/musopen-chopin",
  );
  // 第二个源不能拼成 archive.org 链接，否则得到 404
  assert.equal(
    trackSourceUrl({ source: "pandora/historical_instruments/Flemish_harpsichord" }),
    "https://www.ibiblio.org/pandora/mp3/historical_instruments/Flemish_harpsichord/",
  );
});
