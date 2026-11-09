import { readFile } from "node:fs/promises";
import { test, expect, type Page } from '@playwright/test';
const api = 'http://127.0.0.1:8012/api/v1';
async function account(page: Page) {
  const suffix = `${Date.now()}${Math.floor(Math.random()*10000)}`;
  const credentials = {email: `browser${suffix}@example.com`, password: 'Fixture-only-password-123!'};
  const registered = await page.request.post(`${api}/auth/register`, {data: {...credentials, username: `browser${suffix}`}});
  expect(registered.status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password', {exact: true}).fill(credentials.password);
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return credentials;
}

test('public help categories, examples, search and mobile navigation', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/help');
  await page.getByRole('button', {name:'Game Studio',exact:true}).click();
  await page.getByLabel('Search explanations and examples').fill('Dimension and genre');
  await page.getByText('Dimension and genre', {exact:true}).click();
  await expect(page.getByText(/2D \+ Puzzle/)).toBeVisible();
  await page.getByLabel('Search explanations and examples').fill('no-such-topic-zz');
  await expect(page.getByText(/No matches/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('login, private demo creation, save, reload and stale conflict', async ({page}) => {
  await account(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'Create private Zamara demo'}).click();
  await expect(page).toHaveURL(/\/projects\/\d+\/game$/);
  const projectId = /projects\/(\d+)/.exec(page.url())![1];
  await expect(page.getByLabel('Game title', {exact:true})).toHaveValue(/LEGENDS OF ZAMARA/);
  await page.getByLabel('Game title', {exact:true}).fill('Zamara browser verified');
  await page.getByRole('button', {name:'Save blueprint',exact:true}).click();
  await expect(page.getByText('Game blueprint saved. Version 2.', {exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Game title', {exact:true})).toHaveValue('Zamara browser verified');
  const latest = await (await page.request.get(`${api}/projects/${projectId}/game`)).json();
  const {version} = latest;
  const draft = Object.fromEntries(Object.entries(latest).filter(([key]) => !['version','project_id','created_at','updated_at'].includes(key)));
  const stale = await page.request.put(`${api}/projects/${projectId}/game`, {data:{...draft,title:'Do not overwrite',expected_version:version-1}});
  expect(stale.status()).toBe(409);
  const scene = await page.request.get(`${api}/projects/${projectId}/game/scene`);
  expect((await scene.json()).layout.collectibles).toHaveLength(3);
});

test('story import, explicit apply, recovery and manual save', async ({page}) => {
  await account(page);
  const created = await page.request.post(`${api}/projects`, {data:{name:'Browser story',project_type:'story'}});
  const {id} = await created.json();
  await page.goto(`/projects/${id}/story`);
  await expect(page.getByLabel('Title', {exact:true})).toBeVisible();
  await page.getByLabel('Title', {exact:true}).fill('Recovery working text');
  await page.getByRole('checkbox', {name:'Enable browser recovery for this visit'}).check();
  await expect(page.getByText(/Browser recovery updated at/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', {name:'Review recovery',exact:true}).first().click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'Apply reviewed draft',exact:true}).click();
  await expect(page.getByLabel('Title', {exact:true})).toHaveValue('Recovery working text');
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'story.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({title:'Imported browser manuscript',chapters:[{id:'first',title:'First light',content:'A beacon returned to the village.'}]}))});
  await expect(page.getByRole('heading', {name:'Review: story.json'})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'Apply reviewed draft',exact:true}).click();
  await page.getByRole('button', {name:'Save story',exact:true}).click();
  await expect(page.getByText('Story saved.', {exact:true})).toBeVisible();
  expect((await (await page.request.get(`${api}/projects/${id}/story`)).json()).version).toBe(1);
  await page.reload();
  await expect(page.getByLabel('Title', {exact:true})).toHaveValue('Imported browser manuscript');
});

for (const studio of ['video','software'] as const) test(`${studio} import validation, apply and save`, async ({page}) => {
  await account(page);
  const response = await page.request.post(`${api}/projects`, {data:{name:`Browser ${studio}`,project_type:studio === 'software' ? 'website' : 'video'}});
  const {id} = await response.json();
  await page.goto(`/projects/${id}/${studio}`);
  await page.locator('input[type=file][accept=".json,application/json"]').setInputFiles({name:'draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({title:`Verified ${studio}`}))});
  await expect(page.getByRole('heading', {name:'Review: draft.json'})).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name:'Apply reviewed draft',exact:true}).click();
  await page.getByRole('button', {name:studio === 'video' ? 'Save video' : 'Save blueprint',exact:true}).click();
  await expect.poll(async () => (await page.request.get(`${api}/projects/${id}/${studio}`)).status()).toBe(200);
});


test('music title save persists after reload', async ({page}) => {
  await account(page);
  const response = await page.request.post(`${api}/projects`, {data:{name:'Browser song',project_type:'music'}});
  const {id} = await response.json();
  await page.goto(`/projects/${id}/music`);
  await page.getByLabel('Song Title', {exact:true}).fill('Zamara dawn chorus');
  await page.getByRole('button', {name:'Save Song',exact:true}).click();
  await expect.poll(async () => (await page.request.get(`${api}/projects/${id}/music`)).status()).toBe(200);
  await page.reload();
  await expect(page.getByLabel('Song Title', {exact:true})).toHaveValue('Zamara dawn chorus');
});

test('demo scene starts, pauses, collects all gems, wins and restarts in WebGL', async ({page}) => {
  await account(page);
  const response = await page.request.post(`${api}/projects/demo/zamara`);
  const {id} = await response.json();
  await page.goto(`/projects/${id}/game/play`);
  await expect(page.getByRole('button', {name:'Start',exact:true})).toBeEnabled();
  await page.getByRole('button', {name:'Start',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'playing / Gems'})).toBeVisible();
  await page.getByRole('button', {name:'Pause',exact:true}).click();
  await expect(page.getByRole('button', {name:'Resume',exact:true})).toBeEnabled();
  await page.getByRole('button', {name:'Resume',exact:true}).click();
  await page.keyboard.down('ArrowRight');
  try { await expect(page.getByRole('status').filter({hasText:'Completed! All gems collected and exit reached.'})).toBeVisible({timeout:15000}); }
  finally { await page.keyboard.up('ArrowRight'); }
  await page.screenshot({path:'test-results/zamara-completed.png',fullPage:true});
  await page.getByRole('button', {name:'Restart',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Gems 0 of 3'})).toBeVisible();
});

test('status page identifies API without exposing private configuration', async ({page}) => {
  await page.goto('/status');
  await expect(page.getByText('Checks finished', {exact:true})).toBeVisible();
  await expect(page.getByText('IndaVerse API responding', {exact:true})).toBeVisible();
  await expect(page.getByText(/SECRET_KEY|DATABASE_URL|postgresql\+psycopg/)).toHaveCount(0);
});

test('autosave uses current version and failed manual save preserves working text', async ({page}) => {
  await account(page);
  const response=await page.request.post(`${api}/projects/demo/zamara`);
  const {id}=await response.json();
  await page.goto(`/projects/${id}/game`);
  await page.getByRole('checkbox',{name:'Enable server autosave for this visit'}).check();
  await page.getByLabel('Game title',{exact:true}).fill('Autosave persistence check');
  await expect.poll(async()=> (await (await page.request.get(`${api}/projects/${id}/game`)).json()).version,{timeout:25000}).toBe(2);
  await page.getByRole('checkbox',{name:'Enable server autosave for this visit'}).uncheck();
  await page.route(`**/api/v1/projects/${id}/game`,route=>route.request().method()==='PUT' ? route.abort() : route.continue());
  await page.getByLabel('Game title',{exact:true}).fill('Keep this unsaved title');
  await page.getByRole('button',{name:'Save blueprint',exact:true}).click();
  await expect(page.getByText(/Autosave is off after a save error/)).toBeVisible();
  await expect(page.getByLabel('Game title',{exact:true})).toHaveValue('Keep this unsaved title');
});

test('archive and reopen a private saved copy, then verify the downloaded blueprint', async ({page}) => {
  await account(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', {name: 'Create private Zamara demo'}).click();
  await expect(page).toHaveURL(/\/projects\/\d+\/game$/);
  const source = /projects\/(\d+)/.exec(page.url())![1];
  await page.goto(`/projects/${source}`);
  await page.getByRole('button', {name: 'Archive project', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Unarchive project', exact: true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', {name: 'Unarchive project', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Duplicate saved content'}).click();
  const copyLink = page.getByRole('link', {name: /^Open .*\(copy\)$/});
  await expect(copyLink).toBeVisible();
  const copyPath = (await copyLink.getAttribute('href'))!;
  expect(copyPath).not.toBe(`/projects/${source}`);
  await page.goto('/dashboard');
  const sourceCard = page.getByRole('article').filter({has: page.locator(`a[href="/projects/${source}"]`)});
  await expect(sourceCard).toHaveCount(0);
  await page.getByLabel('Project status').selectOption('archived');
  await expect(sourceCard).toBeVisible();
  await page.goto(`${copyPath}/game`);
  await expect(page.getByLabel('Game title', {exact: true})).toHaveValue(/LEGENDS OF ZAMARA/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Export draft', exact: true}).click();
  const exported = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(exported.format).toBe('indaverse-game-blueprint');
  expect(exported.format_version).toBe(1);
  expect(exported.source_project_id).toBe(Number(copyPath.split('/').at(-1)));
  expect(exported.blueprint.title).toMatch(/LEGENDS OF ZAMARA/);
});

test("reorder chapters, review continuity and download a saved EPUB", async ({page}) => {
  await account(page);
  const response = await page.request.post(`${api}/projects`, {data: {name: "Manuscript fixture", project_type: "story"}});
  const {id} = await response.json();
  const base = `${api}/projects/${id}/story`;
  expect((await page.request.put(base, {data: {expected_version: 0, title: "Manuscript fixture", chapters: [
    {id: "a", title: "Opening", content: "First words."},
    {id: "b", title: "New ending", content: "", status: "complete"},
  ]}})).status()).toBe(200);
  await page.goto(`/projects/${id}/story`);
  await page.getByRole("button", {name: /2\. New ending/}).click();
  await page.getByRole("combobox", {name: "Chapter position"}).selectOption("0");
  await page.getByRole("spinbutton", {name: "Word target"}).fill("450");
  await page.getByRole("button", {name: "Review continuity"}).click();
  await expect(page.getByText(/marked complete but has no text/)).toBeVisible();
  await page.getByRole("button", {name: "Save story", exact: true}).click();
  await expect.poll(async () => (await (await page.request.get(base)).json()).chapters[0]?.id).toBe("b");
  await expect(page.getByText("0 words / 450 target in this chapter")).toBeVisible();
  await page.getByRole("button", {name: "Prepare EPUB manuscript"}).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("link", {name: "Download EPUB manuscript"}).click();
  expect((await pending).suggestedFilename()).toBe("indaverse-manuscript-v2.epub");
});

test("apply playable templates and exercise a saved 3D checkpoint and objective", async ({page}) => {
  await account(page);
  const create = async (dimension: string) => {
    const response = await page.request.post(`${api}/projects`, {data: {name: "Template fixture", project_type: "game"}});
    const {id} = await response.json();
    expect((await page.request.put(`${api}/projects/${id}/game`, {
      data: {expected_version: 0, title: "Template fixture", dimension},
    })).status()).toBe(200);
    return id;
  };
  const flat = await create("2d");
  await page.goto(`/projects/${flat}/game/layout`);
  await page.getByRole("button", {name: "Use Ground sprint"}).click();
  await page.getByRole("button", {name: "Save layout", exact: true}).click();
  await expect(page.getByText(/Saved version 1/)).toBeVisible();
  const spatial = await create("3d");
  await page.goto(`/projects/${spatial}/game/scene`);
  await page.getByRole("button", {name: "Use Checkpoint courtyard"}).click();
  await page.getByRole("spinbutton", {name: "Gems required (blank for all)"}).fill("0");
  await page.getByRole("button", {name: "Save scene", exact: true}).click();
  await expect(page.getByText(/Saved scene version 1/)).toBeVisible();
  await page.goto(`/projects/${spatial}/game/play`);
  await page.getByRole("button", {name: "Start", exact: true}).click();
  await page.keyboard.down("ArrowUp");
  try {
    await expect(page.getByText("Checkpoint reached", {exact: true})).toBeVisible();
    await expect(page.getByText("Completed! Gem objective met and exit reached.")).toBeVisible();
  } finally { await page.keyboard.up("ArrowUp"); }
});

test("save a Zamara playtest and complete the downloaded browser build offline", async ({page, context}, testInfo) => {
  await account(page);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", {name: "Create private Zamara demo"}).click();
  await expect(page).toHaveURL(/\/projects\/\d+\/game$/);
  await page.goto(page.url() + "/play");
  await page.getByRole("button", {name: "Start", exact: true}).click();
  await page.keyboard.down("ArrowRight");
  try {await expect(page.getByText(/Completed! All gems/)).toBeVisible();}
  finally {await page.keyboard.up("ArrowRight");}
  await page.getByLabel("Playtest note").fill("Zamara browser rehearsal");
  await page.getByRole("button", {name: "Save playtest report"}).click();
  await expect(page.getByText("Zamara browser rehearsal", {exact: true})).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download offline browser build"}).click();
  const file = testInfo.outputPath("playable.html");
  await (await download).saveAs(file);
  const {pathToFileURL} = await import("node:url");
  const offline = await context.newPage();
  await offline.route(/^https?:/, route => route.abort());
  await offline.goto(pathToFileURL(file).href);
  await offline.getByRole("button", {name: "Start / resume"}).click();
  await offline.keyboard.down("ArrowRight");
  try {await expect(offline.getByRole("status")).toHaveText(/Completed! · Gems 3 \/ 3/);}
  finally {await offline.keyboard.up("ArrowRight");}
  await offline.close();
});

test("add a page template, validate a broken link, and download a corrected site", async ({page}) => {
  await account(page);
  const created = await page.request.post(api + "/projects", {data: {name: "Delivery site", project_type: "website"}});
  const {id} = await created.json();
  await page.goto(`/projects/${id}/software`);
  await page.getByRole("button", {name: "Add template page"}).click();
  await page.getByLabel("Internal link target (optional)").first().fill("/missing");
  await page.getByRole("button", {name: "Save blueprint", exact: true}).click();
  await page.getByRole("button", {name: "Check saved links"}).click();
  await expect(page.getByText("/missing does not match", {exact: false})).toBeVisible();
  await page.getByLabel("Internal link target (optional)").first().fill("/about");
  await page.getByRole("button", {name: "Save blueprint", exact: true}).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download static site ZIP"}).click();
  expect((await download).suggestedFilename()).toBe("indaverse-site.zip");
});

test("review a local adapter draft, link a private image and export a scheduled handoff", async ({page}) => {
  await account(page);
  const created = await page.request.post(api + "/projects", {data: {name: "Campaign fixture", project_type: "story"}});
  const {id} = await created.json();
  const image = await page.request.post(`${api}/projects/${id}/images`, {multipart: {
    label: "Promotion still", category: "reference", file: {name: "pixel.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNukAAAAASUVORK5CYII=", "base64")},
  }});
  expect(image.status()).toBe(201);
  await page.goto(`/projects/${id}/campaign`);
  await page.getByLabel("Short campaign brief").fill("Zamara launch");
  await page.getByLabel("Run the local adapter once for this brief").check();
  await page.getByRole("button", {name: "Generate review drafts"}).click();
  await page.getByRole("button", {name: "Add suggestion 1 as unsaved post"}).click();
  await page.getByLabel("Local date and time").fill("2026-11-20T09:00");
  await page.getByText("Linked images and video sources (0)").click();
  await page.getByRole("button", {name: "Load project assets"}).click();
  await page.getByRole("combobox", {name: "Asset", exact: true}).selectOption({label: "Image: Promotion still"});
  await page.getByRole("button", {name: "Link asset"}).click();
  await page.getByRole("button", {name: "Save campaign", exact: true}).click();
  await expect(page.getByText("Campaign saved.", {exact: true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", {name: /2026-11-20 09:00 \(Africa\/Lagos\)/})).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Download campaign handoff"}).click();
  const body = JSON.parse(await readFile((await (await download).path())!, "utf-8"));
  expect(body.posts[0].assets).toHaveLength(1);
  expect(body.delivery).toBe("manual");
});

test('billing shows private wallet, quotas and unapproved NGN prices', async ({page}) => {
  await account(page);
  await page.getByRole('link', {name: 'Credits and plans', exact: true}).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole('heading', {name: 'Your wallet · Free'})).toBeVisible();
  await expect(page.getByText(/0 used · 5 remaining/)).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Creator Pro'})).toBeVisible();
  await expect(page.getByText('Monthly: Not set · Annual: Not set').first()).toBeVisible();
  await expect(page.getByText('No credit transactions yet.')).toBeVisible();
});
