import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const jsFiles = [
  'dashboard/dashboard.js',
  'dashboard/audience-dashboard.js',
  'dashboard/layout.js',
  'dashboard/commercial.js',
  'dashboard/acquisition.js',
  'dashboard/discovery.js',
  'dashboard/current-media.js',
  'dashboard/home3.js',
  'dashboard/intelligence-studio.js',
  'dashboard/rising.js',
  'dashboard/rising-notifications.js',
  'dashboard/acceleration.js',
  'dashboard/users.js',
  'dashboard/login.js'
];

for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

await mkdir('dist', { recursive: true });
const entries = await readdir('dashboard', { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const src = join('dashboard', entry.name);
  const dst = join('dist', entry.name);
  try {
    await copyFile(src, dst);
  } catch (err) {
    if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') throw err;
  }
}
console.log('Painel de eventos copiado para dist. O servidor Node continua obrigatório para banco e sincronização.');
