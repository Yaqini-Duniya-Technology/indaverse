// Pure draft analysis. These checks are advisory, never proof of a playable build.
export const wordCount = (text = '') => String(text).trim().split(/\s+/u).filter(Boolean).length;
export const durationLabel = (seconds = 0) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};
const text = value => typeof value === 'string' ? value : '';
const list = value => Array.isArray(value) ? value : [];
const cell = value => {
  let result = String(value ?? '');
  // Prevent spreadsheet formula execution when a CSV is opened in a spreadsheet.
  if (/^[\s]*[=+\-@]/u.test(result)) result = "'" + result;
  return '"' + result.replaceAll('"', '""') + '"';
};
export const csv = rows => rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
export function shotTimeline(shots) {
  let elapsed = 0;
  return list(shots).map((shot, index) => {
    const duration = Number.isFinite(shot.duration_seconds) && shot.duration_seconds > 0 ? shot.duration_seconds : 0;
    const row = { number: index + 1, title: text(shot.title), start: elapsed, end: elapsed + duration,
      duration, description: text(shot.description), camera: text(shot.camera_direction) };
    elapsed += duration;
    return row;
  });
}
export function analyzeStudio(kind, raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const title = text(data.title) || 'Untitled draft';
  const issues = [];
  const metrics = [];
  const entries = [];
  let report = `# ${title}\n\nDraft working copy. Unsaved edits may be included.\n\n`;
  let table = [['Title', 'Notes']];
  if (!text(data.title).trim()) issues.push('Give this draft a title.');
  if (kind === 'music') {
    report += `Artist: ${text(data.artist)}\nGenre: ${text(data.genre)}\nMood: ${text(data.mood)}\nTempo: ${data.bpm || 'Not set'}\n\n`;
    const sections = ['intro', 'verse_1', 'chorus', 'verse_2', 'bridge', 'outro'];
    for (const section of sections) {
      const content = text(data[`lyrics_${section}`]);
      const label = section.replaceAll('_', ' ');
      entries.push({ title: label, detail: `${wordCount(content)} words`, content });
      report += `## ${label}\n\n${content || '(empty)'}\n\n`;
    }
    const count = entries.reduce((sum, item) => sum + wordCount(item.content), 0);
    metrics.push({ label: 'Lyric words', value: String(count) }, { label: 'Sections written', value: `${entries.filter(e => e.content.trim()).length}/6` });
    if (!count) issues.push('Add lyrics or describe the instrumental arrangement.');
    if (!text(data.lyrics_chorus).trim()) issues.push('No chorus written; this may be intentional.');
    const bpm = Number(data.bpm);
    if (data.bpm && (!Number.isFinite(bpm) || bpm < 1 || bpm > 300)) issues.push('Tempo must be between 1 and 300 BPM.');
    metrics.push({ label: 'Tempo', value: bpm > 0 && bpm <= 300 ? `${bpm} BPM` : 'Not set' });
    table = [['Section', 'Words', 'Lyrics'], ...entries.map(e => [e.title, wordCount(e.content), e.content])];
  } else if (kind === 'story') {
    report += `Genre: ${text(data.genre)}\n\n${text(data.synopsis)}\n\n`;
    const chapters = list(data.chapters);
    const count = chapters.reduce((sum, item) => sum + wordCount(item.content), 0);
    metrics.push({ label: 'Chapters', value: String(chapters.length) }, { label: 'Manuscript words', value: String(count) },
      { label: 'Estimated reading', value: `${Math.ceil(count / 200)} min at 200 words/min` });
    if (!chapters.length) issues.push('Add your first chapter.');
    for (const [index, chapter] of chapters.entries()) {
      const name = text(chapter.title) || `Chapter ${index + 1}`;
      if (!text(chapter.title).trim()) issues.push(`Chapter ${index + 1} needs a title.`);
      if (!text(chapter.content).trim()) issues.push(`${name} has no manuscript text.`);
      entries.push({ title: name, detail: `${wordCount(chapter.content)} words`, content: text(chapter.content) });
      report += `## ${name}\n\n${text(chapter.content)}\n\n`;
    }
    table = [['Chapter', 'Words'], ...entries.map(e => [e.title, wordCount(e.content)])];
  } else if (kind === 'video') {
    const shots = list(data.shots), timeline = shotTimeline(shots);
    metrics.push({ label: 'Shots', value: String(shots.length) }, { label: 'Planned runtime', value: durationLabel(timeline.at(-1)?.end ?? 0) },
      { label: 'Script words', value: String(wordCount(data.script)) });
    if (!shots.length) issues.push('Add a shot to build the timeline.');
    report += `## Script\n\n${text(data.script)}\n\n## Shot schedule\n\n`;
    for (const [index, shot] of shots.entries()) {
      const row = timeline[index];
      if (!text(shot.title).trim()) issues.push(`Shot ${index + 1} needs a title.`);
      if (!Number.isFinite(shot.duration_seconds) || shot.duration_seconds <= 0) issues.push(`Shot ${index + 1} needs a positive duration.`);
      if (!text(shot.camera_direction).trim()) issues.push(`Shot ${index + 1} has no camera direction.`);
      entries.push({ title: row.title || `Shot ${index + 1}`, detail: `${durationLabel(row.start)}–${durationLabel(row.end)}`, content: `${row.description}\nCamera: ${row.camera}` });
      report += `${index + 1}. ${row.title}: ${row.start}s–${row.end}s\n${row.description}\nCamera: ${row.camera}\n\n`;
    }
    table = [['Shot', 'Title', 'Start seconds', 'End seconds', 'Duration seconds', 'Camera', 'Description'],
      ...timeline.map(row => [row.number, row.title, row.start, row.end, row.duration, row.camera, row.description])];
  } else if (kind === 'software') {
    report += `Platform: ${text(data.platform)}\n\n${text(data.description)}\n\n`;
    const pages = list(data.pages), features = list(data.features);
    metrics.push({ label: 'Pages / screens', value: String(pages.length) }, { label: 'Sections', value: String(pages.reduce((sum, p) => sum + list(p.sections).length, 0)) },
      { label: 'Must-have features', value: String(features.filter(f => f.priority === 'must_have').length) });
    if (!pages.some(p => p.path === '/')) issues.push('No home route (/) is defined.');
    const paths = new Set();
    for (const page of pages) {
      if (paths.has(page.path)) issues.push(`Duplicate route: ${page.path}`);
      paths.add(page.path);
      if (!text(page.name).trim()) issues.push('A page needs a name.');
      entries.push({ title: text(page.name), detail: text(page.path), content: list(page.sections).map(s => `${s.heading}\n${s.content}`).join('\n\n') });
      report += `## ${page.name} (${page.path})\n\n` + list(page.sections).map(s => `### ${s.heading}\n\n${s.content}`).join('\n\n') + '\n\n';
    }
    report += '## Feature backlog\n\n' + features.map(f => `- [${f.priority}] ${f.title}: ${f.description}`).join('\n');
    table = [['Feature', 'Priority', 'Description'], ...features.map(f => [f.title, f.priority, f.description])];
  } else if (kind === 'game') {
    const characters = list(data.characters), levels = list(data.levels), assets = list(data.assets);
    const players = characters.filter(c => c.role === 'player');
    metrics.push({ label: 'Dimension', value: text(data.dimension).toUpperCase() }, { label: 'Characters / levels', value: `${characters.length} / ${levels.length}` },
      { label: 'Asset requirements', value: String(assets.length) });
    if (players.length !== 1) issues.push(`Design review: ${players.length} player characters. Check whether this is intentional.`);
    if (!text(data.controls).trim()) issues.push('Describe the intended controls.');
    if (!levels.length) issues.push('Add a level design.');
    for (const character of characters) {
      entries.push({ title: text(character.name), detail: `Character / ${text(character.role)}`, content: text(character.description) });
    }
    for (const level of levels) {
      if (!text(level.objective).trim()) issues.push(`${level.title || 'A level'} needs an objective.`);
      entries.push({ title: text(level.title), detail: 'Level design', content: `${level.setting}\nObjective: ${level.objective}\nChallenges: ${level.challenges}` });
    }
    report += `${text(data.concept)}\n\n## Gameplay loop\n${text(data.core_loop)}\n\n## Controls\n${text(data.controls)}\n\n`;
    for (const entry of entries) report += `## ${entry.title}\n\n${entry.content}\n\n`;
    table = [['Asset requirement', 'Kind', 'Description'], ...assets.map(a => [a.title, a.kind, a.description])];
    report += '## Asset requirements\n\n' + assets.map(a => `- ${a.title} (${a.kind}): ${a.description}`).join('\n');
  }
  return { title, metrics, issues, entries, report, csv: csv(table) };
}
