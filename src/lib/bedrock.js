/**
 * Facts about Minecraft Bedrock Edition that the CLI relies on. Everything
 * version-specific lives here so it can be bumped in one place.
 *
 * Verified against Minecraft Bedrock 26.40 (released 2026-08-04). The game's
 * internal/engine version is still expressed as `1.26.x`, which is what
 * `min_engine_version` and `format_version` use.
 */

/** Latest stable engine version, as used for `min_engine_version`. */
export const LATEST_ENGINE_VERSION = '1.26.40';

/** Default `format_version` for newly scaffolded content JSON (entities, items, blocks). */
export const CONTENT_FORMAT_VERSION = '1.26.40';

/** Latest stable script module versions shipped with the game. */
export const SCRIPT_MODULES = {
  '@minecraft/server': { stable: '2.9.0', beta: '2.10.0-beta' },
  '@minecraft/server-ui': { stable: '2.1.0', beta: '2.2.0-beta' },
  '@minecraft/server-net': { stable: null, beta: '1.0.0-beta' },
  '@minecraft/server-admin': { stable: null, beta: '1.0.0-beta' },
  '@minecraft/server-gametest': { stable: null, beta: '1.0.0-beta' },
  '@minecraft/debug-utilities': { stable: null, beta: '1.0.0-beta' },
};

/** Pack kinds supported by the CLI and their manifest module type. */
export const PACK_TYPES = {
  behavior: { moduleType: 'data', label: 'Behavior pack', suffix: 'BP', devFolder: 'development_behavior_packs' },
  resource: { moduleType: 'resources', label: 'Resource pack', suffix: 'RP', devFolder: 'development_resource_packs' },
  skin: { moduleType: 'skin_pack', label: 'Skin pack', suffix: 'Skins', devFolder: 'development_skin_packs' },
};

/**
 * Manifest capabilities that can be toggled. Only the ones Minecraft actually
 * reads from `capabilities` are listed – the old "beta_apis" style flags that
 * older tools wrote there are world experiments, not manifest capabilities.
 */
export const CAPABILITIES = {
  script_eval: 'Allow eval()/Function() in scripts (not permitted on Marketplace)',
  chemistry: 'Enable Education Edition chemistry features (resource packs)',
  editorExtension: 'Mark the pack as a Bedrock Editor extension',
  experimental_custom_ui: 'Allow HTML/JS custom UI (legacy, experimental)',
  raytraced: 'Pack contains ray-tracing (RTX) materials',
  pbr: 'Pack contains physically based rendering textures',
};

/** Top-level behavior pack folders and what they contain (used by `stats`/`lint`). */
export const BEHAVIOR_FOLDERS = {
  entities: 'Entity behaviors',
  items: 'Items',
  blocks: 'Blocks',
  recipes: 'Recipes',
  loot_tables: 'Loot tables',
  trading: 'Trade tables',
  functions: 'Functions (.mcfunction)',
  scripts: 'Scripts',
  spawn_rules: 'Spawn rules',
  animations: 'Animations (BP)',
  animation_controllers: 'Animation controllers (BP)',
  features: 'Features',
  feature_rules: 'Feature rules',
  biomes: 'Biomes',
  dialogue: 'Dialogue',
  structures: 'Structures',
  cameras: 'Camera presets',
  aim_assist: 'Aim assist',
  item_catalog: 'Item catalog',
  worldgen: 'World generation',
  texts: 'Translations',
};

/** Top-level resource pack folders. */
export const RESOURCE_FOLDERS = {
  textures: 'Textures',
  models: 'Models',
  entity: 'Client entities',
  attachables: 'Attachables',
  animations: 'Animations',
  animation_controllers: 'Animation controllers',
  render_controllers: 'Render controllers',
  particles: 'Particles',
  sounds: 'Sounds',
  ui: 'UI',
  fogs: 'Fog settings',
  materials: 'Materials',
  font: 'Fonts',
  items: 'Legacy client items',
  texts: 'Translations',
  block_culling: 'Block culling rules',
  atmospherics: 'Atmosphere settings',
  color_grading: 'Color grading',
  lighting: 'Lighting settings',
  pbr: 'PBR settings',
  water: 'Water settings',
  cameras: 'Camera presets (client side)',
  credits: 'Credits',
};

/** Files that must never end up inside a shipped pack. */
export const JUNK_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.swp',
  '*~',
  '.git',
  'node_modules',
  '*.psd',
  '*.xcf',
  '*.bbmodel',
  '*.kra',
  '*.ase',
  '*.aseprite',
];

/** Identifier rules: `namespace:name`, lowercase, no `minecraft` namespace for custom content. */
export const IDENTIFIER_RE = /^[a-z0-9_.-]+:[a-z0-9_.\-/]+$/;
export const NAMESPACE_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Locates the Minecraft `com.mojang` folders on this machine.
 * Returns candidates in priority order (existence is *not* checked here).
 * @param {{ platform?: string, home?: string, env?: NodeJS.ProcessEnv, preview?: boolean }} [options]
 */
export function comMojangCandidates({ platform = process.platform, home, env = process.env, preview = false } = {}) {
  const os = platform;
  const homeDir = home ?? env.HOME ?? env.USERPROFILE ?? '';
  const candidates = [];

  if (os === 'win32') {
    const appData = env.APPDATA || `${homeDir}\\AppData\\Roaming`;
    const localAppData = env.LOCALAPPDATA || `${homeDir}\\AppData\\Local`;
    // GDK builds (1.21.120+, i.e. every 26.x release) store creator content here.
    const gdkName = preview ? 'Minecraft Bedrock Preview' : 'Minecraft Bedrock';
    candidates.push(`${appData}\\${gdkName}\\Users\\Shared\\games\\com.mojang`);
    // Legacy UWP location, still used by older installs.
    const uwpPackage = preview ? 'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe' : 'Microsoft.MinecraftUWP_8wekyb3d8bbwe';
    candidates.push(`${localAppData}\\Packages\\${uwpPackage}\\LocalState\\games\\com.mojang`);
  } else if (os === 'darwin') {
    // No native macOS Bedrock; these are common emulator/third-party locations.
    candidates.push(`${homeDir}/Library/Application Support/mcpelauncher/games/com.mojang`);
  } else if (os === 'linux') {
    candidates.push(`${homeDir}/.local/share/mcpelauncher/games/com.mojang`);
    candidates.push(`${homeDir}/.var/app/io.mrarm.mcpelauncher/data/mcpelauncher/games/com.mojang`);
  } else if (os === 'android') {
    candidates.push('/storage/emulated/0/Android/data/com.mojang.minecraftpe/files/games/com.mojang');
    candidates.push('/storage/emulated/0/games/com.mojang');
  }
  return candidates;
}
