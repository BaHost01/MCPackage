import https from 'node:https';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';

const PACKAGE = 'mcpackage';
const REGISTRY = `https://registry.npmjs.org/${PACKAGE}/latest`;

function fetchLatest() {
  return new Promise((resolve, reject) => {
    const req = https.get(REGISTRY, { headers: { accept: 'application/json' } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`npm registry returned HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(data).version); } catch { reject(new Error('Invalid npm registry response')); }
      });
    });
    req.setTimeout(2500, () => req.destroy(new Error('npm registry timeout')));
    req.on('error', reject);
  });
}

function compare(a, b) {
  const pa = String(a).split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function runNpm(args) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { stdio: 'inherit' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export async function checkForUpdate(currentVersion, { interactive = true } = {}) {
  if (!interactive || process.env.MCPACKAGE_NO_UPDATE_CHECK === '1') return { checked: false, update: false };
  try {
    const latest = await fetchLatest();
    if (compare(latest, currentVersion) <= 0) return { checked: true, update: false, current: currentVersion, latest };

    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(`\nA new MCPackage version is available: ${currentVersion} → ${latest}. Update now? [Y/n] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim() || 'y')) return { checked: true, update: true, updated: false, current: currentVersion, latest };

    const updated = await runNpm(['install', '-g', `${PACKAGE}@latest`]);
    if (updated) console.log(`MCPackage updated to ${latest}. Restart the command to use the new version.`);
    else console.error('MCPackage update failed. You can run: npm install -g mcpackage@latest');
    return { checked: true, update: true, updated, current: currentVersion, latest };
  } catch {
    return { checked: false, update: false };
  }
}
