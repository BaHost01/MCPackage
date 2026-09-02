import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = path.join(ROOT, 'bin', 'mcpackage.js');

/** Creates a fresh temp directory; returns its path. */
export async function tmpdir(prefix = 'mcpackage-test-') {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Runs the CLI as a child process (stdin closed, colors off).
 * @returns {Promise<{ code: number, stdout: string, stderr: string, json: any }>}
 */
export function mcpackage(args, { cwd, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '', CI: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      let json;
      if (args.includes('--json')) {
        try {
          json = JSON.parse(stdout);
        } catch {
          json = undefined;
        }
      }
      resolve({ code, stdout, stderr, json });
    });
  });
}

export async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

export async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

export async function exists(file) {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Scaffolds a project with `init -y` and returns its root. */
export async function initProject(dir, extraArgs = []) {
  const result = await mcpackage(['init', '-y', '-n', 'Test Addon', '--namespace', 'test', ...extraArgs], { cwd: dir });
  if (result.code !== 0) throw new Error(`init failed: ${result.stderr}`);
  return dir;
}
