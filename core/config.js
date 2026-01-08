import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { handleError, logSuccess, logWarn } from './utils.js';

export default function(program) {
  program
    .command('config')
    .description('Edit mc-config.json interactively')
    .action(async () => {
      try {
        const cfgPath = path.resolve('mc-config.json');
        if (!await fs.pathExists(cfgPath)) {
          logWarn('mc-config.json not found. Run `mc init` or create one first.');
          return;
        }
        const cfg = await fs.readJSON(cfgPath);
        const answers = await inquirer.prompt([
          { name: 'name', message: 'Name', default: cfg.name || '' },
          { name: 'namespace', message: 'Namespace (for identifiers)', default: cfg.namespace || 'custom' },
          { name: 'description', message: 'Description', default: cfg.description || '' },
          { name: 'version', message: 'Version', default: cfg.version || '1.0.0' },
          { name: 'minEngineVersion', message: 'Min Engine Version', default: cfg.minEngineVersion || '1.21.0' },
          { name: 'author', message: 'Author', default: cfg.author || '' }
        ]);
        await fs.writeJSON(cfgPath, answers, { spaces: 2 });
        logSuccess('mc-config.json updated');
      } catch (err) {
        handleError('Error editing config', err);
      }
    });
}
