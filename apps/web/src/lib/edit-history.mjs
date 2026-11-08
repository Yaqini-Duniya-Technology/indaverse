export function resetHistory(current) {
  return {past: [], current, future: []};
}

export function updateHistory(history, action) {
  const {past, current, future} = history;
  if (action.type === "reset") return resetHistory(action.value);
  if (action.type === "undo") return past.length
    ? {past: past.slice(0, -1), current: past.at(-1), future: [current, ...future]} : history;
  if (action.type === "redo") return future.length
    ? {past: [...past, current], current: future[0], future: future.slice(1)} : history;
  const next = action.update(current);
  return JSON.stringify(current) === JSON.stringify(next) ? history
    : {past: [...past.slice(-49), current], current: next, future: []};
}
