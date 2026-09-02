# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [3.0.0] – 2026-09-02

A ground-up rewrite. The package is now called **mcpackage** (binaries
`mcpackage` and `mcpkg`) and has **zero runtime dependencies**.

### Added
- `mcpackage init` – interactive project wizard (or `-y` for defaults) that
  creates config, both packs, manifests, translation files, a pack icon and,
  optionally, a Script API entry point with `jsconfig.json` for IntelliSense.
- `mcpackage add <type> <name>` – scaffolds ready-to-run content: `entity`
  (behavior + client entity, geometry, texture, spawn rules, loot table),
  `item`, `block` (with texture-atlas and `blocks.json` wiring), `recipe`,
  `loot_table`, `function`, `script`, `animation`, `particle` and `pack`.
  Translation strings are appended automatically.
- `mcpackage lint` – 30+ checks: JSON syntax with exact line/column (comments
  and trailing commas allowed, like the game), manifest validity, duplicate or
  malformed identifiers, undefined texture short names, missing texture files,
  invalid/oversized PNGs, junk files, spaces/uppercase in paths, `require()` or
  legacy `mojang-minecraft` imports in scripts, undeclared script module
  dependencies, shared UUIDs between packs, `.lang` syntax and more.
  `--strict`, `--rule <prefix>`, `--json`.
- `mcpackage build` – produces `.mcaddon` and/or `.mcpack` files with a
  built-in zip writer; lints first; honours `build.exclude` and per-pack
  `.mcpackageignore`; `--reproducible` gives byte-identical output.
- `mcpackage deploy` – auto-detects the com.mojang folder for the **GDK**
  build of Minecraft (`%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang`)
  with fallback to the legacy UWP path, supports `--preview`, `--target` and
  `MCPACKAGE_COM_MOJANG`, and removes stale files from previous deployments.
- `mcpackage watch` – debounced re-deploy (or `--build`) on change, with lint
  gating so broken packs are never pushed to the game.
- `mcpackage inspect <file>` – lists packs inside any `.mcaddon`/`.mcpack`/
  `.mcworld`, prints manifest details and validates them.
- `mcpackage doctor` – environment and project health report.
- `mcpackage migrate` – one-command upgrade from the v2 layout
  (`mc-config.json`, `behavior_pack/`, `.mc-audit.json`) preserving UUIDs.
- `mcpackage experimental` – manages real manifest `capabilities` and switches
  script modules between stable and beta channels.
- `mcpackage config` – read/write individual settings (`config name "X"`,
  `config authors "A, B"`, `config --edit`).
- `--json` output on every command, `--quiet`, `--verbose`, `--no-color`,
  `-C <dir>`, `NO_COLOR`/`FORCE_COLOR` support, "did you mean" suggestions,
  distinct exit codes (1 = failure, 2 = usage error).
- JSON schema for `mcpackage.json` (`schema/mcpackage.schema.json`).
- Test suite (`npm test`, Node's built-in runner) and CI workflow.

### Changed
- Project layout is now `mcpackage.json` + `packs/behavior` + `packs/resource`
  + `dist/`. The old layout keeps working; `mcpackage migrate` converts it.
- Manifests are generated from config and kept in sync by `build`, `deploy`,
  `watch`, `version` and `config`. Behavior and resource packs depend on each
  other (`build.linkPacks: false` to opt out). Existing UUIDs, subpacks and
  user-added dependencies are preserved.
- Default `min_engine_version` and content `format_version` are `1.26.40`
  (Minecraft Bedrock 26.40); default script modules are
  `@minecraft/server@2.9.0` and `@minecraft/server-ui@2.1.0`.
- Version bumps update `header.version`, every `modules[].version` and the
  cross-pack dependency version.

### Removed
- `audit`, `list`, `search`, `update` and the `.mc-audit.json` file. Their
  useful parts live on in `lint`, `stats`, `manifest` and `config`.
- Runtime dependencies (`commander`, `inquirer`, `chalk`, `archiver`,
  `fast-glob`, `fs-extra`) and the committed `node_modules/`.
- The old `experimental` behaviour that wrote non-existent flags such as
  `beta_apis: true` into `capabilities` (Minecraft ignores those; the real
  switch is the world experiment plus a `*-beta` script module version).

### Fixed
- `deploy` no longer targets only the obsolete UWP folder on Windows.
- `compile` no longer writes archives that double-nest pack folders or include
  editor junk, and no longer refuses to run without a "audit" file.
- Manifest `capabilities` is written as the array Minecraft expects.

## [2.2.0] and earlier

See the Git history for the previous `mc-bedrock-cli` implementation.

[3.0.0]: https://github.com/BaHost01/MCPackage/releases/tag/v3.0.0
