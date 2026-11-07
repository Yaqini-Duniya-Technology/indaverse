import { spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
