# mcpackage

**The zero-dependency command line toolkit for Minecraft Bedrock add-ons.**
Scaffold a project, generate entities/items/blocks, lint it, build `.mcaddon`
files and hot-deploy to the game — from one small tool that works the way
Minecraft actually works in 2026.

```
$ mcpackage init my-addon
$ cd my-addon
$ mcpackage add entity ghost
$ mcpackage watch          # deploys to Minecraft on every save
$ mcpackage build          # dist/My_Addon-v1.0.0.mcaddon
```

- **No dependencies.** Installs in a second, nothing to audit, nothing to break.
- **Up to date.** Targets Minecraft Bedrock 26.40 (`min_engine_version`
  1.26.40, `@minecraft/server` 2.9.0) and the GDK `com.mojang` location that
  Windows builds have used since 1.21.120.
- **Catches real mistakes.** `lint` explains *why* the game rejected your pack
  before you tab over to find a pink-and-black cube.
- **Scriptable.** Every command has `--json`; exit codes are meaningful; runs
  fine in CI.

## Install

Requires Node.js 20 or newer.

```sh
npm install -g mcpackage
# or run without installing
npx mcpackage --help
```

Both `mcpackage` and the shorter `mcpkg` are installed.

## Quick tour

### 1. Create a project

```sh
mcpackage init            # interactive wizard
mcpackage init -y         # accept defaults
mcpackage init cool-mobs -n "Cool Mobs" --namespace cool --scripts -y
```

You get:

```
cool-mobs/
├── mcpackage.json              project configuration (with JSON schema)
├── packs/
│   ├── behavior/
│   │   ├── manifest.json       generated, UUIDs stable across regenerations
│   │   ├── pack_icon.png
│   │   ├── scripts/main.js     (with --scripts)
│   │   └── texts/en_US.lang
│   └── resource/
│       ├── manifest.json       depends on the behavior pack and vice versa
│       ├── pack_icon.png
│       ├── textures/item_texture.json
│       ├── textures/terrain_texture.json
│       └── texts/en_US.lang
├── .gitignore
└── README.md
```

### 2. Add content

```sh
mcpackage add entity ghost        # BP entity + spawn rules + loot table + RP client entity, model, texture
mcpackage add item ruby           # item + 16×16 texture + item_texture.json entry + translation
mcpackage add block ruby_ore      # block + texture + terrain_texture.json + blocks.json sound
mcpackage add recipe ruby_sword   # shaped recipe (--shapeless for shapeless)
mcpackage add function greet      # functions/greet.mcfunction
mcpackage add script main         # enables the Script API and wires manifest dependencies
mcpackage add animation ghost     # animation + animation controller
mcpackage add particle sparkle
mcpackage add loot_table treasure
mcpackage add pack resource       # add a pack folder that was skipped during init
```

Everything generated is valid and visible in-game immediately (placeholder
textures are generated for you), and each command tells you how to try it:

```
✔ Added entity cool:ghost
  • packs/behavior/entities/ghost.json
  • packs/behavior/spawn_rules/ghost.json
  • packs/behavior/loot_tables/entities/ghost.json
  • packs/resource/entity/ghost.entity.json
  • packs/resource/models/entity/ghost.geo.json
  • packs/resource/textures/entity/ghost.png
  • packs/resource/texts/en_US.lang (+ entity.cool:ghost.name)

  Summon it in-game with /summon cool:ghost or use the spawn egg in the creative inventory.
```

Existing files are never overwritten unless you pass `--force`.

### 3. Lint

```sh
mcpackage lint            # exit code 1 on errors
mcpackage lint --strict   # warnings fail too
mcpackage lint --rule texture/ --json
```

```
packs/behavior/items/broken.json
  ✖ error  invalid JSON at line 7, column 3: Expected double-quoted property name json/syntax
packs/behavior/items/ruby.json
  ✖ error  duplicate identifier "cool:ruby" (also defined in packs/behavior/items/dup.json) content/duplicate-identifier
packs/behavior/items/dup.json
  ▲ warning  texture short name "cool:missing" is not defined in textures/item_texture.json texture/undefined-shortname
packs/resource/manifest.json
  ▲ warning  header.version [1,0,0] differs from project version 1.1.0 — run `mcpackage manifest` to sync manifest/out-of-sync

✖ 2 errors, 2 warnings (41 files in 18 ms)
```

Checks include: manifest structure/UUIDs/versions/dependencies, JSON syntax
(comments and trailing commas are allowed, as in the game), `format_version`
presence, identifier format and namespace, duplicate identifiers, texture
atlas short names and missing texture files, PNG validity and size, `.lang`
syntax and `languages.json`, script entry points, `require()` and legacy
`mojang-minecraft` imports, undeclared script modules, shared UUIDs between
packs, junk files, and paths with spaces or uppercase letters (which break on
Android/iOS).

### 4. Build

```sh
mcpackage build                    # dist/Cool_Mobs-v1.0.0.mcaddon
mcpackage build --type pack        # one .mcpack per pack
mcpackage build --type both --out release
mcpackage build --reproducible     # byte-identical output for CI
```

`build` lints first and refuses to package a broken project (`--skip-lint` to
override). `.DS_Store`, `Thumbs.db`, `*.psd`, `*.bbmodel`, markdown and
anything in `build.exclude` or a pack's `.mcpackageignore` are left out.

### 5. Deploy & watch

```sh
mcpackage deploy                   # → development_behavior_packs / development_resource_packs
mcpackage deploy --preview         # Minecraft Preview
mcpackage deploy --target "D:\com.mojang"
mcpackage watch                    # re-deploy on every change (lint-gated)
mcpackage watch --build            # rebuild dist/ instead
```

On Windows the com.mojang folder is found automatically — the GDK location
(`%APPDATA%\Minecraft Bedrock\Users\Shared\games\com.mojang`) first, the legacy
UWP one second. On other systems pass `--target` or set `MCPACKAGE_COM_MOJANG`.
After deploying, open a world's settings in Minecraft and add the packs from
the *Behavior Packs* / *Resource Packs* tabs.

### 6. Everything else

| Command | What it does |
| --- | --- |
| `mcpackage version [patch\|minor\|major\|x.y.z]` | Show or bump the version; syncs every manifest |
| `mcpackage config [key] [value]` | Read or write settings (`config authors "Ana, Ben"`, `config --edit`) |
| `mcpackage manifest` | Regenerate manifests from `mcpackage.json` (UUIDs preserved) |
| `mcpackage experimental` | Manage manifest capabilities and stable/beta script modules |
| `mcpackage stats` | Content counts, sizes, script modules (`--files` for a full listing) |
| `mcpackage inspect <file>` | Look inside any `.mcaddon`/`.mcpack`/`.mcworld` and validate its manifests |
| `mcpackage doctor` | Check Node, Minecraft folders and project health |
| `mcpackage clean` | Remove `dist/` and stray archives |
| `mcpackage migrate` | Upgrade a project made with v2 of this tool |

Global options on every command: `--json`, `--quiet`, `--verbose`,
`--no-color`, `-C <dir>`, `--help`.

## Configuration

`mcpackage.json` (editor autocompletion via the bundled JSON schema):

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/BaHost01/MCPackage/master/schema/mcpackage.schema.json",
  "name": "Cool Mobs",
  "namespace": "cool",
  "description": "Adds friendly ghosts",
  "version": "1.0.0",
  "minEngineVersion": "1.26.40",
  "authors": ["Ana"],
  "license": "MIT",
  "url": "https://example.com",
  "packs": {
    "behavior": "packs/behavior",
    "resource": "packs/resource"
  },
  "scripts": {                          // omit to disable the Script API
    "entry": "scripts/main.js",
    "modules": {
      "@minecraft/server": "2.9.0",     // use "2.10.0-beta" to require the Beta APIs experiment
      "@minecraft/server-ui": "2.1.0"
    }
  },
  "capabilities": [],                   // e.g. ["script_eval"]
  "build": {
    "outDir": "dist",
    "exclude": ["**/*.bbmodel"],        // globs relative to each pack
    "linkPacks": true                   // BP and RP depend on each other
  }
}
```

Manifests are derived from this file. Anything mcpackage does not manage
(subpacks, `pack_scope`, dependencies you add by hand, extra metadata) is
preserved when it rewrites them.

## Using it in CI

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 22 }
- run: npx mcpackage lint --strict
- run: npx mcpackage build --reproducible
- uses: actions/upload-artifact@v4
  with: { path: dist/*.mcaddon }
```

## Upgrading from v2 (`mc-bedrock-cli`)

```sh
npm uninstall -g mc-bedrock-cli
npm install -g mcpackage
cd my-old-project
mcpackage migrate
```

`migrate` converts `mc-config.json` → `mcpackage.json`, moves
`behavior_pack/` and `resource_pack/` under `packs/`, deletes the obsolete
`.mc-audit.json`, and regenerates manifests while keeping your UUIDs so
existing worlds still find the packs. Pass `--keep-layout` to leave the
folders where they are. Command mapping:

| v2 | v3 |
| --- | --- |
| `mc init` / `mc config` | `mcpackage init` / `mcpackage config` |
| `mc audit`, `mc validate` | `mcpackage lint` |
| `mc compile` | `mcpackage build` |
| `mc deploy`, `mc watch` | `mcpackage deploy`, `mcpackage watch` |
| `mc manifest`, `mc update` | `mcpackage manifest` |
| `mc version` | `mcpackage version` |
| `mc experimental` | `mcpackage experimental` (now writes real capabilities) |
| `mc list`, `mc stats`, `mc search` | `mcpackage stats [--files]`, your editor's search |
| `mc clean` | `mcpackage clean` |

## Development

```sh
git clone https://github.com/BaHost01/MCPackage.git
cd MCPackage
npm test              # node --test, no dependencies to install
node bin/mcpackage.js --help
```

Layout: `bin/mcpackage.js` (entry) → `src/cli.js` (dispatch) →
`src/commands/*.js` (one file per command) → `src/lib/*.js` (project model,
manifest generation, linter, zip writer, PNG generator, templates, terminal
helpers). Facts about Minecraft that change between game updates live in
`src/lib/bedrock.js`.

## License

[MIT](LICENSE)
