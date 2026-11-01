import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_GENRES, musicTiming, repeatedLines, chapterPlan, routeAudit, productionRows } from '../src/lib/production-tools.mjs';
test('music calculator uses bars beats and BPM with bounded inputs', () => {
  assert.equal(musicTiming(120, 8, 4).seconds, 16);
  assert.equal(musicTiming(120, 8, 4).beatSeconds, .5);
  for (const bpm of [0,301,NaN,Infinity]) assert.equal(musicTiming(bpm,32,4),null);
  assert.equal(musicTiming(90,0,4),null);
  assert.equal(musicTiming(90,32,5),null);
});
test('repetition checks are case insensitive and preserve source', () => {
  const data={lyrics_chorus:'Hope\nhope\n\nPeace',lyrics_intro:'Hope'};
  assert.deepEqual(repeatedLines(data),[{line:'Hope',count:3}]);
  assert.equal(data.lyrics_intro,'Hope');
});
test('chapter pacing respects target without negative remaining counts', () => {
  const chapters=[{title:'First',content:'one two three four'}];
  assert.equal(chapterPlan(chapters,200,2)[0].remaining,0);
  assert.equal(chapterPlan(chapters,200,2)[0].progress,100);
  assert.equal(chapterPlan(chapters,0,0)[0].minutes,4/200);
});
test('route audit marks subsequent duplicates only', () => {
  assert.deepEqual(routeAudit([{path:'/',name:'Home'},{path:'/',name:'Other'}]).map(row=>row.duplicate),[false,true]);
});
test('production filters isolate the requested feature or asset type', () => {
  const features=[{title:'Login',priority:'must_have'},{title:'Theme',priority:'later'}];
  assert.equal(productionRows('software',{features},{filter:'later'})[0].title,'Theme');
  assert.equal(productionRows('game',{assets:[{kind:'shader',title:'Water'},{kind:'model',title:'Tree'}]},{filter:'shader'})[0].title,'Water');
});
test('video schedules retain original cumulative positions after filtering', () => {
  const shots=[{title:'A',duration_seconds:5},{title:'B',duration_seconds:15}];
  assert.equal(productionRows('video',{shots},{minimum:10})[0].detail,'5s–20s (15s)');
});
test('story and music filters are read-only planning projections', () => {
  const data={chapters:[{title:'Empty',content:''},{title:'Written',content:'word'}]};
  assert.equal(productionRows('story',data,{emptyOnly:true}).length,1);
  assert.equal(data.chapters.length,2);
  assert.equal(productionRows('music',{lyrics_chorus:'Hook'},{filter:'chorus'})[0].content,'Hook');
});
test('genre catalogue offers distinct design directions', () => {
  assert.equal(new Set(GAME_GENRES).size,GAME_GENRES.length);
  assert.ok(GAME_GENRES.includes('Puzzle') && GAME_GENRES.includes('Role-playing'));
});
