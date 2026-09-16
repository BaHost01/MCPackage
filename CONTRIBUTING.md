# Contributing to MCPackage

Thanks for contributing to MCPackage.

## Before you start

- Check existing issues and pull requests before opening a new one.
- For bugs, include a minimal reproduction and the exact MCPackage and Node.js versions.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Development

MCPackage is a Node.js CLI with a dependency-light core. Keep changes modular and prefer Node.js built-ins when practical.

Install dependencies:

```bash
npm install
```

Run the project checks:

```bash
npm run check
npm test
```

Run the CLI locally:

```bash
node bin/mcpackage.js --help
```

## Pull requests

1. Create a focused branch from `master`.
2. Make the smallest coherent change that solves the problem.
3. Add or update tests when behavior changes.
4. Run `npm run check` and `npm test` locally.
5. Update documentation when commands, configuration, or public behavior changes.
6. Open a pull request with a clear summary and testing notes.

## Code style

- Follow the existing JavaScript style and module boundaries.
- Prefer clear names and small functions.
- Avoid unrelated refactors in feature or bug-fix pull requests.
- Do not commit credentials, tokens, generated packages, or local environment files.

## Commit messages

Use concise, descriptive commit messages. Conventional-style prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:` are recommended.
