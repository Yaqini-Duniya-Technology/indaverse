import assert from "node:assert/strict";
import test from "node:test";
import {parseSrt} from "../src/lib/video-captions.mjs";

test("import timed multiline captions and sort them without interpreting tags", () => {
  const raw = "\uFEFF2\r\n00:00:01,100 --> 00:00:01,450\r\n&lt;word&gt;\r\n\r\n" +
    "1\r\n00:00:00,000 --> 00:00:00,950\r\nFirst &amp; second\r\nTwo lines\r\n";
  assert.deepEqual(parseSrt(raw, 1500), [
    {start_ms: 0, end_ms: 950, text: "First & second\nTwo lines", position: "bottom"},
    {start_ms: 1100, end_ms: 1450, text: "<word>", position: "bottom"},
  ]);
});

test("refuse malformed timing, overlapping cues, and cues beyond a trimmed cut", () => {
  const one = "1\n00:00:00,000 --> 00:00:00,800\nFirst";
  assert.throws(() => parseSrt(one, 700), /fit inside/);
  assert.throws(() => parseSrt(one + "\n\n2\n00:00:00,700 --> 00:00:01,000\nOverlap", 1500), /cannot overlap/);
  assert.throws(() => parseSrt(one.replace(",800", ".800"), 1000), /timestamps/);
});

test("whole-sequence import splits a cue and maps times relative to each cut", async () => {
  const {mapSequenceSrt} = await import("../src/lib/video-captions.mjs");
  const srt = "1\n00:00:00,600 --> 00:00:01,400\nAcross the cut";
  const groups = mapSequenceSrt(srt, [1000, 1200]);
  assert.deepEqual(groups.map(group => group.map(cue => [cue.start_ms, cue.end_ms])), [[[600, 1000]], [[0, 400]]]);
  assert.throws(() => mapSequenceSrt(srt, [1301, 1000]), /fit inside/);
});
