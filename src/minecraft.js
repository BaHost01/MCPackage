import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CACHE_TTL = 6 * 60 * 60 * 1000;
const SOURCE = 'https://feedback.minecraft.net/hc/en-us/categories/115000410252-Knowledge-Base';
const FALLBACK = {
  stable: '26.50',
  preview: '26.60.23',
  minEngineVersion: [1, 26, 50],
  source: 'fallback',
};

function cacheFile() {
  const root = process.platform === 'win32'
    ? process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    : process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(root, 'mcpackage', 'minecraft-versions.json');
}

function numericParts(value) {
  return String(value).split('.').map(Number).filter(Number.isFinite);
}

function compareVersion(a, b) {
  const aa = numericParts(a); const bb = numericParts(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const d = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function extractVersions(html) {
  const stable = [...html.matchAll(/Minecraft:\s*Bedrock Edition\s+(\d+\.\d+(?:\.\d+)?)/gi)]
    .map((m) => m[1]).filter((v) => /^26\./.test(v));
  const preview = [];
  for (const match of html.matchAll(/Minecraft\s+Beta\s*&\s*Preview\s*-\s*(\d+\.\d+)(?:\.(\d+)(?:\/(\d+))?)?/gi)) {
    const base = match[1];
    if (!base.startsWith('26.')) continue;
    if (match[2]) preview.push(`${base}.${match[2]}`);
    if (match[3]) preview.push(`${base}.${match[3]}`);
    if (!match[2]) preview.push(base);
  }

  const latestStable = stable.sort(compareVersion).at(-1) || FALLBACK.stable;
  const latestPreview = preview.sort(compareVersion).at(-1) || FALLBACK.preview;
  const parts = numericParts(latestStable);
  return {
    stable: latestStable,
    preview: latestPreview,
    minEngineVersion: [1, parts[1] ?? 26, parts[2] ?? 0],
    source: 'minecraft-feedback',
    fetchedAt: new Date().toISOString(),
  };
}

async function readCache() {
  try {
    const data = JSON.parse(await fs.readFile(cacheFile(), 'utf8'));
    if (Date.now() - Date.parse(data.fetchedAt) < CACHE_TTL) return data;
  } catch {}
  return null;
}

async function writeCache(data) {
  try {
    const file = cacheFile();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
  } catch {}
}

export async function getMinecraftVersions({ timeout = 2500, force = false } = {}) {
  if (!force) {
    const cached = await readCache();
    if (cached) return cached;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(SOURCE, {
      signal: controller.signal,
      headers: { 'user-agent': 'mcpackage/4.x (+https://github.com/BaHost01/MCPackage)' },
    });
    if (!response.ok) throw new Error(`Minecraft version source returned HTTP ${response.status}`);
    const data = extractVersions(await response.text());
    await writeCache(data);
    return data;
  } catch {
    return (await readCache()) || FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}
