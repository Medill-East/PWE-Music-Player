import assert from "node:assert/strict";
import test from "node:test";

import { en, zh } from "../i18n.js";

test("Chinese and English dictionaries expose identical keys", () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});
