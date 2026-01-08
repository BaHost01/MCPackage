import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

/**
 * Handle errors consistently across the CLI.
 * @param {string} context - Where the error occurred.
 * @param {Error|string} err - The error object or message.
 * @param {boolean} [exit=true] - Whether to exit the process.
 */
export function handleError(context, err, exit = true) {
  const msg = err instanceof Error ? err.stack || err.message : err;
  console.error(chalk.red.bold(`\n✖ ${context}:`), chalk.red(msg));
  if (exit) process.exit(1);
}

/**
 * Log a success message.
 * @param {string} msg - The message to log.
 */
export function logSuccess(msg) {
  console.log(chalk.green(`✓ ${msg}`));
}

/**
 * Log an info message.
 * @param {string} msg - The message to log.
 */
export function logInfo(msg) {
  console.log(chalk.cyan(`ℹ ${msg}`));
}

/**
 * Log a warning message.
 * @param {string} msg - The message to log.
 */
export function logWarn(msg) {
  console.log(chalk.yellow(`⚠ ${msg}`));
}

/**
 * Log a step in a process.
 */
export function logStep(msg) {
  console.log(chalk.magenta(`➤ ${msg}`));
}

/**
 * Validate the project configuration.
 * @param {Object} cfg - The configuration object.
 * @returns {boolean} - True if valid, throws error otherwise.
 */
export function validateConfig(cfg) {
  if (!cfg.name) throw new Error('Config missing "name"');
  if (!cfg.version) throw new Error('Config missing "version"');
  if (!cfg.minEngineVersion) throw new Error('Config missing "minEngineVersion"');
  return true;
}

/**
 * Generate a UUID V4 (simple implementation for manifest)
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
