import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const next = fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url));
const command = process.argv[2];
if (!['build','start'].includes(command)) throw new Error('Choose build or start.');
const args = command === 'start' ? ['start','--hostname','127.0.0.1','--port','3012'] : ['build'];
const result = spawnSync(process.execPath, [next,...args], {stdio:'inherit', env:{...process.env,
  INDAVERSE_E2E:'1', NODE_ENV:'production', NEXT_PUBLIC_API_URL:'http://127.0.0.1:8012'}});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
