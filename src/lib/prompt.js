/**
 * Interactive prompts built on node:readline. Falls back to defaults when
 * stdin is not a TTY (CI, pipes) so commands never hang.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { c, sym } from './term.js';

export function isInteractive() {
  return Boolean(stdin.isTTY && stdout.isTTY) && !process.env.CI;
}

let rl = null;

function getInterface() {
  if (!rl) {
    rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
    rl.on('SIGINT', () => {
      stdout.write('\n');
      process.exit(130);
    });
  }
  return rl;
}

export function closePrompts() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * Asks for a line of text.
 * @param {string} message
 * @param {{ default?: string, validate?: (value: string) => string | true, required?: boolean }} [options]
 */
export async function ask(message, { default: fallback = '', validate, required = false } = {}) {
  if (!isInteractive()) return fallback;
  const suffix = fallback ? c.dim(` (${fallback})`) : '';
  for (;;) {
    const answer = (await getInterface().question(`${c.green('?')} ${c.bold(message)}${suffix} `)).trim();
    const value = answer || fallback;
    if (required && !value) {
      stdout.write(`  ${c.red(sym.err)} A value is required.\n`);
      continue;
    }
    if (validate) {
      const result = validate(value);
      if (result !== true) {
        stdout.write(`  ${c.red(sym.err)} ${result}\n`);
        continue;
      }
    }
    return value;
  }
}

/** Yes/no question. */
export async function confirm(message, { default: fallback = true } = {}) {
  if (!isInteractive()) return fallback;
  const hint = fallback ? 'Y/n' : 'y/N';
  const answer = (await getInterface().question(`${c.green('?')} ${c.bold(message)} ${c.dim(`[${hint}]`)} `)).trim().toLowerCase();
  if (!answer) return fallback;
  return answer === 'y' || answer === 'yes';
}

/**
 * Pick one item from a list by number.
 * @param {string} message
 * @param {{ value: string, label: string, hint?: string }[]} choices
 */
export async function select(message, choices, { default: fallback } = {}) {
  const defaultIndex = Math.max(0, choices.findIndex((ch) => ch.value === fallback));
  if (!isInteractive()) return choices[defaultIndex].value;
  stdout.write(`${c.green('?')} ${c.bold(message)}\n`);
  choices.forEach((choice, i) => {
    const marker = i === defaultIndex ? c.cyan('›') : ' ';
    stdout.write(`  ${marker} ${c.cyan(String(i + 1))}. ${choice.label}${choice.hint ? c.dim(` — ${choice.hint}`) : ''}\n`);
  });
  for (;;) {
    const answer = (await getInterface().question(`  ${c.dim(`Choice [${defaultIndex + 1}]:`)} `)).trim();
    if (!answer) return choices[defaultIndex].value;
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && choices[index]) return choices[index].value;
    const byValue = choices.find((ch) => ch.value === answer);
    if (byValue) return byValue.value;
    stdout.write(`  ${c.red(sym.err)} Enter a number between 1 and ${choices.length}.\n`);
  }
}

/**
 * Pick any number of items from a list (comma-separated numbers).
 * @returns {Promise<string[]>}
 */
export async function multiSelect(message, choices, { default: fallback = [] } = {}) {
  if (!isInteractive()) return fallback;
  stdout.write(`${c.green('?')} ${c.bold(message)} ${c.dim('(comma-separated numbers, empty for none)')}\n`);
  choices.forEach((choice, i) => {
    const checked = fallback.includes(choice.value) ? c.green('◉') : c.dim('◯');
    stdout.write(`  ${checked} ${c.cyan(String(i + 1))}. ${choice.label}${choice.hint ? c.dim(` — ${choice.hint}`) : ''}\n`);
  });
  for (;;) {
    const answer = (await getInterface().question(`  ${c.dim('Selection:')} `)).trim();
    if (!answer) return fallback;
    if (answer === '*' || answer.toLowerCase() === 'all') return choices.map((ch) => ch.value);
    const picks = answer.split(/[\s,]+/).filter(Boolean);
    const values = [];
    let bad = null;
    for (const pick of picks) {
      const index = Number(pick) - 1;
      const choice = Number.isInteger(index) && choices[index] ? choices[index] : choices.find((ch) => ch.value === pick);
      if (!choice) {
        bad = pick;
        break;
      }
      if (!values.includes(choice.value)) values.push(choice.value);
    }
    if (bad) {
      stdout.write(`  ${c.red(sym.err)} "${bad}" is not a valid choice.\n`);
      continue;
    }
    return values;
  }
}
