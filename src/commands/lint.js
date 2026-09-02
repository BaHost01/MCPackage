import { CliError } from '../lib/errors.js';
import { lintProject, summarize } from '../lib/lint.js';
import { loadProject } from '../lib/project.js';
import { c, elapsed, log, plural, sym } from '../lib/term.js';

export default {
  name: 'lint',
  aliases: ['validate', 'check'],
  group: 'Quality',
  summary: 'Check packs for problems Minecraft would reject or silently ignore',
  usage: 'mcpackage lint [options]',
  description: `Validates manifests, JSON syntax (comments allowed), identifiers, texture
atlases, translation files, PNG dimensions, script modules and more.
Exits with code 1 when errors are found (or warnings with --strict).`,
  options: {
    strict: { type: 'boolean', description: 'Treat warnings as errors' },
    'no-info': { type: 'boolean', description: 'Hide informational hints' },
    rule: { type: 'string', description: 'Only show diagnostics for rules matching this prefix', value: '<prefix>' },
  },
  examples: ['mcpackage lint', 'mcpackage lint --strict', 'mcpackage lint --rule texture/'],
  async run({ options, cwd }) {
    const started = Date.now();
    const project = await loadProject(cwd);
    const result = await lintProject(project, { strict: options.strict });
    let diagnostics = result.diagnostics;
    if (options['no-info']) diagnostics = diagnostics.filter((d) => d.level !== 'info');
    if (options.rule) diagnostics = diagnostics.filter((d) => d.rule.startsWith(options.rule));
    const totals = summarize(result);

    if (options.json) {
      log.print(JSON.stringify({ ok: result.ok, ...totals, diagnostics }, null, 2));
      if (!result.ok) throw new CliError('', { exitCode: 1 });
      return;
    }

    if (diagnostics.length) {
      log.print('');
      let lastFile = null;
      for (const d of diagnostics) {
        if (d.file !== lastFile) {
          log.print(c.underline(d.file));
          lastFile = d.file;
        }
        const badge = d.level === 'error' ? c.red(`${sym.err} error`) : d.level === 'warning' ? c.yellow(`${sym.warn} warning`) : c.blue(`${sym.info} info`);
        log.print(`  ${badge}  ${d.message} ${c.dim(d.rule)}`);
      }
      log.print('');
    }

    const summary = [
      totals.errors ? c.red(plural(totals.errors, 'error')) : c.green('0 errors'),
      totals.warnings ? c.yellow(plural(totals.warnings, 'warning')) : '0 warnings',
      totals.infos && !options['no-info'] ? c.blue(plural(totals.infos, 'hint')) : null,
    ]
      .filter(Boolean)
      .join(', ');
    const scope = `${plural(totals.files, 'file')} in ${elapsed(started)}`;
    if (result.ok) {
      log.ok(`${summary} ${c.dim(`(${scope})`)}`);
    } else {
      log.error(`${summary} ${c.dim(`(${scope})`)}`);
      throw new CliError('', { exitCode: 1 });
    }
  },
};
