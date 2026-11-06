// Bounded, read-only comparisons. Array positions are explicit; no restore is performed.
export function snapshotDiff(before, after, limit = 100) {
  const changes = [];
  function visit(left,right,path) {
    if (changes.length >= limit || JSON.stringify(left) === JSON.stringify(right)) return;
    if (left && right && typeof left === 'object' && typeof right === 'object' && Array.isArray(left) === Array.isArray(right)) {
      for (const key of new Set([...Object.keys(left),...Object.keys(right)])) visit(left[key],right[key],path ? `${path}.${key}` : key);
    } else changes.push({path:path || 'draft',before:left === undefined ? '(absent)' : JSON.stringify(left),after:right === undefined ? '(absent)' : JSON.stringify(right)});
  }
  visit(before,after,'');
  return changes;
}
