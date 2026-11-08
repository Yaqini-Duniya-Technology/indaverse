# Video Studio: saved clip sequences

Open **Video Studio → Saved clip sequence → Open clip sequence** in a video or music-video project.

1. Add up to four H.264 MP4 sources. Each source is saved as soon as it is added. Use **Preview source** to view the original clip.
2. Enter start and end seconds or seek the source preview and use **Set start from playhead** and **Set end from playhead**. Use **Move earlier** or **Move later** to arrange the cuts. The **Output timeline** shows when each cut starts and ends in the exported sequence.
3. Use **Framing** on each clip: **Fit** preserves the whole image with black bars where needed; **Fill** crops the centre to cover the output. Optionally enter a title of up to 48 characters, place it at the top or bottom, and choose how long it appears from the start of the cut.
4. Add a full-cut caption or timed captions (see below). Use **Clip volume** to lower the source audio; mute overrides volume. **Fade picture and audio** adds a quarter-second fade at each edge without shortening the cut.
5. Select **Save sequence**. Reload and reopen the sequence to verify the saved order and edits. If another tab saved first, reload before applying edits again.
6. Choose landscape (640 × 360), vertical (360 × 640), or square (480 × 480). Check **Show captions in the video** to make captions part of the picture; leave it unchecked for a clean MP4. Select **Render saved sequence**, preview it, and choose **Download sequence MP4**. The format and caption checkbox apply to the next render; they are not saved with the sequence.
7. Use **Prepare captions SRT** or **Prepare captions WebVTT**, then download the corresponding subtitle file. The files use sequence time after trims and reordering. Subtitle downloads do not require FFmpeg.

For example, put a 1-second uncaptioned intro before a 2-second clip captioned “Find the beacon.” The SRT cue will run from 00:00:01,000 to 00:00:03,000. Use a vertical render with Fill if the centre of the shot holds the subject, or Fit if cropping would cut out important details.

Each source is capped at 8 MiB and 120 seconds. Each cut is at least 0.5 seconds and the sequence is capped at 30 seconds. Output is H.264/AAC at 30 fps. A source without audio contributes silence. Removing a clip and saving deletes its stored copy; the file on your device is unchanged.

## Time captions within a cut

Open **Captions** on a clip. Keep a single caption across the cut, convert it with **Make caption timed**, or add timed captions individually. A timed caption can use one or two lines (90 characters total), and can sit at the top or bottom. Times start at zero for the **trimmed** clip. The **In the video** label shows where each cue lands in the final sequence after reordering.

Use **Import SRT for this cut** to load a numbered UTF-8 SubRip file up to 16 KiB. Its times must be relative to this cut, not to the original source or whole sequence. Import replaces the selected cut’s captions only after confirmation if they already exist. Each cue must be at least 0.1 seconds, stay inside the cut, and not overlap the next cue. There are at most six timed cues per cut and 16 captions per sequence. If you shorten a cut, adjust any cues that now exceed it before saving.

**Show captions in the video** burns the captions into the MP4. With it off, the MP4 stays clean and the Studio preview loads a switchable caption track. WebVTT carries top placement for timed cues; SRT carries text and timing.

## Add a soundtrack

Add one MP3 or PCM WAV of 0.25–120 seconds and up to 8 MiB. Use **Preview soundtrack source** to hear the original. Set the trim start and end in the source, then set **Start in video** to place it on the output timeline. Adjust the soundtrack volume and its independent fade-in and fade-out (up to five seconds each).

Choose **Mix with original clip audio** for music under speech, or **Replace original clip audio** to silence the original clips throughout the video. The soundtrack stops at the end of the video. If the video ends during the soundtrack, its fade-out moves to the end of the audible range. Use **Save sequence** before rendering. **Replace soundtrack file** swaps the source and resets its settings; **Remove soundtrack** restores the original clip audio for the next render.

Example: trim a soundtrack to seconds 2–6, start it 1 second into the video, and mix it at 35% with a 0.5-second fade at each end. Preview the rendered MP4 to check the balance.

## Local setup and data

- Run `alembic upgrade head` from `apps/api` using the configured database. The soundtrack migration adds a table and preserves existing sequences. Downgrading it removes saved soundtracks.
- Enable local FFmpeg using the [single-clip export guide](VIDEO-CLIP-EXPORT.md). Public rendering remains disabled. Project ownership is checked for source reads, uploads, edits and exports.
- Source bytes are kept privately in the database so reopening works without reattaching files. Clip sources add up to 32 MiB per project; a soundtrack adds up to 8 MiB. Both are included in database backups. Sources are separate from the shared asset library and are not included when duplicating project drafts. Rendering uses temporary files and returns a private MP4 attachment.
- This is one ordered list of cuts. Multiple soundtrack layers, overlapping transitions, automatic transcription, whole-sequence subtitle import, and background render jobs are later work. Text rendering uses the bundled Pillow font; some characters may not be available.

## Prepare a publishing kit

Save your changes and choose the video format and whether captions should be part of the picture. Under **Publishing kit**, set a poster time (or leave it blank for the midpoint), select subtitle formats, and choose **Prepare publishing kit**.

The ZIP contains the rendered MP4, JPEG poster, a CSV with source and output times, and a publishing checklist. A captioned project also includes a timestamped transcript and any selected subtitle files. `manifest.json` records the saved sequence version, output format, planned duration, poster time, and SHA-256 checksums for the payload files. The kit excludes original media and is downloaded privately. Nothing is posted automatically.
