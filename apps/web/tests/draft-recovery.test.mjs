import test from 'node:test';
import assert from 'node:assert/strict';
import { draftExport, recoveryPrefix, recoveryRecord, parseRecovery } from '../src/lib/draft-recovery.mjs';
import { guideFor, workspaceGuides } from '../src/lib/workspace-guides.mjs';
const context = { userId: 1, projectId: 2, studio: 'story' };
test('recovery round trip retains destination baseline and text', () => {
  const record = recoveryRecord(context, { version: 4, data: { title: 'Draft' } });
  assert.deepEqual(parseRecovery(JSON.stringify(record), context), record);
  for (const changed of [{userId: 9}, {projectId: 9}, {studio: 'video'}]) {
    assert.equal(parseRecovery(JSON.stringify(record), {...context, ...changed}), null);
  }
  assert.notEqual(recoveryPrefix(1, 2, 'story'), recoveryPrefix(1, 2, 'video'));
});
test('damaged and unsupported recovery records are ignored', () => {
  const record = recoveryRecord(context, {version: 1, data: {title: 'A'}});
  for (const change of [{base_version: -1}, {recovery_version: 2}, {saved_at: 'bad'}, {data: []}]) {
    assert.equal(parseRecovery(JSON.stringify({...record, ...change}), context), null);
  }
  assert.equal(parseRecovery('{', context), null);
});
test('portable export contains no destination save version', () => {
  const doc = draftExport('story', 2, {title: 'A'}, '2026-11-01T00:00:00Z');
  assert.equal(doc.format_version, 1);
  assert.equal(doc.source_project_id, 2);
  assert.equal(doc.expected_version, undefined);
});
test('all fifteen help contexts contain concrete examples', () => {
  assert.equal(Object.keys(workspaceGuides).length, 15);
  for (const guide of Object.values(workspaceGuides)) {
    assert.ok(guide.title && guide.intro && guide.fields.length);
    for (const field of guide.fields) assert.ok(field.name && field.meaning && field.example);
  }
  assert.equal(guideFor('/projects/2/game/scene').id, 'scene');
  assert.equal(guideFor('/projects/2', '#project-images').id, 'images');
  assert.equal(guideFor('/projects/2/story/read').id, 'reader');
});
