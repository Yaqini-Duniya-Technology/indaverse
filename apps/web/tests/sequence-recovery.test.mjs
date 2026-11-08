import test from "node:test";
import assert from "node:assert/strict";
import { encodeSequenceRecovery, parseSequenceRecovery, recoveryIssue, sequenceRecoveryPrefix } from "../src/lib/sequence-recovery.mjs";

const source = "b".repeat(32);
const data = {
  clips: [{source_id: source, start_ms: NaN, end_ms: 1000, caption_cues: [{start_ms: 0, end_ms: NaN, text: "Draft"}]}],
  soundtrackSettings: {start_ms: 0, end_ms: 1000, offset_ms: 0, volume_percent: 40, fade_in_ms: 0, fade_out_ms: 0, mode: "mix"},
};

test("unfinished edits round-trip and are scoped to one account and project", () => {
  const raw = encodeSequenceRecovery(1, 2, 7, data);
  const record = parseSequenceRecovery(raw, 1, 2);
  assert.deepEqual(record.data, data);
  assert.equal(record.base_version, 7);
  assert.equal(parseSequenceRecovery(raw, 2, 2), null);
  assert.equal(parseSequenceRecovery(raw, 1, 3), null);
  assert.notEqual(sequenceRecoveryPrefix(1, 2), sequenceRecoveryPrefix(2, 2));
});

test("reject malformed drafts and block valid drafts when their base or media differs", () => {
  assert.equal(parseSequenceRecovery("malformed", 1, 2), null);
  const invalid = encodeSequenceRecovery(1, 2, 7, {clips: [{source_id: source, start_ms: "0", end_ms: 1000}]});
  assert.equal(parseSequenceRecovery(invalid, 1, 2), null);
  const raw = encodeSequenceRecovery(1, 2, 7, data);
  const record = parseSequenceRecovery(raw, 1, 2);
  const latest = {version: 7, sources: [{id: source}], soundtrack: {}};
  assert.equal(recoveryIssue(record, latest), "");
  assert.match(recoveryIssue(record, {...latest, version: 8}), /saved sequence is version 8/);
  assert.match(recoveryIssue(record, {...latest, sources: []}), /media/);
  assert.match(recoveryIssue(record, {...latest, soundtrack: null}), /media/);
});
