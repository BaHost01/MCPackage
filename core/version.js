import fs from 'fs-extra';
import path from 'path';
import { handleError, logSuccess, logStep, logInfo } from './utils.js';

export default function(program) {
  program
    .command('version [bump]')
    .description('Bump project version (patch, minor, major) or set a specific version')
    .action(async (bump = 'patch') => {
      try {
        const root = path.resolve('.');
        const cfgPath = path.join(root, 'mc-config.json');

        if (!await fs.pathExists(cfgPath)) {
          return handleError('Version bump failed', 'mc-config.json not found.');
        }

        const cfg = await fs.readJSON(cfgPath);
        const oldVersion = cfg.version;
        let [major, minor, patch] = oldVersion.split('.').map(Number);

        if (bump === 'major') major++;
        else if (bump === 'minor') minor++;
        else if (bump === 'patch') patch++;
        else if (/^\d+\.\d+\.\d+$/.test(bump)) {
          [major, minor, patch] = bump.split('.').map(Number);
        } else {
          return handleError('Invalid bump type', 'Use patch, minor, major, or a specific x.y.z version.');
        }

        const newVersion = `${major}.${minor}.${patch}`;
        cfg.version = newVersion;
        await fs.writeJSON(cfgPath, cfg, { spaces: 2 });
        logSuccess(`Project version bumped: ${oldVersion} -> ${newVersion}`);

        // Sync with manifests if they exist
        logStep('Syncing version with manifests...');
        const vArray = [major, minor, patch];
        
        for (const pack of ['behavior_pack', 'resource_pack']) {
          const mfPath = path.join(root, pack, 'manifest.json');
          if (await fs.pathExists(mfPath)) {
            const manifest = await fs.readJSON(mfPath);
            if (manifest.header) manifest.header.version = vArray;
            if (manifest.modules) {
              manifest.modules.forEach(m => m.version = vArray);
            }
            await fs.writeJSON(mfPath, manifest, { spaces: 2 });
            logInfo(`Updated version in ${pack}/manifest.json`);
          }
        }

      } catch (err) {
        handleError('Error bumping version', err);
      }
    });
}
