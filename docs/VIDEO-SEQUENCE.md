# Video Studio: saved clip sequences

Open **Video Studio → Saved clip sequence → Open clip sequence** in a video or music-video project.

1. Add up to four H.264 MP4 sources. Each source is saved as soon as it is added. Use **Preview source** to view the original clip.
2. Enter start and end seconds or seek the source preview and use **Set start from playhead** and **Set end from playhead**. Use **Move earlier** or **Move later** to arrange the cuts. The **Output timeline** shows when each cut starts and ends in the exported sequence.
3. Use **Framing** on each clip: **Fit** preserves the whole image with black bars where needed; **Fill** crops the centre to cover the output. Optionally enter a title of up to 48 characters, place it at the top or bottom, and choose how long it appears from the start of the cut.
4. Enter an optional caption of up to 90 characters per cut. It covers the whole cut. Use **Clip volume** to lower the source audio; mute overrides volume. **Fade picture and audio** adds a quarter-second fade at each edge without shortening the cut.
5. Select **Save sequence**. Reload and reopen the sequence to verify the saved order and edits. If another tab saved first, reload before applying edits again.
6. Choose landscape (640 × 360), vertical (360 × 640), or square (480 × 480). Check **Show captions in the video** to make captions part of the picture; leave it unchecked for a clean MP4. Select **Render saved sequence**, preview it, and choose **Download sequence MP4**. The format and caption checkbox apply to the next render; they are not saved with the sequence.
7. If you want a separate subtitle file, select **Prepare captions SRT** and **Download captions SRT**. The file uses sequence time after trims and reordering, and skips clips without captions. It does not require FFmpeg.

For example, put a 1-second uncaptioned intro before a 2-second clip captioned “Find the beacon.” The SRT cue will run from 00:00:01,000 to 00:00:03,000. Use a vertical render with Fill if the centre of the shot holds the subject, or Fit if cropping would cut out important details.

Each source is capped at 8 MiB and 120 seconds. Each cut is at least 0.5 seconds and the sequence is capped at 30 seconds. Output is H.264/AAC at 30 fps. A source without audio contributes silence. Removing a clip and saving deletes its stored copy; the file on your device is unchanged.

## Local setup and data

- Apply the saved sequence migration if it has not been applied. The finishing controls use the existing sequence data and add no migration.
- Enable local FFmpeg using the [single-clip export guide](VIDEO-CLIP-EXPORT.md). Public rendering remains disabled. Project ownership is checked for source reads, uploads, edits and exports.
- Source bytes are kept privately in the database so reopening works without reattaching files. This adds up to 32 MiB of storage per project and is included in database backups. Sources are separate from the shared asset library and are not included when duplicating project drafts. Rendering uses temporary files and returns a private MP4 attachment.
- This is one ordered list of cuts. Multiple tracks, overlapping transitions, automatic transcription, multiple subtitle cues within a cut, and background render jobs are later work. Text rendering uses the bundled Pillow font; some characters may not be available.
