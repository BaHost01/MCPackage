import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { handleError, logSuccess, logStep, logWarn } from './utils.js';

export default function(program) {
  program
    .command('experimental')
    .description('Enable experimental / beta APIs in manifests')
    .action(async () => {
      try {
        const root = path.resolve('.');
        
        const { features } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'features',
            message: 'Select experimental features to enable:',
            choices: [
              { name: 'Gametest API', value: 'gametest' },
              { name: 'Upcoming Creator Features', value: 'upcoming_creator_features' },
              { name: 'Experimental Custom UI', value: 'experimental_custom_ui' },
              { name: 'Beta APIs', value: 'beta_apis' }
            ]
          }
        ]);

        if (features.length === 0) {
          logWarn('No features selected. Manifests unchanged.');
          return;
        }

        const capabilities = features.reduce((acc, f) => {
          acc[f] = true;
          return acc;
        }, {});

        let applied = false;
        for (const pack of ['behavior_pack', 'resource_pack']) {
          const mf = path.join(root, pack, 'manifest.json');
          if (!await fs.pathExists(mf)) continue;

          logStep(`Updating ${pack}/manifest.json...`);
          const manifest = await fs.readJSON(mf);
          
          manifest.capabilities = manifest.capabilities || [];
          // Note: In modern manifest format, capabilities can be an array of strings or an object
          // For simplicity and compatibility we'll use the object-based approach if it was already there, 
          // but Minecraft usually expects them in specific modules or as a top-level property.
          // Let's stick to the user's previous implementation style but make it cleaner.
          
          manifest.metadata = manifest.metadata || {};
          manifest.metadata.generated_with = "MC CLI V2";
          
          // Re-applying capabilities
          manifest.capabilities = Object.assign(manifest.capabilities || {}, capabilities);
          
          await fs.writeJSON(mf, manifest, { spaces: 2 });
          applied = true;
        }

        if (applied) {
          logSuccess('Experimental features enabled in manifests.');
        } else {
          logWarn('No manifests found to update. Run `mc manifest` first.');
        }

      } catch (err) {
        handleError('Error enabling experimental', err);
      }
    });
}
