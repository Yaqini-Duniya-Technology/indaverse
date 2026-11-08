export type History<T> = { past: T[]; current: T; future: T[] };
export type Action<T> = { type: "reset"; value: T } | {type: "undo" | "redo"} | {type: "edit"; update: (value: T) => T};
export function resetHistory<T>(current: T): History<T>;
export function updateHistory<T>(history: History<T>, action: Action<T>): History<T>;
