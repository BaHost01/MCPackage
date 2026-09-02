#!/usr/bin/env node
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  process.stderr.write(`mcpackage requires Node.js 20 or newer (you have ${process.versions.node}).\n`);
  process.exit(1);
}

const { run } = await import('../src/cli.js');
const code = await run(process.argv.slice(2));
process.exitCode = code;
