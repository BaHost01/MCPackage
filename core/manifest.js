import fs from 'fs-extra';
import path from 'path';
import { handleError, logSuccess, logStep, generateUUID } from './utils.js';

export default function(program) {
  program
    .command('manifest')
    .description('Generate manifest.json for behavior and resource packs')
    .action(async () => {
      try {
        const root = path.resolve('.');
        const cfgPath = path.join(root, 'mc-config.json');

        if (!await fs.pathExists(cfgPath)) {
          return handleError('Manifest failed', 'mc-config.json not found. Run `mc init` first.');
        }

        const cfg = await fs.readJSON(cfgPath);
        const version = cfg.version.split('.').map(Number);

        const createManifest = async (packPath, type) => {
          if (!await fs.pathExists(packPath)) return;

          logStep(`Generating manifest for ${type}...`);
          const manifestPath = path.join(packPath, 'manifest.json');
          
          let existing = {};
          if (await fs.pathExists(manifestPath)) {
            existing = await fs.readJSON(manifestPath);
          }

          const manifest = {
            format_version: 2,
            header: {
              description: cfg.description,
              name: `${cfg.name} ${type === 'data' ? 'BP' : 'RP'}`,
              uuid: existing.header?.uuid || generateUUID(),
              version: version,
              min_engine_version: cfg.minEngineVersion.split('.').map(Number)
            },
            modules: [
              {
                description: cfg.description,
                type: type,
                uuid: existing.modules?.[0]?.uuid || generateUUID(),
                version: version
              }
            ]
          };

          await fs.writeJSON(manifestPath, manifest, { spaces: 2 });
          logSuccess(`${type} manifest.json created/updated.`);
        };

        await createManifest(path.join(root, 'behavior_pack'), 'data');
        await createManifest(path.join(root, 'resource_pack'), 'resources');

      } catch (err) {
        handleError('Error generating manifests', err);
      }
    });
}
