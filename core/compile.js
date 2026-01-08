import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import { handleError, logSuccess, logInfo, validateConfig, logStep } from './utils.js';

export default function(program) {
  program
    .command('compile')
    .description('Compile project into .mcaddon or .mcpack')
    .option('-t, --type <type>', 'Output type: addon, pack', 'addon')
    .action(async (options) => {
      try {
        const root = path.resolve('.');
        
        // Auto-validate first
        logStep('Validating before compilation...');
        // We'll just check for basic requirements here for simplicity in the tool call
        const auditPath = path.join(root, '.mc-audit.json');
        if (!await fs.pathExists(auditPath)) {
          return handleError('Compilation failed', 'Refusing to compile without .mc-audit.json. Run `mc audit .` first.');
        }

        const cfgPath = path.join(root, 'mc-config.json');
        if (!await fs.pathExists(cfgPath)) {
          return handleError('Compilation failed', 'mc-config.json not found. Run `mc init` first.');
        }

        const cfg = await fs.readJSON(cfgPath);
        validateConfig(cfg);
        
        const ext = options.type === 'pack' ? 'mcpack' : 'mcaddon';
        const outputFile = path.join(root, `${cfg.name.replace(/\s+/g, '_')}_v${cfg.version}.${ext}`);

        logStep(`Compiling ${options.type}...`);
        const output = fs.createWriteStream(outputFile);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
          logSuccess('Compilation successful!');
          logInfo(`Created: ${outputFile} (${archive.pointer()} bytes)`);
        });

        archive.on('error', (err) => { throw err; });
        archive.pipe(output);

        const bp = path.join(root, 'behavior_pack');
        const rp = path.join(root, 'resource_pack');

        if (await fs.pathExists(bp)) archive.directory(bp, 'behavior_pack');
        if (await fs.pathExists(rp)) archive.directory(rp, 'resource_pack');

        await archive.finalize();
      } catch (err) {
        handleError('Error compiling', err);
      }
    });
}
