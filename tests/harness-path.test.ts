import assert from "node:assert/strict";
import test from "node:test";
import { cdCommand, cleanPath, HARNESS_APP_ID } from "../src/lib/harness-path";

test("harness app id is the app's path under weng", () => {
  assert.equal(HARNESS_APP_ID, "app/taxes");
});

test("cleanPath trims and strips surrounding quotes", () => {
  assert.equal(cleanPath('  "/Users/me/My Apps/taxes"  '), "/Users/me/My Apps/taxes");
  assert.equal(cleanPath("'/a/b'"), "/a/b");
  assert.equal(cleanPath(""), "");
});

test("cdCommand quotes paths safely", () => {
  assert.equal(cdCommand(""), "");
  assert.equal(cdCommand("/Users/me/My Apps/taxes"), 'cd "/Users/me/My Apps/taxes"');
  assert.equal(cdCommand('/a/$HOME "x"/`y`\\z'), 'cd "/a/\\$HOME \\"x\\"/\\`y\\`\\\\z"');
  assert.equal(cdCommand("~/dev/taxes"), 'cd ~/"dev/taxes"');
  assert.equal(cdCommand("~"), "cd ~");
  assert.equal(cdCommand("/a/Hi! it's/taxes"), "cd '/a/Hi! it'\\''s/taxes'");
  assert.equal(cdCommand("C:\\Users\\me\\taxes"), 'cd /d "C:\\Users\\me\\taxes"');
});
