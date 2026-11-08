import { execFileSync, spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

test("recover browser edits only while their saved sequence version still matches", async ({page}) => {
  test.skip(spawnSync("ffmpeg", ["-version"]).status !== 0 ||
    spawnSync("ffprobe", ["-version"]).status !== 0, "Requires FFmpeg and FFprobe.");
  const api = "http://127.0.0.1:8012/api/v1";
  const username = `recover${Date.now()}`;
  const email = `${username}@example.com`;
  const password = "Fixture-only-password-123!";
  expect((await page.request.post(`${api}/auth/register`, {data: {username, email, password}})).status()).toBe(201);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", {exact: true}).fill(password);
  await page.getByRole("button", {name: "Sign in", exact: true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const response = await page.request.post(`${api}/projects`, {data: {name: "Recovery fixture", project_type: "video"}});
  expect(response.status()).toBe(201);
  const {id} = await response.json();
  const base = `${api}/projects/${id}/video/sequence`;
  const source = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x120:r=30:d=1",
    "-c:v", "libx264", "-threads", "2", "-movflags", "+frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"]);
  expect((await page.request.post(`${base}/sources?version=0`, {
    data: source, headers: {"Content-Type": "video/mp4", "X-Video-Filename": "blue.mp4"},
  })).status()).toBe(201);
  const editor = page.getByRole("region", {name: "Saved clip sequence"});
  const recovery = editor.getByRole("region", {name: "Sequence draft recovery"});
  const open = editor.getByRole("button", {name: "Open clip sequence"});
  const title = editor.getByLabel("Clip title (optional)");
  const keep = recovery.getByRole("button", {name: "Keep a sequence draft in this browser"});
  const restore = recovery.getByRole("button", {name: "Restore sequence draft"});
  const save = editor.getByRole("button", {name: "Save sequence"});
  await page.goto(`/projects/${id}/video`);
  await open.click();
  await keep.click();
  await title.fill("Recover this edit");
  await expect(recovery.getByText("Sequence draft kept in this browser.")).toBeVisible();
  await page.reload();
  await open.click();
  await expect(title).toHaveValue("");
  await restore.click();
  await expect(title).toHaveValue("Recover this edit");
  expect((await (await page.request.get(base)).json()).version).toBe(1);
  await save.click();
  await expect(editor.getByText("Sequence saved.")).toBeVisible();
  await page.reload();
  await open.click();
  await expect(title).toHaveValue("Recover this edit");
  await expect(restore).toHaveCount(0);
  await keep.click();
  await title.fill("Stale edit to preserve");
  await expect(recovery.getByText("Sequence draft kept in this browser.")).toBeVisible();
  await page.reload();
  await open.click();
  await expect(restore).toBeEnabled();
  const current = await (await page.request.get(base)).json();
  expect((await page.request.put(base, {data: {version: current.version,
    clips: [{...current.clips[0], title: "Newer server version"}]}})).status()).toBe(200);
  await restore.click();
  await expect(restore).toBeDisabled();
  await expect(title).toHaveValue("Newer server version");
  await expect(recovery.getByText(/Draft is based on version 2/)).toBeVisible();
  const download = page.waitForEvent("download");
  await recovery.getByRole("button", {name: "Download sequence draft JSON"}).click();
  expect((await download).suggestedFilename()).toBe(`indaverse-${id}-sequence-draft.json`);
  await editor.getByLabel("Choose sequence SRT").setInputFiles({
    name: "scene.srt", mimeType: "application/x-subrip",
    buffer: Buffer.from("1\n00:00:00,200 --> 00:00:00,800\nSequence caption"),
  });
  await expect(editor.getByText("0.2–0.8s: Sequence caption")).toBeVisible();
  await editor.getByRole("button", {name: "Replace captions in working sequence"}).click();
  await expect(editor.getByRole("textbox", {name: "Caption text"})).toHaveValue("Sequence caption");
  await editor.getByRole("button", {name: "Undo sequence edit"}).click();
  await expect(editor.getByRole("textbox", {name: "Caption text"})).toHaveCount(0);
  await editor.getByRole("button", {name: "Redo sequence edit"}).click();
  await expect(editor.getByRole("textbox", {name: "Caption text"})).toHaveValue("Sequence caption");
  await save.click();
  await expect(editor.getByText("Sequence saved.")).toBeVisible();
  const history = editor.getByRole("group", {name: "Sequence revision history"});
  await history.getByRole("button", {name: "Load sequence revisions"}).click();
  await history.getByRole("combobox", {name: "Saved revision"}).selectOption("2");
  await expect(history.getByText(/Recover this edit/)).toBeVisible();
  await history.getByRole("button", {name: "Restore revision to editor"}).click();
  await expect(title).toHaveValue("Recover this edit");
  expect((await (await page.request.get(base)).json()).version).toBe(4);
});
