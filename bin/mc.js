#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import audit from '../core/audit.js';
import list from '../core/list.js';
import compile from '../core/compile.js';
import update from '../core/update.js';
import experimental from '../core/experimental.js';
import config from '../core/config.js';
import init from '../core/init.js';
import deploy from '../core/deploy.js';
import manifest from '../core/manifest.js';
import validate from '../core/validate.js';
import version from '../core/version.js';
import watch from '../core/watch.js';
import clean from '../core/clean.js';
import stats from '../core/stats.js';
import search from '../core/search.js';

import { handleError } from '../core/utils.js';

program.name('mc').description('Minecraft Bedrock CLI (V2)').version('2.0.0');

try {
  // Register commands
  init(program);
  audit(program);
  list(program);
  compile(program);
  update(program);
  experimental(program);
  config(program);
  deploy(program);
  manifest(program);
  validate(program);
  version(program);
  watch(program);
  clean(program);
  stats(program);
  search(program);

  // default action (no args) show help
  program.action(() => program.help());
  program.parse(process.argv);
} catch (err) {
  handleError('Fatal error loading mc CLI', err);
}