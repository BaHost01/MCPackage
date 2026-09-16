# mcpackage

**mcpackage 4** is a zero-dependency Node.js CLI for building Minecraft Bedrock add-ons without a framework-sized toolchain.

## Why v4

The rewrite makes the project smaller at the core and easier to extend:

- native Node.js APIs only
- one project model and one manifest pipeline
- deterministic, dependency-free ZIP generation
- JSON output for CI and automation
- clear command boundaries
- cross-platform filesystem handling
- generated content starts valid and minimal

## Install

```sh
npm install -g mcpackage
```

## Quick start

```sh
mcpackage init my-addon
cd my-addon
mcpackage add entity ghost
mcpackage add item ruby
mcpackage add block ruby_ore
mcpackage lint
mcpackage build
```

The build produces `dist/<namespace>-<version>.mcaddon`.

## Commands

| Command | Purpose |
|---|---|
| `init` | scaffold a project |
| `add entity\|item\|block\|recipe <name>` | generate content |
| `lint` | validate JSON, manifests and paths |
| `build` | lint and package packs |
| `manifest` | regenerate linked manifests |
| `stats` | inspect project size and health |
| `doctor` | diagnose Node/project setup |
| `config <key> [value]` | read/write project settings |
| `clean` | remove `dist/` |
| `version` | print mcpackage version |

Every command supports `--json`. Use `-C <dir>` to operate on another project.

## Project layout

```text
my-addon/
├── mcpackage.json
└── packs/
    ├── behavior/
    │   ├── manifest.json
    │   ├── entities/
    │   ├── items/
    │   ├── blocks/
    │   └── recipes/
    └── resource/
        └── manifest.json
```

## Design

```text
bin/mcpackage.js
       ↓
src/cli.js
       ↓
core.js ─ project.js ─ lint.js
              │
        commands/content
              │
          build.js → zip.js
```

The architecture intentionally avoids a large dependency graph. Minecraft-specific behavior belongs in small generators instead of being spread through the CLI.

## CI

```sh
npx mcpackage lint --json
npx mcpackage build --json
```

A non-zero exit code means the command failed. JSON mode is designed for wrappers, editors and CI systems.

## License

MIT
