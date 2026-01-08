import fs from 'fs-extra';
import path from 'path';
import { handleError, logSuccess, logInfo, logStep, logWarn } from './utils.js';
import deployLogic from './deploy.js'; // We'll need to export the logic separately or just call the command

// For watch, we can't easily import the action from the command registration because of how commander works.
// Let's create a shared deploy function in utils.js or just re-implement a simple version here.

export default function(program) {
  program
    .command('watch')
    .description('Watch for changes and auto-deploy to Minecraft')
    .option('-p, --path <path>', 'Custom path to com.mojang folder')
    .action(async (options) => {
      try {
        const root = path.resolve('.');
        logStep('Starting watcher...');
        logInfo('Watching for changes in behavior_pack/ and resource_pack/ ...');
        logInfo('Press Ctrl+C to stop.');

        let timeout;
        const debounceDeploy = () => {
          clearTimeout(timeout);
          timeout = setTimeout(async () => {
            logStep('Change detected! Deploying...');
            // We'll call a simplified deploy logic
            try {
              // This is a bit of a hack to reuse the deploy command's logic
              // In a real refactor, we'd move the logic to a service
              await program.commands.find(c => c.name() === 'deploy').parseAsync(['deploy', ...(options.path ? ['--path', options.path] : [])], { from: 'user' });
            } catch (e) {
              logWarn('Auto-deploy failed. Fix errors to resume.');
            }
          }, 500); // 500ms debounce
        };

        const watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          // Ignore build artifacts and hidden files
          if (filename.endsWith('.mcaddon') || filename.endsWith('.mcpack') || filename.startsWith('.') || filename.includes('node_modules')) {
            return;
          }
          if (filename.startsWith('behavior_pack') || filename.startsWith('resource_pack') || filename === 'mc-config.json') {
            debounceDeploy();
          }
        });

        process.on('SIGINT', () => {
          watcher.close();
          logInfo('\nWatcher stopped.');
          process.exit();
        });

      } catch (err) {
        handleError('Error in watcher', err);
      }
    });
}
