import fs from 'fs-extra';
import path from 'path';
import glob from 'fast-glob';
import chalk from 'chalk';
import { handleError, logWarn, logInfo, logStep } from './utils.js';

export default function(program) {
  program
    .command('list')
    .description('List files and their status in the project')
    .action(async () => {
      try {
        const root = path.resolve('.');
        const auditPath = path.join(root, '.mc-audit.json');
        
        if (!await fs.pathExists(auditPath)) {
          logWarn('No .mc-audit.json found. Run `mc audit .` first.');
          return;
        }

        const audit = await fs.readJSON(auditPath);
        logStep(`Listing project contents (Audit v${audit.version}):`);

        const files = await glob('**/*', { 
          cwd: root, 
          ignore: ['node_modules/**', '.git/**'],
          onlyFiles: false
        });

        for (const file of files) {
          const fullPath = path.join(root, file);
          const stats = await fs.stat(fullPath);
          const type = stats.isDirectory() ? '[DIR]' : '[FILE]';
          const size = stats.isDirectory() ? '' : ` (${(stats.size / 1024).toFixed(2)} KB)`;
          
          console.log(` ${chalk.gray(type)} ${file}${chalk.blue(size)}`);
        }

      } catch (err) {
        handleError('Error listing', err);
      }
    });
}
