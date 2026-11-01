import { wordCount, shotTimeline } from './studio-insights.mjs';
export const GAME_GENRES = ['Adventure', 'Platformer', 'Puzzle', 'Racing', 'Role-playing', 'Strategy', 'Simulation', 'Survival', 'Sports', 'Educational', 'Rhythm', 'Exploration'];
export function musicTiming(bpm, bars, beats) {
  if (![bpm, bars, beats].every(Number.isFinite) || bpm < 1 || bpm > 300 || bars < 1 || bars > 1000 || ![2,3,4,6].includes(beats)) return null;
  return { seconds: bars * beats * 60 / bpm, beatSeconds: 60 / bpm };
}
export function repeatedLines(data) {
  const lines = ['intro','verse_1','chorus','verse_2','bridge','outro'].flatMap(key => String(data?.[`lyrics_${key}`] ?? '').split(/\r?\n/)).map(line => line.trim()).filter(Boolean);
  const counts = new Map();
  for (const line of lines) { const key = line.toLocaleLowerCase(); const current = counts.get(key); counts.set(key, {line: current?.line ?? line, count: (current?.count ?? 0) + 1}); }
  return [...counts.values()].filter(item => item.count > 1).sort((a,b) => b.count-a.count);
}
export function chapterPlan(chapters = [], speed = 200, target = 1000) {
  const safeSpeed = Number.isFinite(speed) && speed >= 50 && speed <= 1000 ? speed : 200;
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 1000;
  return chapters.map(chapter => {const words = wordCount(chapter.content); return { title: chapter.title || 'Untitled', words, minutes: words / safeSpeed, remaining: Math.max(0,safeTarget-words), progress: Math.min(100,Math.round(words/safeTarget*100)) };});
}
export function routeAudit(pages = []) {
  const seen = new Set();
  return pages.map(page => {const duplicate = seen.has(page.path); seen.add(page.path); return {path: page.path, name: page.name, duplicate, sections: (page.sections ?? []).length};});
}
export function productionRows(kind, data, options = {}) {
  if (kind === 'music') return ['intro','verse_1','chorus','verse_2','bridge','outro'].map(key => ({title:key.replaceAll('_',' '), detail:`${wordCount(data?.[`lyrics_${key}`])} words`, content:String(data?.[`lyrics_${key}`] ?? '')})).filter(row => !options.filter || row.title.includes(options.filter));
  if (kind === 'story') return chapterPlan(data?.chapters, options.speed, options.target).filter(row => !options.emptyOnly || row.words === 0).map(row => ({title:row.title, detail:`${row.words} words · ${row.minutes.toFixed(1)} min · ${row.progress}% of target · ${row.remaining} words remaining`, content:''}));
  if (kind === 'video') return shotTimeline(data?.shots).filter(row => row.duration >= (options.minimum || 0)).map(row => ({title:`${row.number}. ${row.title}`, detail:`${row.start}s–${row.end}s (${row.duration}s)`, content:`${row.description}\nCamera: ${row.camera}`}));
  if (kind === 'software') return (data?.features ?? []).filter(row => !options.filter || row.priority === options.filter).map(row => ({title:row.title, detail:row.priority, content:row.description}));
  return (data?.assets ?? []).filter(row => !options.filter || row.kind === options.filter).map(row => ({title:row.title, detail:row.kind, content:row.description}));
}
