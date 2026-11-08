import { execFileSync, spawnSync } from "node:child_process";
import { test, expect } from "@playwright/test";

test("arrange private audio with a waveform, fades, mix controls and timed lyrics", async ({page}) => {
  test.skip(spawnSync("ffmpeg", ["-version"]).status !== 0, "Requires FFmpeg for a test tone.");
  const api = "http://127.0.0.1:8012/api/v1";
  const username = `session${Date.now()}`;
  const email = `${username}@example.com`;
  const password = "Fixture-only-password-123!";
  expect((await page.request.post(`${api}/auth/register`, {data: {username, email, password}})).status()).toBe(201);
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", {exact: true}).fill(password);
  await page.getByRole("button", {name: "Sign in", exact: true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const response = await page.request.post(`${api}/projects`, {data: {name: "Music session fixture", project_type: "music"}});
  const {id} = await response.json();
  const wave = execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-f", "wav", "pipe:1"]);
  const upload = await page.request.post(`${api}/projects/${id}/audio`, {
    multipart: {file: {name: "Tone.wav", mimeType: "audio/wav", buffer: wave}},
  });
  expect(upload.status()).toBe(201);
  await page.goto(`/projects/${id}/music`);
  const studio = page.getByRole("region", {name: "Music session"});
  await studio.getByRole("button", {name: "Open music session"}).click();
  await studio.getByRole("combobox", {name: "Private audio source"}).selectOption({label: "Tone.wav"});
  await studio.getByRole("button", {name: "Add track to session"}).click();
  await expect(studio.getByRole("img", {name: "Audio source waveform"})).toBeVisible();
  await studio.getByRole("spinbutton", {name: "Source start (s)"}).fill("0.2");
  await studio.getByRole("spinbutton", {name: "Source end (s)"}).fill("2.8");
  await studio.getByRole("spinbutton", {name: "Timeline start (s)"}).fill("0.1");
  await studio.getByRole("spinbutton", {name: "Fade in (s)"}).fill("0.2");
  await studio.getByRole("spinbutton", {name: "Fade out (s)"}).fill("0.3");
  await studio.getByRole("slider", {name: "Track volume"}).press("ArrowLeft");
  await studio.getByRole("checkbox", {name: "Solo track"}).check();
  await studio.getByRole("button", {name: "Add lyric section"}).click();
  await studio.getByLabel("Section name").fill("Intro");
  await studio.getByRole("textbox", {name: "Lyrics", exact: true}).fill("The opening line");
  await studio.getByRole("spinbutton", {name: "Lyric starts (s)"}).fill("0.1");
  await studio.getByRole("spinbutton", {name: "Lyric ends (s)"}).fill("2.5");
  await studio.getByRole("button", {name: "Save music session"}).click();
  await expect(studio.getByText("Music session saved.")).toBeVisible();
  await page.reload();
  await studio.getByRole("button", {name: "Open music session"}).click();
  await expect(studio.getByRole("spinbutton", {name: "Fade out (s)"})).toHaveValue("0.3");
  await expect(studio.getByRole("checkbox", {name: "Solo track"})).toBeChecked();
  await studio.getByRole("button", {name: "Preview session mix"}).click();
  await expect(studio.getByText("Playing this section")).toBeVisible();
});
