# Video Studio: trim and export a clip

This is the first rendered output workflow for Video Studio. Select one H.264 MP4, choose a start and end, preview the source range, render it and download a new MP4. The storyboard, draft and original file are not modified.

## Local setup

1. Put a trusted [FFmpeg build](https://ffmpeg.org/download.html) with H.264 encoding (`libx264`) and AAC support on the API process PATH. In PowerShell, check `ffmpeg -version` and `ffprobe -version`.
2. In the repository's existing local `.env`, add `VIDEO_CLIP_EXPORT_ENABLED=true`. Keep `APP_ENV=development` for local use. Restart the API from a terminal that can find both binaries.
3. Open a video or music-video project. In **Video Studio → Trim and export an MP4**, choose **Check MP4 export availability**.
4. Select a local MP4. For a 12-second source, enter **2** and **7** to make a five-second cut. Use **Preview selected range** if your browser supports the source. Select **Render MP4**, then **Download MP4**. The rendered result can also be previewed in the editor.

A source may be at most 32 MiB and 120 seconds, with at most 1080p-equivalent pixels. Output is limited to 0.5–30 seconds and up to 1280 × 720, preserving aspect ratio. The exporter encodes H.264 at 30 fps and preserves the first audio track as AAC stereo when present. The preview uses browser playback timing; the rendered result is the output to check for cut timing.

If a browser cannot preview the file, enter the range manually. If rendering is unavailable, check the local setting, PATH and encoder support. Use a standard MP4 from a trusted source; unsupported codecs, unusual stream layouts and damaged files may fail.

## Export contract and isolation

- `GET /api/v1/projects/{id}/video/clip-export`: owner-only availability and limits.
- `POST /api/v1/projects/{id}/video/clip-export?start=2&end=7`: authenticated raw `video/mp4` request body. Returns an MP4 attachment with a server-generated filename and `Cache-Control: no-store`, or a JSON error.
- The renderer is off by default and unavailable in production. It accepts one render per local API process, uses a fixed input demuxer and arguments, disables external MP4 data references, applies size and time limits, and removes temporary files. It does not launch a shell, fetch remote media or store the source in the shared asset library.
- These limits are for local use. Shared or public rendering would require a hardened worker sandbox, quotas and deployment review. There is no AI provider, job queue or deployment change in this slice.

## Acceptance

The API test creates a synthetic source with two distinct colours and a tone, trims the blue section, checks the requested duration and H.264/AAC streams, inspects the first decoded frame and decodes the complete result. Separate checks cover ownership, disabled production rendering, invalid media, upload limits and a busy renderer.

The browser test signs in, selects a fixture, renders the chosen range, downloads the MP4 and independently probes and decodes it. GitHub verification installs FFmpeg so the media tests can run there.

This is a single-clip trim workflow. Persistent source media, clip sequencing, timeline tracks, transitions, captions and final composition rendering remain future upgrades.
