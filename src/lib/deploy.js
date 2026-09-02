/**
 * Deploys packs to Minecraft's development folders so the game picks them up
 * without importing an archive.
 */
import path from 'node:path';
import { comMojangCandidates } from './bedrock.js';
import { CliError } from './errors.js';
import { copyDir, createMatcher, ensureDir, exists, isDirectory, remove } from './fs.js';
import { JUNK_PATTERNS } from './bedrock.js';
import { archiveFolderName, collectPackFiles } from './build.js';

/**
 * Resolves the com.mojang folder to use.
 * Priority: explicit path → $MCPACKAGE_COM_MOJANG → first existing platform candidate.
 */
export async function resolveComMojang({ explicit, preview = false, env = process.env } = {}) {
  const tried = [];
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (env.MCPACKAGE_COM_MOJANG) candidates.push(env.MCPACKAGE_COM_MOJANG);
  candidates.push(...comMojangCandidates({ preview, env }));

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    tried.push(resolved);
    if (await isDirectory(resolved)) return { path: resolved, tried };
  }
  const hint =
    process.platform === 'win32'
      ? 'Launch Minecraft once so the folder is created, or pass --target <path-to-com.mojang>.'
      : 'Minecraft Bedrock is not natively available on this OS. Pass --target <path-to-com.mojang> (e.g. a mounted Windows/Android folder or an mcpelauncher data directory), or set MCPACKAGE_COM_MOJANG.';
  throw new CliError(`Could not find a com.mojang folder.\n  Tried:\n${tried.map((t) => `    - ${t}`).join('\n')}`, { hint });
}

/**
 * Copies every existing pack into the matching development_*_packs folder.
 * @returns {Promise<{ kind: string, target: string, files: number }[]>}
 */
export async function deployProject(project, { comMojang, clean = true, dryRun = false } = {}) {
  const packs = await project.existingPacks();
  if (packs.length === 0) throw new CliError('Nothing to deploy: no pack folders exist.');
  for (const pack of packs) {
    if (!(await exists(pack.manifestFile))) {
      throw new CliError(`${pack.relDir}/manifest.json is missing.`, { hint: 'Run `mcpackage manifest` first.' });
    }
  }
  const results = [];
  const junk = createMatcher([...JUNK_PATTERNS, ...project.config.build.exclude]);
  for (const pack of packs) {
    const target = path.join(comMojang, pack.devFolder, archiveFolderName(project, pack));
    const files = (await collectPackFiles(pack, { exclude: project.config.build.exclude })).length;
    if (!dryRun) {
      if (clean) await remove(target);
      await ensureDir(target);
      await copyDir(pack.dir, target, { filter: (rel) => !junk(rel) && !junk(`${rel}/`) });
    }
    results.push({ kind: pack.kind, target, files });
  }
  return results;
}
