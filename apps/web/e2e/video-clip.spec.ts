import { spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

test("render a selected video range and download a decodable MP4", async ({ page }) => {
  test.skip(spawnSync("ffmpeg", ["-version"]).status !== 0 ||
    spawnSync("ffprobe", ["-version"]).status !== 0, "Requires FFmpeg and FFprobe.");
  const folder = await mkdtemp(join(tmpdir(), "indaverse-e2e-clip-"));
  try {
    const source = join(folder, "source.mp4");
    const output = join(folder, "export.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=green:s=160x120:r=30:d=3",
      "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", source], { timeout: 15000 });

    const api = "http://127.0.0.1:8012/api/v1";
    const username = `clip${Date.now()}`;
    const email = `${username}@example.com`;
    const password = "Fixture-only-password-123!";
    const registration = await page.request.post(`${api}/auth/register`, {data: {username, email, password}});
    expect(registration.status()).toBe(201);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Sign in", exact: true}).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const created = await page.request.post(`${api}/projects`, {data: {name: "Clip demo", project_type: "video"}});
    expect(created.status()).toBe(201);
    const {id} = await created.json();

    await page.goto(`/projects/${id}/video`);
    await page.getByRole("button", {name: "Check MP4 export availability"}).click();
    await page.getByLabel("Source MP4").setInputFiles(source);
    await page.getByLabel("Start seconds").fill("1");
    await page.getByLabel("End seconds").fill("2.25");
    await page.getByRole("button", {name: "Render MP4"}).click();
    await expect(page.getByText("MP4 ready for 1–2.25 seconds.")).toBeVisible();
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("link", {name: "Download MP4"}).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`indaverse-${id}-clip.mp4`);
    await download.saveAs(output);
    const duration = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", output], {encoding: "utf8", timeout: 10000});
    expect(Number(duration.trim())).toBeCloseTo(1.25, 1);
    execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", output, "-f", "null", "-"], {timeout: 10000});
  } finally {
    await rm(folder, {recursive: true, force: true});
  }
});

test("save, reopen and export a vertical sequence with captions and a soundtrack", async ({ page }) => {
  test.skip(spawnSync("ffmpeg", ["-version"]).status !== 0 ||
    spawnSync("ffprobe", ["-version"]).status !== 0, "Requires FFmpeg and FFprobe.");
  const folder = await mkdtemp(join(tmpdir(), "indaverse-e2e-sequence-"));
  try {
    const api = "http://127.0.0.1:8012/api/v1";
    const username = `sequence${Date.now()}`;
    const email = `${username}@example.com`;
    const password = "Fixture-only-password-123!";
    expect((await page.request.post(`${api}/auth/register`, {data: {username, email, password}})).status()).toBe(201);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", {exact: true}).fill(password);
    await page.getByRole("button", {name: "Sign in", exact: true}).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const created = await page.request.post(`${api}/projects`, {data: {name: "Sequence demo", project_type: "video"}});
    expect(created.status()).toBe(201);
    const {id} = await created.json();
    await page.goto(`/projects/${id}/video`);
    const editor = page.getByRole("region", {name: "Saved clip sequence"});
    await editor.getByRole("button", {name: "Open clip sequence"}).click();
    for (const [i, color] of ["red", "blue"].entries()) {
      const source = join(folder, `${color}.mp4`);
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x120:r=30:d=2`,
        "-c:v", "libx264", "-threads", "2", source], {timeout: 15000});
      await editor.getByLabel(/Add source MP4/).setInputFiles(source);
      await expect(editor.getByText(new RegExp(`Saved version ${i + 1}`))).toBeVisible();
    }
    await editor.getByRole("listitem").filter({hasText: "blue.mp4"})
      .getByRole("button", {name: "Move earlier"}).click();
    await editor.getByRole("button", {name: "Preview source"}).first().click();
    const useEnd = editor.getByRole("button", {name: "Set end from playhead"});
    await expect(useEnd).toBeEnabled();
    const player = editor.getByLabel("Saved source preview");
    await player.evaluate((video: HTMLVideoElement) => { video.currentTime = 0.25; });
    await editor.getByRole("button", {name: "Set start from playhead"}).click();
    await expect(editor.getByLabel("Start seconds").first()).toHaveValue("0.25");
    await player.evaluate((video: HTMLVideoElement) => { video.currentTime = 1.25; });
    await useEnd.click();
    await expect(editor.getByLabel("End seconds").first()).toHaveValue("1.25");
    await expect(editor.getByRole("link", {name: "Clip 2: 1–3 s"})).toBeVisible();
    await editor.getByLabel("Clip title (optional)").first().fill("Welcome to Zamara");
    await editor.getByLabel("Title position").first().selectOption("top");
    await editor.getByLabel("Show title").first().selectOption("500");
    await editor.getByLabel("Framing").first().selectOption("fill");
    await editor.getByLabel(/Caption \(optional/).last().fill("Find the beacon.");
    await editor.getByLabel("Mute clip audio").first().check();
    await editor.getByRole("slider", {name: "Clip volume"}).last().press("ArrowLeft");
    await editor.getByLabel(/Fade picture and audio/).last().check();
    await editor.getByRole("button", {name: "Save sequence"}).click();
    await expect(editor.getByText(/Saved version 3/)).toBeVisible();
    await page.reload();
    await editor.getByRole("button", {name: "Open clip sequence"}).click();
    await expect(editor.getByRole("listitem").first()).toContainText("blue.mp4");
    await expect(editor.getByLabel("End seconds").first()).toHaveValue("1.25");
    await expect(editor.getByLabel("Clip title (optional)").first()).toHaveValue("Welcome to Zamara");
    await expect(editor.getByLabel("Title position").first()).toHaveValue("top");
    await expect(editor.getByLabel("Show title").first()).toHaveValue("500");
    await expect(editor.getByLabel("Framing").first()).toHaveValue("fill");
    await expect(editor.getByLabel(/Caption \(optional/).last()).toHaveValue("Find the beacon.");
    await expect(editor.getByLabel("Mute clip audio").first()).toBeChecked();
    await expect(editor.getByRole("slider", {name: "Clip volume"}).last()).toHaveValue("99");
    await expect(editor.getByLabel(/Fade picture and audio/).last()).toBeChecked();
    await editor.getByRole("button", {name: "Preview source"}).first().click();
    await expect(editor.getByLabel("Saved source preview")).toHaveAttribute("src", /^blob:/);
    await editor.getByRole("button", {name: "Prepare captions SRT"}).click();
    const subtitleEvent = page.waitForEvent("download");
    await editor.getByRole("link", {name: "Download captions SRT"}).click();
    const subtitle = await subtitleEvent;
    expect(subtitle.suggestedFilename()).toBe(`indaverse-${id}-captions.srt`);
    const subtitlePath = join(folder, "captions.srt");
    await subtitle.saveAs(subtitlePath);
    expect(await readFile(subtitlePath, "utf8")).toBe("1\n00:00:01,000 --> 00:00:03,000\nFind the beacon.\n");
    const captionEditors = editor.getByRole("group", {name: "Captions", exact: true});
    await captionEditors.last().getByRole("button", {name: "Make caption timed"}).click();
    await expect(captionEditors.last().getByRole("textbox", {name: "Caption text"})).toHaveValue("Find the beacon.");
    await captionEditors.last().getByRole("spinbutton", {name: "Caption starts (seconds)"}).fill("0.25");
    const legacyEnd = captionEditors.last().getByRole("spinbutton", {name: "Caption ends (seconds)"});
    await expect(legacyEnd).toHaveValue("2");
    await legacyEnd.fill("1");
    await expect(captionEditors.last().getByText("In the video: 1.25–2 s")).toBeVisible();
    await captionEditors.first().getByLabel("Import SRT for this cut").setInputFiles({
      name: "intro.srt", mimeType: "application/x-subrip",
      buffer: Buffer.from("1\n00:00:00,000 --> 00:00:00,400\nWelcome\nto Zamara\n\n2\n00:00:00,500 --> 00:00:00,900\nLook ahead"),
    });
    const introCue = captionEditors.first().getByRole("group", {name: "Caption 1", exact: true});
    await expect(introCue.getByRole("textbox", {name: "Caption text"})).toHaveValue("Welcome\nto Zamara");
    await introCue.getByRole("combobox", {name: "Caption position"}).selectOption("top");
    const secondCue = captionEditors.first().getByRole("group", {name: "Caption 2", exact: true});
    await secondCue.getByRole("spinbutton", {name: "Caption starts (seconds)"}).fill("0.3");
    await expect(editor.getByText("Timed captions in the same clip cannot overlap.")).toBeVisible();
    await expect(editor.getByRole("button", {name: "Save sequence"})).toBeDisabled();
    await secondCue.getByRole("spinbutton", {name: "Caption starts (seconds)"}).fill("0.5");
    await editor.getByRole("button", {name: "Save sequence"}).click();
    await expect(editor.getByText("Sequence saved.")).toBeVisible();
    await editor.getByRole("button", {name: "Prepare captions WebVTT"}).click();
    const vttLink = editor.getByRole("link", {name: "Download captions WebVTT"});
    await expect(vttLink).toHaveAttribute("download", `indaverse-${id}-captions.vtt`);
    const vttContents = await vttLink.evaluate(async (link: HTMLAnchorElement) => (await fetch(link.href)).text());
    expect(vttContents).toContain("00:00:00.000 --> 00:00:00.400 line:10%\nWelcome\nto Zamara");
    await editor.getByRole("button", {name: "Render saved sequence"}).click();
    const unburned = editor.getByLabel("Rendered sequence preview");
    await expect.poll(() => unburned.evaluate((video: HTMLVideoElement) => video.textTracks[0]?.cues?.length)).toBe(3);

    const score = join(folder, "beacon.wav");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", score],
      {timeout: 15000});
    await editor.getByLabel("Add soundtrack file").setInputFiles(score);
    await expect(editor.getByText("Soundtrack added and saved.")).toBeVisible();
    const soundtrack = editor.getByRole("group", {name: "Soundtrack"});
    await soundtrack.getByRole("button", {name: "Preview soundtrack source"}).click();
    await expect(soundtrack.getByLabel("Original soundtrack preview")).toHaveAttribute("src", /^blob:/);
    await soundtrack.getByLabel("Start in video (seconds)").fill("0.5");
    await soundtrack.getByLabel("Audio fade in (seconds)").fill("0.25");
    await soundtrack.getByLabel("Audio fade out (seconds)").fill("0.3");
    await soundtrack.getByRole("slider", {name: "Soundtrack volume"}).press("ArrowRight");
    await soundtrack.getByRole("combobox", {name: "Clip audio", exact: true}).selectOption("replace");
    await editor.getByRole("button", {name: "Save sequence"}).click();
    await expect(editor.getByText("Sequence saved.")).toBeVisible();
    await page.reload();
    await editor.getByRole("button", {name: "Open clip sequence"}).click();
    await expect(soundtrack.getByText(/beacon.wav/)).toBeVisible();
    await expect(soundtrack.getByLabel("Start in video (seconds)")).toHaveValue("0.5");
    await expect(soundtrack.getByLabel("Audio fade in (seconds)")).toHaveValue("0.25");
    await expect(soundtrack.getByLabel("Audio fade out (seconds)")).toHaveValue("0.3");
    await expect(soundtrack.getByRole("slider", {name: "Soundtrack volume"})).toHaveValue("36");
    await expect(soundtrack.getByRole("combobox", {name: "Clip audio", exact: true})).toHaveValue("replace");
    await editor.getByLabel("Video format").selectOption("vertical");
    await editor.getByLabel("Show captions in the video").check();
    await editor.getByRole("button", {name: "Render saved sequence"}).click();
    const downloadEvent = page.waitForEvent("download");
    await editor.getByRole("link", {name: "Download sequence MP4"}).click();
    const output = join(folder, "sequence.mp4");
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`indaverse-${id}-sequence.mp4`);
    await download.saveAs(output);
    const duration = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", output], {encoding: "utf8", timeout: 10000});
    expect(Number(duration.trim())).toBeCloseTo(3, 1);
    const size = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=width,height", "-of", "csv=p=0", output], {encoding: "utf8", timeout: 10000});
    expect(size.trim()).toBe("360,640");
    page.once("dialog", dialog => dialog.accept());
    await soundtrack.getByRole("button", {name: "Remove soundtrack"}).click();
    await expect(editor.getByText("Soundtrack removed.")).toBeVisible();
    await expect(soundtrack.getByLabel("Add soundtrack file")).toBeVisible();
    execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", output, "-f", "null", "-"], {timeout: 10000});
  } finally {
    await rm(folder, {recursive: true, force: true});
  }
});
