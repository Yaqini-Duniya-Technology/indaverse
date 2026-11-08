const field = (name, meaning, example) => ({ name, meaning, example });
export const workspaceGuides = {
  home: { title: 'Start with a creative project', intro: 'IndaVerse is a development workspace for drafts, references and prototypes. Connected AI generation is still future work.', fields: [
    field('Create account', 'Register to keep projects under your own account.', 'Create an account, sign in, then open the dashboard.'),
    field('Choose a studio', 'Studios open through a project. Select the medium that fits your first draft.', 'Choose Game for a Zamara blueprint; choose Story for a novel manuscript.'),
  ]},
  dashboard: { title: 'Find or create a project', intro: 'Use New project for a separate creation. Search and type filters affect only the projects shown, not the saved records.', fields: [
    field('Project name', 'A short label used on your dashboard; studio drafts can have their own titles.', 'Legends of Zamara — first playable test'),
    field('Project type', 'Choose the studio you intend to use. Website and App both use Web & App Studio.', 'Story / novel for chapter-based writing.'),
    field('Search and sort', 'Search name or description, filter by type, and sort the currently loaded project list.', 'Search Zamara, filter Games, choose Recently updated.'),
    field('Archive or duplicate', 'Open a project to archive it or copy its saved draft. Archived projects remain editable. Copies start private and exclude media, plans, and previous revisions.', 'Duplicate a saved Zamara draft before trying a new design. Find archived projects using Project status on the dashboard.'),
    field('My asset library', 'Browse images and audio you own. Copy supported images after confirming permission to reuse them; open the source project for audio.', 'Copy a reference image from a Story project to a Game project. Link the new image from the Game editor.'),
    field('Creation modes and request history', 'Use the manual editors for production work. AI and integrated Hybrid generation are unavailable; generation history shows recorded image and music requests.', 'Open a project and choose Load generation history to check whether a previous request was unavailable.'),
  ]},
  brief: { title: 'Write a useful creative brief', intro: 'The brief captures direction. Changing it can make an existing project plan stale; it does not rewrite your studio drafts.', fields: [
    field('Creative goal', 'Describe the result and what success would look like.', 'Create a three-level exploration prototype where a player restores a village beacon.'),
    field('Audience', 'State who it is for, including language and cultural context.', 'Teen and adult players; English text; fictional West African-inspired setting.'),
    field('Style and direction', 'Specify mood, genre and visual or writing choices.', 'Warm, hopeful adventure with readable low-poly environments.'),
    field('Requirements and constraints', 'Include duration, formats, must-haves and exclusions.', 'Browser test; keyboard controls; original assets; no combat in the first milestone.'),
  ]},
  plan: { title: 'Plan and review the work', intro: 'A plan is a checklist derived from the saved brief. Its review tools do not automatically fix drafts or prove that a build works.', fields: [
    field('Step title and notes', 'Use an action and a clear completion condition.', 'Test village movement: confirm the player can reach the exit without falling through platforms.'),
    field('Linked assets', 'Attach evidence belonging to this project. Missing or foreign asset links cannot be saved.', 'Link the saved image used as a character reference.'),
    field('Review and refinement', 'Record findings, status and evidence based on checks actually performed.', 'Mark done after a browser test; note any camera issue that remains.'),
  ]},
  music: { title: 'Develop a song draft', intro: 'Write and save lyrics, upload audio, and revisit available history. Request tracking does not generate audio without a connected provider.', fields: [
    field('Title, artist and mood', 'Give the song a clear identity and intended feeling.', 'Faith / Dunny / reflective and hopeful'),
    field('BPM', 'An optional whole-number tempo between 1 and 300.', '92 BPM for a steady, gentle rhythm.'),
    field('Lyric sections', 'Separate intro, verses, chorus, bridge and outro. Empty sections can be intentional.', 'Chorus: a short recurring line about holding on to hope.'),
    field('Audio upload', 'Use supported audio within the upload limit. Playback requires project ownership.', 'Upload an original MP3 demo, then play and seek through it.'),
  ]},
  story: { title: 'Write, transfer and recover a story', intro: 'Chapter text, characters and scenes have separate editors. A chapter-draft export does not bundle the separate character/scene resources.', fields: [
    field('Synopsis and genre', 'Summarise the central conflict and intended story category.', 'Adventure: Kairo discovers why the village beacon stopped shining.'),
    field('Chapter title and content', 'Give each chapter a title before saving; develop the manuscript in content.', 'Chapter 1: The Silent Fountain. Begin with a concrete event in the village.'),
    field('Draft safety', 'Enable local recovery only on a trusted browser. Review recovered/imported data before applying it.', 'Export portable JSON before loading a newer server version.'),
    field('Reading preview', 'The reader shows saved chapters, not your unsaved editor text.', 'Save Story, then open Preview saved story.'),
  ]},
  video: { title: 'Plan a video shot by shot', intro: 'The video studio stores a script and storyboard. The planned shot schedule is not a rendered movie.', fields: [
    field('Saved clip sequence', 'Save up to four short MP4 sources, trim using the source playhead, reorder cuts, and add titles or captions. Render landscape, vertical, or square MP4, or download captions as SRT or WebVTT.', 'Put a one-second intro before your captioned clip, save, then export a vertical video and an SRT subtitle file.'),
    field('Timed captions', 'Add multiple cues inside a trimmed cut or import a cut-relative SRT. Reordering clips updates the timing in the exported video and subtitle files.', 'Add a cue from 0.25 to 1.25 seconds within a clip, place it at the top, and check its new time in the video after reordering.'),
    field('Soundtrack', 'Attach a private MP3 or PCM WAV, trim it, place it on the video timeline, and mix it with the clip audio or replace it. Save before rendering.', 'Start your music one second after the intro begins, set the volume to 35%, and add a half-second fade in.'),
    field('Trim and export an MP4', 'With local export enabled, choose an H.264 MP4 under 32 MB and no longer than 120 seconds. Select a 0.5–30-second range, then render and download it. The source and storyboard stay unchanged.', 'Choose a 12-second video, set Start to 2 and End to 7, then export a five-second MP4.'),
    field('Aspect ratio', 'Choose the intended framing for the video.', '16:9 landscape, 9:16 portrait, or 1:1 square.'),
    field('Script', 'Write the narrative or spoken content. Shot durations are entered separately.', 'Opening narration introduces the village and its dry fountain.'),
    field('Shot and camera direction', 'Describe what the viewer sees and how it is framed or moves.', 'Wide shot of the village at dawn; slow push toward the fountain.'),
    field('Duration and image reference', 'Enter whole seconds from 1 to 300 per shot; images are project-specific references.', '8 seconds. Choose a village reference image from this project.'),
  ]},
  software: { title: 'Structure a website or app blueprint', intro: 'This studio saves a design specification and preview. It does not compile or deploy a working software product.', fields: [
    field('Platform', 'Select the intended device target; this does not create separate application builds.', 'Web and mobile for a responsive community service.'),
    field('Page name and path', 'Paths start with / and use letters, numbers, /, _ or -. Each path must be unique.', 'Home at /, About at /about, Events at /events'),
    field('Sections', 'Choose a content role, heading and content for each section.', 'Hero: Discover your community. Content: Find local activities and support.'),
    field('Feature priority', 'Reserve must_have for the smallest usable scope; record later ideas separately.', 'Must-have: event list. Later: personalised recommendations.'),
  ]},
  game: { title: 'Design a 2D or 3D game', intro: 'A blueprint defines intentions. Playable layouts and 3D scenes are separate saved resources; models, mechanics and quests are not generated from text.', fields: [
    field('Dimension and core loop', 'Choose 2D or 3D and describe what players repeatedly do.', 'Explore, find clues, collect fragments, unlock the next location.'),
    field('Character roles', 'Player is controlled by the user; ally helps; enemy opposes; NPC provides other interactions.', 'Kairo: player. Amara: ally. Elder Daro: NPC.'),
    field('Level objective and challenges', 'State a completion condition and what makes reaching it interesting.', 'Collect three fragments and reach the gate; navigate two low platforms.'),
    field('Asset requirements', 'Describe what must be created or gathered. Model, texture, audio and other categories are requirements, not generated files.', 'Original low-poly Kairo model in GLB format; walking animation; village ambience.'),
  ]},
  images: { title: 'Organise image references', intro: 'Upload still images and select a project cover. Imported draft files do not include the image files themselves.', fields: [
    field('Label and category', 'Use a descriptive label and the reference purpose.', 'Zamara village at dawn / scene'),
    field('File and preview', 'JPEG, PNG or WebP; maximum 10 MB and 16 megapixels. The local preview is not an upload.', 'Choose an original PNG, review the preview, then select Upload image.'),
    field('Search, sort and cover', 'Search spans the project library. Cover selection is version-checked.', 'Filter scene, sort Label A–Z, then choose Use as project cover.'),
  ]},
  layout: { title: 'Position a 2D test layout', intro: 'Save the blueprint first. The 2D layout has its own save version and is separate from level descriptions.', fields: [
    field('Spawn and exit', 'Place them in the 800×400 play area, clear of solid platforms.', 'Spawn above a floor with enough room for the player to stand.'),
    field('Platforms and collectibles', 'Keep platform rectangles inside the canvas. Collectibles cannot overlap platforms.', 'Use a wide starting platform, then a reachable jump and a visible collectible.'),
    field('Snapping and undo', 'Use the positioning tools to align objects; review and save before playback.', 'Move one platform, undo it, redo it, save and test the jump.'),
  ]},
  scene: { title: 'Build a saved 3D test scene', intro: 'The visual preview shows your editor draft. Playback uses the saved scene, so save before testing.', fields: [
    field('X, Y and Z', 'X is left/right, Y is height, Z is forward/back. Coordinates describe this prototype scene.', 'Position a platform, then place the spawn on its top surface.'),
    field('Spawn and exit support', 'Both must sit on a supporting platform at the matching top height.', 'If a platform top is 0, set the supported spawn Y to 0.'),
    field('Camera, grid and history', 'Orbit to inspect height and spacing. Undo/redo changes the draft; it is not server revision history.', 'Inspect from two angles, validate the layout, save and play.'),
  ]},
  play: { title: 'Test the saved game prototype', intro: 'Read the controls displayed by the player. This tests supported prototype interactions, not every mechanic described in the blueprint.', fields: [
    field('Before playback', 'Save the blueprint and its matching playable layout/scene.', 'Save a 3D scene, then open Play 3D test.'),
    field('What to inspect', 'Check movement, camera, platforms, collectibles and the exit.', 'Try reaching the exit twice and record where movement gets stuck.'),
    field('Blank or unavailable renderer', 'WebGL support and graphics settings can affect 3D playback. Keep any error message for troubleshooting.', 'Retry after closing duplicate game tabs; record the displayed error.'),
  ]},
  reader: { title: 'Read the saved manuscript', intro: 'The private reader displays saved story chapters and supports chapter navigation, text size and theme controls.', fields: [
    field('Contents and chapter controls', 'Choose a chapter or move to the next/previous saved chapter.', 'Select Chapter 2 in Contents.'),
    field('Refresh saved story', 'Reloads saved text; it cannot recover unsaved editor changes.', 'Save in Story Studio, then refresh the reader.'),
  ]},
  access: { title: 'Access your own workspace', intro: 'Use your own account. Never share passwords or publish private session cookies in screenshots.', fields: [
    field('Registration', 'Use an email address, a username of 3–50 characters and a password of 8–128 characters.', 'Choose a unique username; use a password manager for your password.'),
    field('Connection versus session errors', 'An unreachable API requires a server/connection check. An expired session requires signing in again.', 'Cannot reach IndaVerse: start the API. Not authenticated: sign in.'),
  ]},
};
// Production tool guidance is shared by the page dock and categorized centre.
workspaceGuides.music.fields.push(
  field('Bars and beats', 'Set planning BPM, bar count and beats per bar to estimate arrangement duration. This does not create audio.', '90 BPM × 32 bars × 4 beats per bar = about 85.3 seconds.'),
  field('Lyric cues and repetitions', 'Filter lyric sections for a cue sheet. Repeated lines ignore letter case and may be intentional hooks.', 'Choose Chorus, export its production CSV, then review the hook with your performer.')
);
workspaceGuides.story.fields.push(
  field('Reading speed and chapter target', 'Reading-time estimates use the selected words per minute. Targets apply per chapter without changing text.', 'At 200 words/minute, a 1,000-word chapter takes about 5 minutes.'),
  field('Unwritten chapters', 'Show chapters with no words to find planned sections that still need a draft.', 'Enable Show unwritten chapters, then return to the chapter editor to write them.')
);
workspaceGuides.video.fields.push(
  field('Runtime budget', 'Compare the sum of planned shot durations with your target. Filter longer shots to review pacing.', 'A 70-second plan is 10 seconds over a 60-second target.'),
  field('Frame and shot schedule', 'The frame shows your draft aspect ratio. Timeline entries use cumulative shot seconds.', 'Two 5-second shots start at 0s and 5s; use 9:16 for a portrait storyboard.')
);
workspaceGuides.software.fields.push(
  field('Sitemap and scope', 'Review route uniqueness and section counts, then filter features by priority.', 'Keep / as Home, /about as About; review Must have before Later features.'),
  field('Acceptance checklist', 'Use temporary checkboxes to review current feature scope. Refresh clears checks; no test is executed automatically.', 'Manually test account registration before checking its acceptance item.')
);
workspaceGuides.game.fields.push(
  field('Dimension and genre', 'Choose 2D or 3D explicitly, then choose a suggested genre or write a custom one. Save before opening the corresponding layout.', '2D + Puzzle for a tile challenge; 3D + Exploration for a spatial prototype.'),
  field('Production inventory', 'Filter requirements by asset category, find level objectives and inspect character roles. Exports are requirements, not asset files.', 'Choose Model for 3D mesh requirements; search beacon to find the related level objective.')
);
export function guideFor(pathname, hash = '') {
  if (pathname === '/') return { id: 'home', ...workspaceGuides.home };
  if (pathname === '/login' || pathname === '/register') return { id: 'access', ...workspaceGuides.access };
  if (pathname === '/dashboard') return { id: 'dashboard', ...workspaceGuides.dashboard };
  const project = /^\/projects\/\d+(?:\/(.*))?$/.exec(pathname);
  let id = 'brief';
  if (project) {
    const route = project[1] || '';
    if (hash === '#project-images') id = 'images';
    else if (hash === '#project-plan') id = 'plan';
    else if (route === 'game/layout') id = 'layout';
    else if (route === 'game/scene') id = 'scene';
    else if (route === 'game/play') id = 'play';
    else if (route === 'story/read') id = 'reader';
    else if (route.startsWith('music')) id = 'music';
    else if (route.startsWith('story')) id = 'story';
    else if (route.startsWith('video')) id = 'video';
    else if (route.startsWith('software')) id = 'software';
    else if (route.startsWith('game')) id = 'game';
  }
  return { id, ...workspaceGuides[id] };
}
