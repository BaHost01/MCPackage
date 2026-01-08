import fs from 'fs-extra';
import path from 'path';
import inquirer from 'inquirer';
import { handleError, logSuccess, logInfo, logStep } from './utils.js';

export default function(program) {
  program
    .command('init')
    .description('Initialize a new Minecraft Bedrock project')
    .option('-y, --yes', 'Skip prompts and use default values')
    .action(async (options) => {
      try {
        const root = path.resolve('.');
        const cfgPath = path.join(root, 'mc-config.json');

        if (await fs.pathExists(cfgPath)) {
          logInfo('mc-config.json already exists. Use "mc config" to edit it.');
          return;
        }

        let config = {
          name: path.basename(root),
          namespace: 'custom',
          description: 'A Minecraft Bedrock Addon',
          version: '1.0.0',
          minEngineVersion: '1.21.0',
          author: 'you'
        };

        if (!options.yes) {
          config = await inquirer.prompt([
            { name: 'name', message: 'Project Name:', default: config.name },
            { name: 'namespace', message: 'Project Namespace:', default: config.namespace },
            { name: 'description', message: 'Description:', default: config.description },
            { name: 'version', message: 'Version:', default: config.version },
            { name: 'minEngineVersion', message: 'Min Engine Version:', default: config.minEngineVersion },
            { name: 'author', message: 'Author:', default: config.author }
          ]);
        }

        await fs.writeJSON(cfgPath, config, { spaces: 2 });
        
        // Create folder structure
        await fs.ensureDir(path.join(root, 'behavior_pack'));
        await fs.ensureDir(path.join(root, 'resource_pack'));

        logSuccess('Project initialized successfully!');
        
        // Run manifest command logic internally or just tell the user
        logInfo('Created: mc-config.json, behavior_pack/, resource_pack/');
        logStep('Tip: Run `mc manifest` to generate manifest.json files.');
      } catch (err) {
        handleError('Error initializing project', err);
      }
    });
}
