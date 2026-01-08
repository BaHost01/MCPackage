import fs from 'fs-extra';
import path from 'path';
import { handleError, logSuccess, logStep, logInfo } from './utils.js';

export default function(program) {
  program
    .command('audit [dir]')
    .description('Audit project and create .mc-audit.json')
    .action(async (dir = '.') => {
      try {
        const root = path.resolve(dir);
        logStep(`Auditing project at: ${root}`);

        const bpExists = await fs.pathExists(path.join(root, 'behavior_pack'));
        const rpExists = await fs.pathExists(path.join(root, 'resource_pack'));

        const audit = {
          version: 2.1,
          root,
          behavior_pack: bpExists,
          resource_pack: rpExists,
          tracked: ['behavior_pack/**', 'resource_pack/**', 'mc-config.json'],
          createdAt: new Date().toISOString(),
          system: process.platform
        };

        await fs.writeJSON(path.join(root, '.mc-audit.json'), audit, { spaces: 2 });
        
        if (bpExists) logInfo('Behavior Pack detected.');
        if (rpExists) logInfo('Resource Pack detected.');
        
        logSuccess('Project audited -> .mc-audit.json created');
      } catch (err) {
        handleError('Error auditing', err);
      }
    });
}
