# Video Studio: saved clip sequences

Stacked on the single-clip MP4 export. Open **Video Studio → Saved clip sequence → Open clip sequence** in a video or music-video project.

1. Add up to four H.264 MP4 sources. Each source is saved as soon as it is added. Use **Preview source** to view the original clip.
2. Enter start and end seconds, then use **Move earlier** or **Move later** to arrange the cuts.
3. Optionally enter a **Clip title** (up to 48 characters) or tick **Mute clip audio**. Titles appear near the bottom. Set **Clip volume** from 0% to 100% to lower the source audio; mute overrides the volume. Turn on **Fade picture and audio** to fade the picture and audio during the first and last quarter second of the cut. Fades leave the cut length unchanged. **Preview source** still plays the original clip. Select **Save sequence**. Reload and reopen the sequence to verify the saved order. If another tab changed it first, reload before applying edits again.
4. Select **Render saved sequence**, preview the result and choose **Download sequence MP4**.

Each source is capped at 8 MiB and 120 seconds of video. Each cut is at least 0.5 seconds and the saved sequence is capped at 30 seconds. Output is H.264/AAC at 640 × 360, 30 fps, with aspect-ratio padding and straight cuts. A source without audio contributes silence. Removing a clip and saving deletes its stored copy; the file on your device is unchanged.

## Local setup and data

- Apply the additive Alembic migration through the normal local startup process after taking a verified backup. It creates two tables; existing project and storyboard rows are unchanged. Downgrading removes the new tables and their saved sequences.
- Enable local FFmpeg using the [single-clip export guide](VIDEO-CLIP-EXPORT.md). Public rendering remains disabled. Project ownership is checked for source reads, uploads, edits and renders.
- Source bytes are kept privately in the database so reopening works without reattaching files. This adds up to 32 MiB of storage per project and is included in database backups. Sources are separate from the shared asset library and are not included when duplicating project drafts. Rendering uses temporary files and returns a private MP4 attachment.
- This is one ordered list of cuts. Multiple tracks, overlapping transitions, styled or timed text, and background render jobs are later work. Title rendering uses the bundled Pillow font; some characters may not be available.
