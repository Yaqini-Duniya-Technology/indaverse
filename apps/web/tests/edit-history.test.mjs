import assert from "node:assert/strict";
import test from "node:test";
import {resetHistory, updateHistory} from "../src/lib/edit-history.mjs";

test("undo and redo preserve a whole edit, and branching discards redo", () => {
  const baseline = {cuts: [1, 2], soundtrack: 50};
  let history = resetHistory(baseline);
  history = updateHistory(history, {type: "edit", update: () => ({cuts: [2, 1], soundtrack: 20})});
  const edited = history.current;
  history = updateHistory(history, {type: "undo"});
  assert.deepEqual(history.current, baseline);
  history = updateHistory(history, {type: "redo"});
  assert.deepEqual(history.current, edited);
  history = updateHistory(history, {type: "undo"});
  history = updateHistory(history, {type: "edit", update: value => ({...value, soundtrack: 30})});
  assert.deepEqual(updateHistory(history, {type: "redo"}).current, {cuts: [1, 2], soundtrack: 30});
  for (let n = 0; n < 60; n++) history = updateHistory(history, {
    type: "edit", update: value => ({...value, soundtrack: n}),
  });
  assert.equal(history.past.length, 50);
  assert.deepEqual(updateHistory(history, {type: "reset", value: baseline}), resetHistory(baseline));
});
