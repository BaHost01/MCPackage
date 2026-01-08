import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { handleError, logSuccess, logWarn, logStep, logInfo } from './utils.js';

export default function(program) {
  program
    .command('update')
    .description('Sync mc-config.json with all manifests and update engine version')
    .option('-e, --engine <version>', 'Target a specific min engine version')
    .action(async (options) => {
      try {
        const root = path.resolve('.');
        const cfgPath = path.join(root, 'mc-config.json');

        if (!await fs.pathExists(cfgPath)) {
          return handleError('Update failed', 'mc-config.json not found.');
        }

        const cfg = await fs.readJSON(cfgPath);
        
        if (options.engine) {
          cfg.minEngineVersion = options.engine;
          await fs.writeJSON(cfgPath, cfg, { spaces: 2 });
          logSuccess(`Updated mc-config.json engine version to: ${options.engine}`);
        }

        logStep('Syncing config to manifests...');
        const versionArray = cfg.version.split('.').map(Number);
        const engineArray = cfg.minEngineVersion.split('.').map(Number);

        let updatedCount = 0;
        for (const pack of ['behavior_pack', 'resource_pack']) {
          const mfPath = path.join(root, pack, 'manifest.json');
          if (await fs.pathExists(mfPath)) {
            const manifest = await fs.readJSON(mfPath);
            
            // Sync basic info
            manifest.header = manifest.header || {};
            manifest.header.version = versionArray;
            manifest.header.min_engine_version = engineArray;
            manifest.header.description = cfg.description;
            
            if (manifest.modules) {
              manifest.modules.forEach(m => {
                m.version = versionArray;
                m.description = cfg.description;
              });
            }

            await fs.writeJSON(mfPath, manifest, { spaces: 2 });
            logInfo(`Synced ${pack}/manifest.json`);
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          logSuccess('Project manifests are now in sync with mc-config.json');
        } else {
          logWarn('No manifests found to sync. Run `mc manifest` first.');
        }

      } catch (err) {
        handleError('Error during update', err);
      }
    });
}
