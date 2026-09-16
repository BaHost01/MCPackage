import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const REGISTRY = 'https://registry.npmjs.org/mcpackage/latest';

async function fetchLatest() {
  const response = await fetch(REGISTRY, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
  const data = await response.json();
  return data.version;
}

function compare(a, b) {
  const aa = String(a).split('.').map(Number);
  const bb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const d = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export async function checkForUpdate(currentVersion, { interactive = true } = {}) {
  if (!interactive || process.env.MCPACKAGE_NO_UPDATE_CHECK === '1') return { checked: false, update: false };
  try {
    const latest = await fetchLatest();
    if (!latest || compare(latest, currentVersion) <= 0) return { checked: true, update: false, latest };

    process.stdout.write(`\nA new MCPackage version is available: ${currentVersion} → ${latest}.\nUpdate now? [Y/n] `);
    const answer = await new Promise((resolve) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      const onData = (chunk) => { data += chunk; if (/\r?\n/.test(data)) { process.stdin.off('data', onData); resolve(data.trim()); } };
      process.stdin.on('data', onData);
    });
    if (answer && !/^y(es)?$/i.test(answer)) return { checked: true, update: true, updated: false, latest };

    await exec(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '-g', `mcpackage@${latest}`], { stdio: 'inherit' });
    process.stdout.write(`Updated MCPackage to ${latest}.\n\n`);
    return { checked: true, update: true, updated: true, latest };
  } catch {
    return { checked: false, update: false };
  }
}
