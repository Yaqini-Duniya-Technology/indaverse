import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStudio, wordCount, durationLabel, csv, shotTimeline } from '../src/lib/studio-insights.mjs';

test('word counts handle blank and Unicode text without claiming language segmentation', () => {
  assert.equal(wordCount('  '), 0);
  assert.equal(wordCount('Sannu  duniya\nZamara'), 3);
});
test('duration labels handle invalid input safely', () => {
  assert.equal(durationLabel(65), '1:05');
  assert.equal(durationLabel(-5), '0:00');
  assert.equal(durationLabel(NaN), '0:00');
});
test('CSV escapes quotes, newlines and spreadsheet formulas', () => {
  const result = csv([['=1+1', 'hello,"world"', 'a\nb', '@SUM(1)', ' -2']]);
  assert.match(result, /'\=1\+1/);
  assert.match(result, /hello,""world""/);
  assert.match(result, /'@SUM/);
  assert.match(result, /' -2/);
  assert.ok(result.endsWith('\r\n'));
});
test('shot timeline is cumulative and does not change source', () => {
  const shots = [{title:'One',duration_seconds:2.5},{title:'Two',duration_seconds:4}];
  const before = JSON.stringify(shots), rows = shotTimeline(shots);
  assert.equal(rows[1].start, 2.5); assert.equal(rows[1].end, 6.5);
  assert.equal(JSON.stringify(shots), before);
});
test('invalid shot durations are advisory and never make a negative timeline', () => {
  const analysis = analyzeStudio('video', {title:'Video',shots:[{title:'One',duration_seconds:-2}]});
  assert.ok(analysis.issues.some(x => x.includes('positive duration')));
  assert.equal(analysis.metrics.find(x => x.label === 'Planned runtime').value, '0:00');
});
test('music reports include all six sections and validate tempo', () => {
  const result = analyzeStudio('music', {title:'Faith',bpm:'500',lyrics_chorus:'Keep the faith'});
  assert.equal(result.entries.length, 6);
  assert.equal(result.metrics[0].value, '3');
  assert.ok(result.issues.some(x => x.includes('Tempo')));
  assert.match(result.report, /Keep the faith/);
});
test('story reading estimate is explicit and manuscript content stays text', () => {
  const result = analyzeStudio('story', {title:'Novel', chapters:[{title:'Start',content:'<script>alert(1)</script> a b'}]});
  assert.match(result.metrics[2].value, /200 words\/min/);
  assert.match(result.report, /<script>/);
  assert.equal(result.entries[0].title, 'Start');
});
test('story flags missing chapter content and title', () => {
  const result = analyzeStudio('story', {title:'Novel',chapters:[{title:'',content:''}]});
  assert.equal(result.issues.length, 2);
});
test('software checks home route, duplicate routes and priority totals', () => {
  const result = analyzeStudio('software', {title:'App',pages:[{name:'A',path:'/a',sections:[]},{name:'B',path:'/a',sections:[]}],features:[{title:'Login',priority:'must_have',description:'Access'}]});
  assert.ok(result.issues.some(x => x.includes('home route')));
  assert.ok(result.issues.some(x => x.includes('Duplicate route')));
  assert.equal(result.metrics[2].value, '1');
  assert.match(result.csv, /must_have/);
});
test('game checks remain design advice, not playability claims', () => {
  const result = analyzeStudio('game', {title:'Zamara',dimension:'3d',characters:[],levels:[{title:'Village',objective:''}],assets:[{title:'Kairo',kind:'model',description:'Original'}]});
  assert.ok(result.issues.some(x => x.includes('player characters')));
  assert.ok(result.issues.some(x => x.includes('objective')));
  assert.ok(result.issues.some(x => x.includes('controls')));
  assert.match(result.csv, /model/);
});
test('every studio tolerates an empty draft', () => {
  for (const kind of ['music','game','software','video','story']) {
    const result = analyzeStudio(kind, null);
    assert.equal(result.title, 'Untitled draft'); assert.ok(result.issues.length);
  }
});
