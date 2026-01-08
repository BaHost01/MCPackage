import fs from 'fs-extra';
import path from 'path';
import glob from 'fast-glob';
import chalk from 'chalk';
import { handleError, logStep, logInfo } from './utils.js';

export default function(program) {
  program
    .command('stats')
    .description('Show project statistics (entities, items, blocks, etc.)')
    .action(async () => {
      try {
        const root = path.resolve('.');
        logStep('Gathering project statistics...');

        const counts = {
          entities: (await glob('behavior_pack/entities/*.json', { cwd: root })).length,
          items: (await glob('behavior_pack/items/*.json', { cwd: root })).length,
          blocks: (await glob('behavior_pack/blocks/*.json', { cwd: root })).length,
          functions: (await glob('behavior_pack/functions/**/*.mcfunction', { cwd: root })).length,
          animations: (await glob('behavior_pack/animations/*.json', { cwd: root })).length,
          animation_controllers: (await glob('behavior_pack/animation_controllers/*.json', { cwd: root })).length,
          loot_tables: (await glob('behavior_pack/loot_tables/**/*.json', { cwd: root })).length,
          recipes: (await glob('behavior_pack/recipes/*.json', { cwd: root })).length,
          textures: (await glob('resource_pack/textures/**/*.{png,jpg,tga}', { cwd: root })).length,
          models: (await glob('resource_pack/models/**/*.json', { cwd: root })).length
        };

        console.log('');
        console.log(chalk.bold('--- Project Statistics ---'));
        Object.entries(counts).forEach(([key, val]) => {
          if (val > 0) {
            const label = key.replace(/_/g, ' ').toUpperCase();
            console.log(`${chalk.cyan(label.padEnd(25))} : ${chalk.yellow(val)}`);
          }
        });
        
        const totalFiles = (await glob('**/*', { cwd: root, ignore: ['node_modules/**', '.git/**'] })).length;
        console.log(chalk.gray('--------------------------'));
        console.log(`${chalk.white('TOTAL PROJECT FILES'.padEnd(25))} : ${chalk.green(totalFiles)}`);
        console.log('');

      } catch (err) {
        handleError('Error gathering stats', err);
      }
    });
}
