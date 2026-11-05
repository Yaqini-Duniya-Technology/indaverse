import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotDiff } from '../src/lib/snapshot-diff.mjs';
test('comparison preserves source and identifies changed nested fields',()=>{
 const before={title:'A',characters:[{name:'Kairo'}]};
 assert.deepEqual(snapshotDiff(before,{title:'B',characters:[{name:'Amara'}]}).map(row=>row.path),['title','characters.0.name']);
 assert.equal(before.characters[0].name,'Kairo');
});
test('comparison covers removals, nulls and explicit bounded output',()=>{
 assert.equal(snapshotDiff({title:'A'},{} )[0].after,'(absent)');
 assert.equal(snapshotDiff({title:'A'}, {title:null})[0].after,'null');
 assert.equal(snapshotDiff({a:1,b:1},{a:2,b:2},1).length,1);
 assert.deepEqual(snapshotDiff({a:1},{a:1}),[]);
});
