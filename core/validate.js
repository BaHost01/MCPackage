import fs from 'fs-extra';
import path from 'path';
import glob from 'fast-glob';
import { handleError, logSuccess, logInfo, logWarn, logStep } from './utils.js';

export default function(program) {
  program
    .command('validate')
    .description('Validate project structure and JSON files')
    .action(async () => {
      try {
        const root = path.resolve('.');
        logStep('Starting project validation...');

        let errors = 0;
        let warnings = 0;

        // 1. Check mc-config.json
        if (!await fs.pathExists(path.join(root, 'mc-config.json'))) {
          logWarn('Missing mc-config.json');
          warnings++;
        }

        // 2. Validate all JSON files
        const jsonFiles = await glob('**/*.json', { 
          cwd: root, 
          ignore: ['node_modules/**', 'package.json', 'package-lock.json'] 
        });

        for (const file of jsonFiles) {
          try {
            const content = await fs.readFile(path.join(root, file), 'utf-8');
            JSON.parse(content);
          } catch (e) {
            console.error(`  ✖ Invalid JSON: ${file} - ${e.message}`);
            errors++;
          }
        }

        // 3. Check for manifests
        const bpManifest = path.join(root, 'behavior_pack', 'manifest.json');
        const rpManifest = path.join(root, 'resource_pack', 'manifest.json');

        if (await fs.pathExists(path.join(root, 'behavior_pack')) && !await fs.pathExists(bpManifest)) {
          logWarn('behavior_pack exists but is missing manifest.json');
          warnings++;
        }
        if (await fs.pathExists(path.join(root, 'resource_pack')) && !await fs.pathExists(rpManifest)) {
          logWarn('resource_pack exists but is missing manifest.json');
          warnings++;
        }

        if (errors > 0) {
          handleError('Validation failed', `Found ${errors} error(s) and ${warnings} warning(s).`);
        } else if (warnings > 0) {
          logSuccess(`Validation complete with ${warnings} warning(s).`);
        } else {
          logSuccess('Project is valid!');
        }

      } catch (err) {
        handleError('Error during validation', err);
      }
    });
}
