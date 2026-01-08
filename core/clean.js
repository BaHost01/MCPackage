import fs from 'fs-extra';
import path from 'path';
import glob from 'fast-glob';
import { handleError, logSuccess, logStep, logInfo } from './utils.js';

export default function(program) {
  program
    .command('clean')
    .description('Remove generated .mcaddon and .mcpack files')
    .action(async () => {
      try {
        const root = path.resolve('.');
        logStep('Cleaning build artifacts...');

        const artifacts = await glob(['*.mcaddon', '*.mcpack'], { cwd: root });

        if (artifacts.length === 0) {
          logInfo('No artifacts found to clean.');
          return;
        }

        for (const file of artifacts) {
          await fs.remove(path.join(root, file));
          logInfo(`Removed: ${file}`);
        }

        logSuccess('Cleanup complete.');
      } catch (err) {
        handleError('Error during cleanup', err);
      }
    });
}
