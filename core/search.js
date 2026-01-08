import fs from 'fs-extra';
import path from 'path';
import glob from 'fast-glob';
import chalk from 'chalk';
import { handleError, logStep, logInfo, logSuccess } from './utils.js';

export default function(program) {
  program
    .command('search <query>')
    .description('Search for identifiers or strings in project files')
    .action(async (query) => {
      try {
        const root = path.resolve('.');
        logStep(`Searching for "${query}"...`);

        const files = await glob(['behavior_pack/**/*.json', 'resource_pack/**/*.json', 'behavior_pack/**/*.mcfunction'], { cwd: root });
        let matches = 0;

        for (const file of files) {
          const content = await fs.readFile(path.join(root, file), 'utf-8');
          if (content.includes(query)) {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (line.includes(query)) {
                console.log(`${chalk.magenta(file)}:${chalk.yellow(index + 1)} - ${chalk.gray(line.trim())}`);
                matches++;
              }
            });
          }
        }

        if (matches === 0) {
          logInfo('No matches found.');
        } else {
          logSuccess(`Found ${matches} match(es).`);
        }

      } catch (err) {
        handleError('Error during search', err);
      }
    });
}