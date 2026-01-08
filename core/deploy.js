import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { handleError, logSuccess, logInfo, validateConfig } from './utils.js';

export default function(program) {
  program
    .command('deploy')
    .description('Deploy behavior and resource packs to Minecraft development folders')
    .option('-p, --path <path>', 'Custom path to com.mojang folder')
    .action(async (options) => {
      try {
        const root = path.resolve('.');
        const cfgPath = path.join(root, 'mc-config.json');

        if (!await fs.pathExists(cfgPath)) {
          return handleError('Deployment failed', 'mc-config.json not found. Run `mc init` first.');
        }

        const cfg = await fs.readJSON(cfgPath);
        validateConfig(cfg);

        // Determine com.mojang path
        let mojangPath = options.path;
        if (!mojangPath) {
          if (os.platform() === 'win32') {
            mojangPath = path.join(
              os.homedir(),
              'AppData',
              'Local',
              'Packages',
              'Microsoft.MinecraftUWP_8wekyb3d8bbwe',
              'LocalState',
              'games',
              'com.mojang'
            );
          } else {
            return handleError('Deployment failed', 'Auto-detection of com.mojang is only supported on Windows. Use --path to specify it manually.');
          }
        }

        if (!await fs.pathExists(mojangPath)) {
          return handleError('Deployment failed', `Could not find com.mojang at: ${mojangPath}`);
        }

        const devBP = path.join(mojangPath, 'development_behavior_packs', cfg.name);
        const devRP = path.join(mojangPath, 'development_resource_packs', cfg.name);

        const bpSource = path.join(root, 'behavior_pack');
        const rpSource = path.join(root, 'resource_pack');

        let deployedCount = 0;

        if (await fs.pathExists(bpSource)) {
          logInfo(`Deploying Behavior Pack to: ${devBP}`);
          await fs.copy(bpSource, devBP, { overwrite: true });
          deployedCount++;
        }

        if (await fs.pathExists(rpSource)) {
          logInfo(`Deploying Resource Pack to: ${devRP}`);
          await fs.copy(rpSource, devRP, { overwrite: true });
          deployedCount++;
        }

        if (deployedCount === 0) {
          logInfo('Nothing to deploy (no behavior_pack or resource_pack folders found).');
        } else {
          logSuccess('Deployment successful!');
        }
      } catch (err) {
        handleError('Error during deployment', err);
      }
    });
}
