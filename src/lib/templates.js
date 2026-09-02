/**
 * Content templates used by `init` and `add`. Every template is a function of
 * a context object so that identifiers, namespaces and versions are filled in.
 *
 * All JSON here targets Minecraft Bedrock 26.40 formats.
 */
import { CONTENT_FORMAT_VERSION, SCRIPT_MODULES } from './bedrock.js';

/** Turns `my_cool_thing` into `My Cool Thing`. */
export function titleCase(name) {
  return String(name)
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Project-level files
// ---------------------------------------------------------------------------

export function gitignore() {
  return `# mcpackage build output
dist/
*.mcaddon
*.mcpack

# OS / editor junk
.DS_Store
Thumbs.db
desktop.ini

# Dependencies (if you add a package.json for tooling)
node_modules/
`;
}

export function readme({ name, namespace }) {
  return `# ${name}

A Minecraft Bedrock add-on. Namespace: \`${namespace}\`.

## Getting started

\`\`\`sh
mcpackage lint      # check the project for problems
mcpackage build     # create dist/*.mcaddon
mcpackage deploy    # copy packs into Minecraft's development folders
mcpackage watch     # re-deploy automatically on every change
\`\`\`

## Layout

\`\`\`
packs/behavior/     behavior pack (entities, items, blocks, scripts, ...)
packs/resource/     resource pack (textures, models, sounds, ...)
mcpackage.json      project configuration
\`\`\`

Generated with [mcpackage](https://github.com/BaHost01/MCPackage).
`;
}

export function languagesJson() {
  return ['en_US'];
}

export function langFile({ name, description, kind }) {
  const suffix = kind === 'behavior' ? 'BP' : kind === 'resource' ? 'RP' : '';
  return `## ${name} ${suffix}
pack.name=${name} ${suffix}
pack.description=${description}
`;
}

// ---------------------------------------------------------------------------
// Behavior pack content
// ---------------------------------------------------------------------------

export function entityBehavior({ namespace, name }) {
  const id = `${namespace}:${name}`;
  return {
    format_version: CONTENT_FORMAT_VERSION,
    'minecraft:entity': {
      description: {
        identifier: id,
        spawn_category: 'creature',
        is_spawnable: true,
        is_summonable: true,
      },
      component_groups: {},
      components: {
        'minecraft:type_family': { family: [name, 'mob'] },
        'minecraft:collision_box': { width: 0.6, height: 1.8 },
        'minecraft:health': { value: 20, max: 20 },
        'minecraft:movement': { value: 0.25 },
        'minecraft:physics': {},
        'minecraft:jump.static': {},
        'minecraft:movement.basic': {},
        'minecraft:navigation.walk': { can_path_over_water: true, avoid_water: true },
        'minecraft:pushable': { is_pushable: true, is_pushable_by_piston: true },
        'minecraft:nameable': {},
        'minecraft:persistent': {},
        'minecraft:behavior.random_stroll': { priority: 6, speed_multiplier: 1.0 },
        'minecraft:behavior.look_at_player': { priority: 7, look_distance: 6.0, probability: 0.02 },
        'minecraft:behavior.random_look_around': { priority: 9 },
      },
      events: {},
    },
  };
}

export function entityClient({ namespace, name }) {
  const id = `${namespace}:${name}`;
  return {
    format_version: '1.10.0',
    'minecraft:client_entity': {
      description: {
        identifier: id,
        materials: { default: 'entity_alphatest' },
        textures: { default: `textures/entity/${name}` },
        geometry: { default: `geometry.${name}` },
        render_controllers: ['controller.render.default'],
        spawn_egg: { base_color: '#5ca855', overlay_color: '#2e5a2a' },
      },
    },
  };
}

/** A simple humanoid-ish cube model so the entity is visible immediately. */
export function entityGeometry({ name }) {
  return {
    format_version: '1.12.0',
    'minecraft:geometry': [
      {
        description: {
          identifier: `geometry.${name}`,
          texture_width: 64,
          texture_height: 64,
          visible_bounds_width: 2,
          visible_bounds_height: 3,
          visible_bounds_offset: [0, 1, 0],
        },
        bones: [
          {
            name: 'body',
            pivot: [0, 12, 0],
            cubes: [{ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }],
          },
          {
            name: 'head',
            parent: 'body',
            pivot: [0, 24, 0],
            cubes: [{ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }],
          },
          {
            name: 'leg_right',
            parent: 'body',
            pivot: [-1.9, 12, 0],
            cubes: [{ origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] }],
          },
          {
            name: 'leg_left',
            parent: 'body',
            pivot: [1.9, 12, 0],
            cubes: [{ origin: [-0.1, 0, -2], size: [4, 12, 4], uv: [0, 16], mirror: true }],
          },
        ],
      },
    ],
  };
}

export function spawnRules({ namespace, name }) {
  return {
    format_version: '1.8.0',
    'minecraft:spawn_rules': {
      description: { identifier: `${namespace}:${name}`, population_control: 'animal' },
      conditions: [
        {
          'minecraft:spawns_on_surface': {},
          'minecraft:brightness_filter': { min: 7, max: 15, adjust_for_weather: false },
          'minecraft:weight': { default: 8 },
          'minecraft:herd': { min_size: 2, max_size: 4 },
          'minecraft:biome_filter': { test: 'has_biome_tag', operator: '==', value: 'animal' },
        },
      ],
    },
  };
}

export function entityLootTable({ namespace, name }) {
  void namespace;
  void name;
  return {
    pools: [
      {
        rolls: 1,
        entries: [{ type: 'item', name: 'minecraft:leather', weight: 1, functions: [{ function: 'set_count', count: { min: 0, max: 2 } }] }],
      },
    ],
  };
}

export function item({ namespace, name }) {
  const id = `${namespace}:${name}`;
  return {
    format_version: CONTENT_FORMAT_VERSION,
    'minecraft:item': {
      description: {
        identifier: id,
        menu_category: { category: 'items' },
      },
      components: {
        'minecraft:icon': id,
        'minecraft:display_name': { value: `item.${id}` },
        'minecraft:max_stack_size': 64,
      },
    },
  };
}

export function block({ namespace, name }) {
  const id = `${namespace}:${name}`;
  return {
    format_version: CONTENT_FORMAT_VERSION,
    'minecraft:block': {
      description: {
        identifier: id,
        menu_category: { category: 'construction' },
      },
      components: {
        'minecraft:destructible_by_mining': { seconds_to_destroy: 1.5 },
        'minecraft:destructible_by_explosion': { explosion_resistance: 6 },
        'minecraft:friction': 0.6,
        'minecraft:map_color': '#7f7f7f',
        'minecraft:light_dampening': 15,
        'minecraft:geometry': 'minecraft:geometry.full_block',
        'minecraft:material_instances': {
          '*': { texture: id, render_method: 'opaque' },
        },
      },
    },
  };
}

export function recipeShaped({ namespace, name }) {
  const id = `${namespace}:${name}`;
  return {
    format_version: '1.20.10',
    'minecraft:recipe_shaped': {
      description: { identifier: `${namespace}:${name}_recipe` },
      tags: ['crafting_table'],
      pattern: ['###', '# #', '###'],
      key: { '#': { item: 'minecraft:stick' } },
      unlock: [{ item: 'minecraft:stick' }],
      result: { item: id, count: 1 },
    },
  };
}

export function recipeShapeless({ namespace, name }) {
  const id = `${namespace}:${name}`;
  return {
    format_version: '1.20.10',
    'minecraft:recipe_shapeless': {
      description: { identifier: `${namespace}:${name}_recipe` },
      tags: ['crafting_table'],
      ingredients: [{ item: 'minecraft:stick' }, { item: 'minecraft:planks' }],
      unlock: [{ item: 'minecraft:stick' }],
      result: { item: id, count: 1 },
    },
  };
}

export function lootTable() {
  return {
    pools: [
      {
        rolls: 1,
        entries: [{ type: 'item', name: 'minecraft:diamond', weight: 1, functions: [{ function: 'set_count', count: { min: 1, max: 1 } }] }],
      },
    ],
  };
}

export function mcfunction({ namespace, name }) {
  return `# ${namespace}:${name}
# Run in-game with: /function ${name}
tellraw @s {"rawtext":[{"text":"§a[${namespace}] §rHello from ${name}.mcfunction!"}]}
`;
}

export function tickJson(functions = []) {
  return { values: functions };
}

export function scriptMain({ namespace, name }) {
  return `import { world, system } from "@minecraft/server";

/**
 * ${name} – entry point for ${namespace}'s scripts.
 * Docs: https://learn.microsoft.com/minecraft/creator/scriptapi/minecraft/server/minecraft-server
 */

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;
  player.sendMessage(\`§a[${namespace}]§r Scripts are running. Welcome, \${player.name}!\`);
});

// Example of a repeating task: runs once per second (20 ticks).
system.runInterval(() => {
  // world.sendMessage("tick");
}, 20);
`;
}

export function scriptsPackageJson({ namespace, modules }) {
  const deps = {};
  for (const [moduleName, version] of Object.entries(modules)) {
    deps[moduleName] = version;
  }
  return {
    name: `${namespace}-scripts`,
    private: true,
    type: 'module',
    description: 'Type definitions for editor IntelliSense; not shipped with the pack.',
    dependencies: deps,
  };
}

export function jsconfig() {
  return {
    compilerOptions: {
      target: 'ES2023',
      module: 'ES2022',
      moduleResolution: 'bundler',
      checkJs: true,
      strict: false,
      noEmit: true,
      types: [],
    },
    include: ['scripts/**/*.js'],
  };
}

export function defaultScriptModules({ beta = false } = {}) {
  const channel = beta ? 'beta' : 'stable';
  return {
    '@minecraft/server': SCRIPT_MODULES['@minecraft/server'][channel],
    '@minecraft/server-ui': SCRIPT_MODULES['@minecraft/server-ui'][channel],
  };
}

export function animation({ name }) {
  return {
    format_version: '1.8.0',
    animations: {
      [`animation.${name}.idle`]: {
        loop: true,
        animation_length: 2,
        bones: {
          head: { rotation: ['math.sin(query.anim_time * 90) * 5', 0, 0] },
        },
      },
    },
  };
}

export function animationController({ name }) {
  return {
    format_version: '1.10.0',
    animation_controllers: {
      [`controller.animation.${name}.general`]: {
        initial_state: 'default',
        states: {
          default: { animations: ['idle'] },
        },
      },
    },
  };
}

export function particle({ namespace, name }) {
  return {
    format_version: '1.10.0',
    particle_effect: {
      description: {
        identifier: `${namespace}:${name}`,
        basic_render_parameters: { material: 'particles_alpha', texture: 'textures/particle/particles' },
      },
      components: {
        'minecraft:emitter_rate_instant': { num_particles: 10 },
        'minecraft:emitter_lifetime_once': { active_time: 1 },
        'minecraft:emitter_shape_sphere': { radius: 0.5, direction: 'outwards' },
        'minecraft:particle_lifetime_expression': { max_lifetime: 1 },
        'minecraft:particle_initial_speed': 1,
        'minecraft:particle_motion_dynamic': { linear_acceleration: [0, -2, 0] },
        'minecraft:particle_appearance_billboard': {
          size: [0.1, 0.1],
          facing_camera_mode: 'lookat_xyz',
          uv: { texture_width: 128, texture_height: 128, uv: [0, 0], uv_size: [8, 8] },
        },
      },
    },
  };
}

export function itemTextureAtlas() {
  return { resource_pack_name: 'pack', texture_name: 'atlas.items', texture_data: {} };
}

export function terrainTextureAtlas() {
  return { resource_pack_name: 'pack', texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: {} };
}

export function blocksJson() {
  return { format_version: '1.21.40' };
}
