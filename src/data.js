// Skyfall Arena - original game data: modes, weapons, cosmetics, rarities.
// Everything here is original content; no third-party names, art or trademarks are used.

export const RARITIES = [
  { id: 'common', name: 'Common', color: '#b8c0c9', mult: 1.0 },
  { id: 'uncommon', name: 'Uncommon', color: '#5ad15a', mult: 1.06 },
  { id: 'rare', name: 'Rare', color: '#4aa8ff', mult: 1.12 },
  { id: 'epic', name: 'Epic', color: '#b96bff', mult: 1.2 },
  { id: 'legendary', name: 'Legendary', color: '#ffa63d', mult: 1.3 },
  { id: 'mythic', name: 'Mythic', color: '#ffd84d', mult: 1.42 }
];

export const rarityById = (id) => RARITIES.find((r) => r.id === id) || RARITIES[0];

export const AMMO = {
  light: { name: 'Light', color: '#9fe870' },
  medium: { name: 'Medium', color: '#ffd166' },
  heavy: { name: 'Heavy', color: '#ff8fa3' },
  shells: { name: 'Shells', color: '#ff6b6b' },
  rockets: { name: 'Rockets', color: '#c0a0ff' },
  arrows: { name: 'Arrows', color: '#b6e2ff' }
};

// damage = base body damage at Common rarity, before rarity multiplier.
export const WEAPONS = {
  harvester: {
    id: 'harvester', name: 'Rift Harvester', slot: 'pickaxe', auto: true,
    damage: 20, headshot: 1.5, rpm: 120, range: 4.2, rarity: 'uncommon', icon: 'axe'
  },
  ar: {
    id: 'ar', name: 'Vanguard AR', slot: 'primary', auto: true, ammo: 'medium',
    damage: 31, headshot: 1.5, rpm: 330, mag: 30, reload: 2.2, spread: 0.011,
    adsSpread: 0.004, recoil: 0.55, range: 240, projectileType: 'hitscan', icon: 'rifle'
  },
  burst: {
    id: 'burst', name: 'Talon Burst', slot: 'primary', auto: true, burst: 3, ammo: 'medium',
    damage: 27, headshot: 1.6, rpm: 600, cycle: 0.62, mag: 30, reload: 2.3,
    spread: 0.008, adsSpread: 0.003, recoil: 0.45, range: 220, projectileType: 'hitscan', icon: 'rifle'
  },
  smg: {
    id: 'smg', name: 'Whisper SMG', slot: 'primary', auto: true, ammo: 'light',
    damage: 17, headshot: 1.35, rpm: 760, mag: 30, reload: 1.9, spread: 0.018,
    adsSpread: 0.010, recoil: 0.32, range: 110, projectileType: 'hitscan', icon: 'smg'
  },
  shotgun: {
    id: 'shotgun', name: 'Boomstick', slot: 'primary', auto: false, ammo: 'shells',
    damage: 11, pellets: 9, headshot: 1.5, rpm: 78, mag: 5, reload: 3.1, spread: 0.07,
    adsSpread: 0.055, recoil: 1.4, range: 34, falloff: 0.55, projectileType: 'hitscan', icon: 'shotgun'
  },
  sniper: {
    id: 'sniper', name: 'Longshot', slot: 'primary', auto: false, ammo: 'heavy',
    damage: 105, headshot: 2.0, rpm: 33, mag: 5, reload: 3.4, spread: 0.02,
    adsSpread: 0.0006, recoil: 2.6, range: 500, scope: 6, projectileType: 'hitscan', icon: 'sniper'
  },
  dmr: {
    id: 'dmr', name: 'Ranger DMR', slot: 'primary', auto: false, ammo: 'heavy',
    damage: 48, headshot: 1.9, rpm: 150, mag: 10, reload: 2.4, spread: 0.006,
    adsSpread: 0.0015, recoil: 1.1, range: 340, scope: 2.4, projectileType: 'hitscan', icon: 'sniper'
  },
  lmg: {
    id: 'lmg', name: 'Bulwark LMG', slot: 'primary', auto: true, ammo: 'medium',
    damage: 28, headshot: 1.4, rpm: 480, mag: 60, reload: 4.4, spread: 0.02,
    adsSpread: 0.012, recoil: 0.7, range: 200, projectileType: 'hitscan', icon: 'lmg'
  },
  pistol: {
    id: 'pistol', name: 'Sidearm', slot: 'primary', auto: false, ammo: 'light',
    damage: 24, headshot: 1.75, rpm: 300, mag: 15, reload: 1.4, spread: 0.01,
    adsSpread: 0.005, recoil: 0.4, range: 90, projectileType: 'hitscan', icon: 'pistol'
  },
  rocket: {
    id: 'rocket', name: 'Thumper', slot: 'primary', auto: false, ammo: 'rockets',
    damage: 86, splash: 5.5, headshot: 1.0, rpm: 40, mag: 1, reload: 3.2, spread: 0.012,
    adsSpread: 0.008, recoil: 2.2, range: 300, projectileType: 'rocket', icon: 'rocket'
  },
  bow: {
    id: 'bow', name: 'Compound Bow', slot: 'primary', auto: false, ammo: 'arrows',
    damage: 40, headshot: 2.0, charge: 1.1, chargeMax: 2.2, rpm: 60, mag: 1, reload: 1.2,
    spread: 0.006, adsSpread: 0.002, recoil: 0.8, range: 300, projectileType: 'arrow', icon: 'bow'
  },
  grenade: {
    id: 'grenade', name: 'Rift Grenade', slot: 'throwable', count: 1,
    damage: 95, splash: 6, rarity: 'rare', icon: 'grenade'
  }
};

// Weapons that can appear as floor loot / chest loot.
export const LOOT_WEAPONS = ['ar', 'burst', 'smg', 'shotgun', 'sniper', 'dmr', 'lmg', 'pistol', 'rocket', 'bow'];

export const CONSUMABLES = {
  bandage: { id: 'bandage', name: 'Bandage', heal: 15, cap: 75, time: 3.2, stack: 15, icon: 'bandage' },
  medkit: { id: 'medkit', name: 'Med Kit', heal: 100, cap: 100, time: 7, stack: 3, icon: 'medkit' },
  mini: { id: 'mini', name: 'Mini Shield', shield: 25, cap: 50, time: 2, stack: 6, icon: 'shield' },
  bigshield: { id: 'bigshield', name: 'Shield Jug', shield: 50, cap: 100, time: 4, stack: 3, icon: 'shield' },
  fish: { id: 'fish', name: 'Rift Fish', heal: 30, shield: 30, cap: 100, time: 2.5, stack: 5, icon: 'fish' }
};

export const MATERIALS = {
  wood: { id: 'wood', name: 'Wood', color: '#c98f52', hp: 150, buildTime: 0.35 },
  brick: { id: 'brick', name: 'Brick', color: '#c46a55', hp: 300, buildTime: 0.5 },
  metal: { id: 'metal', name: 'Metal', color: '#9fb0c0', hp: 450, buildTime: 0.7 }
};

// Match modes. `teams` * `teamSize` = participants. Real rules per mode.
export const MODES = [
  {
    id: 'br', name: 'Battle Royale', short: 'BR', family: 'core',
    desc: '100 players, one island, one storm. Loot up, build, and be the last one standing.',
    teams: 25, teamSize: 1, storm: true, bus: true, building: true, respawn: false,
    winCondition: 'last-team', lockedTeamSize: false, difficulty: 1, ranked: false
  },
  {
    id: 'zero', name: 'Zero Build', short: 'ZB', family: 'core',
    desc: 'Pure gunplay and movement. No building, no edits - just aim, cover and positioning.',
    teams: 25, teamSize: 1, storm: true, bus: true, building: false, respawn: false,
    winCondition: 'last-team', lockedTeamSize: false, difficulty: 1, ranked: false
  },
  {
    id: 'ranked', name: 'Ranked Battle Royale', short: 'RANKED', family: 'core',
    desc: 'Competitive ruleset with rank points for placement and eliminations. Tougher opponents.',
    teams: 20, teamSize: 1, storm: true, bus: true, building: true, respawn: false,
    winCondition: 'last-team', lockedTeamSize: false, difficulty: 1.35, ranked: true
  },
  {
    id: 'rumble', name: 'Team Rumble', short: 'RUMBLE', family: 'core',
    desc: 'Two big teams, instant respawns, first team to the elimination target wins. Storm is off.',
    teams: 2, teamSize: 20, storm: false, bus: true, building: true, respawn: true,
    winCondition: 'score', scoreTarget: 25, difficulty: 0.9, ranked: false
  },
  {
    id: 'creative', name: 'Creative Mode', short: 'CREATIVE', family: 'sandbox',
    desc: 'A private island with unlimited materials and every build piece unlocked.',
    teams: 1, teamSize: 1, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'sandbox', difficulty: 0, ranked: false, creative: true
  },
  {
    id: 'boxfights', name: 'Box Fights', short: 'BOX', family: 'arena',
    desc: 'Close-quarters build fighting in a tight arena. First to 5 eliminations takes it.',
    teams: 2, teamSize: 1, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'score', scoreTarget: 5, difficulty: 1, ranked: false, arena: 'box', unlimitedMats: true
  },
  {
    id: 'zonewars', name: 'Zone Wars', short: 'ZONE', family: 'arena',
    desc: 'A storm that never stops closing. Survive, eliminate, and win two rounds to take the match.',
    teams: 2, teamSize: 1, storm: true, bus: false, building: true, respawn: false,
    winCondition: 'rounds', rounds: 3, difficulty: 1.1, ranked: false, arena: 'zone', unlimitedMats: true, fastStorm: true
  },
  {
    id: 'duel1', name: '1v1', short: '1V1', family: 'duel', teamSize: 1,
    desc: 'Pure one-on-one duels in a compact arena. First to 5 eliminations wins.',
    teams: 2, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'score', scoreTarget: 5, difficulty: 1, ranked: false, arena: 'duel', unlimitedMats: true, lockedTeamSize: true
  },
  {
    id: 'duel2', name: '2v2', short: '2V2', family: 'duel', teamSize: 2,
    desc: 'Duos duels with respawns. First team to 5 eliminations wins.',
    teams: 2, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'score', scoreTarget: 5, difficulty: 1, ranked: false, arena: 'duel', unlimitedMats: true, lockedTeamSize: true
  },
  {
    id: 'duel3', name: '3v3', short: '3V3', family: 'duel', teamSize: 3,
    desc: 'Trio skirmishes in the duel arena. Coordinate pushes and holds.',
    teams: 2, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'score', scoreTarget: 5, difficulty: 1, ranked: false, arena: 'duel', unlimitedMats: true, lockedTeamSize: true
  },
  {
    id: 'duel4', name: '4v4', short: '4V4', family: 'duel', teamSize: 4,
    desc: 'Full squad duels. First team to 5 eliminations wins the match.',
    teams: 2, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'score', scoreTarget: 5, difficulty: 1, ranked: false, arena: 'duel', unlimitedMats: true, lockedTeamSize: true
  },
  {
    id: 'practice', name: 'Practice Mode', short: 'PRACTICE', family: 'sandbox',
    desc: 'Open island, unlimited materials and respawning target dummies. Warm up your aim and builds.',
    teams: 1, teamSize: 1, storm: false, bus: false, building: true, respawn: true,
    winCondition: 'sandbox', difficulty: 0, ranked: false, practice: true, unlimitedMats: true
  }
];

export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

// Total participants each mode supports (teamSize multiplies out where relevant).
export const PLAYER_CAPS = {
  br: 100, zero: 100, ranked: 80, rumble: 40, creative: 1,
  boxfights: 2, zonewars: 8, duel1: 2, duel2: 4, duel3: 6, duel4: 8, practice: 1
};

export const MODE_FILL = { br: [1, 2, 3, 4], zero: [1, 2, 3, 4], ranked: [1, 2, 3, 4] };

export const OUTLETS = [
  { id: 'outfit_rift', name: 'Rift Runner', kind: 'outfit', rarity: 'legendary',
    palette: { skin: '#e8b08a', shirt: '#2ea8ff', pants: '#1b3f7a', accent: '#9ff3ff', hair: '#20242c' } },
  { id: 'outfit_ember', name: 'Ember Scout', kind: 'outfit', rarity: 'epic',
    palette: { skin: '#d99a6c', shirt: '#ff6b3d', pants: '#3a2233', accent: '#ffd166', hair: '#4a2118' } },
  { id: 'outfit_verdant', name: 'Verdant Warden', kind: 'outfit', rarity: 'rare',
    palette: { skin: '#c98b62', shirt: '#3fbf7f', pants: '#1f4a3a', accent: '#d8ffb0', hair: '#26302a' } },
  { id: 'outfit_void', name: 'Void Marauder', kind: 'outfit', rarity: 'legendary',
    palette: { skin: '#9c8ac4', shirt: '#3a2a5e', pants: '#1a1428', accent: '#c8a6ff', hair: '#120d1c' } },
  { id: 'outfit_sand', name: 'Dune Nomad', kind: 'outfit', rarity: 'uncommon',
    palette: { skin: '#b97a4e', shirt: '#d9b26f', pants: '#5a4630', accent: '#fff1c9', hair: '#2b1d12' } },
  { id: 'outfit_frost', name: 'Frost Operative', kind: 'outfit', rarity: 'epic',
    palette: { skin: '#f0c3a0', shirt: '#cfe9ff', pants: '#2c4660', accent: '#7fd6ff', hair: '#d9e7f2' } },
  { id: 'outfit_gold', name: 'Gilded Champion', kind: 'outfit', rarity: 'mythic',
    palette: { skin: '#e6b489', shirt: '#f2c14e', pants: '#4a3a1a', accent: '#fff4c2', hair: '#241a08' } }
];

export const PICKAXES = [
  { id: 'pick_rift', name: 'Rift Cleaver', kind: 'pickaxe', rarity: 'rare', color: '#6fe3ff' },
  { id: 'pick_ember', name: 'Cinder Fang', kind: 'pickaxe', rarity: 'epic', color: '#ff7a45' },
  { id: 'pick_gold', name: 'Gilded Edge', kind: 'pickaxe', rarity: 'legendary', color: '#ffd45e' }
];

export const GLIDERS = [
  { id: 'glider_rift', name: 'Rift Wing', kind: 'glider', rarity: 'epic', color: '#5cd0ff' },
  { id: 'glider_ember', name: 'Ember Sail', kind: 'glider', rarity: 'rare', color: '#ff8a4c' },
  { id: 'glider_verdant', name: 'Verdant Drift', kind: 'glider', rarity: 'uncommon', color: '#68d391' }
];

export const EMOTES = [
  { id: 'emote_wave', name: 'Friendly Wave', kind: 'emote', rarity: 'common' },
  { id: 'emote_floss', name: 'Rift Shuffle', kind: 'emote', rarity: 'rare' },
  { id: 'emote_flex', name: 'Victory Flex', kind: 'emote', rarity: 'epic' }
];

export const LOCKER_ITEMS = [...OUTLETS, ...PICKAXES, ...GLIDERS, ...EMOTES];

export const DEFAULT_LOCKER = {
  outfit: 'outfit_rift', pickaxe: 'pick_rift', glider: 'glider_rift', emote: 'emote_floss'
};

// Named points of interest, placed by world.js.
export const POIS = [
  { id: 'rustridge', name: 'Rustridge', kind: 'industrial', color: '#b4693f', radius: 120 },
  { id: 'brightbay', name: 'Brightbay', kind: 'town', color: '#5aa9e6', radius: 130 },
  { id: 'summit', name: 'Summit Station', kind: 'mountain', color: '#c9d6e8', radius: 90 },
  { id: 'hollow', name: 'Hollow Pines', kind: 'forest', color: '#3f7f5a', radius: 140 },
  { id: 'dunes', name: 'Sunscale Dunes', kind: 'desert', color: '#d9b26f', radius: 110 },
  { id: 'vault', name: 'The Vault', kind: 'underground', color: '#8b6bff', radius: 70 },
  { id: 'marina', name: 'Coral Marina', kind: 'beach', color: '#2fbfa0', radius: 100 },
  { id: 'foundry', name: 'Iron Foundry', kind: 'industrial', color: '#8a8f98', radius: 95 }
];

export const RANK_TIERS = [
  { name: 'Rookie', min: 0, color: '#9fb0c0' },
  { name: 'Bronze', min: 250, color: '#c98f52' },
  { name: 'Silver', min: 600, color: '#d7e0e8' },
  { name: 'Gold', min: 1100, color: '#ffd166' },
  { name: 'Platinum', min: 1700, color: '#7fe6ff' },
  { name: 'Diamond', min: 2400, color: '#8fb3ff' },
  { name: 'Champion', min: 3200, color: '#ff8a4c' }
];

export const rankFor = (points) => {
  let rank = RANK_TIERS[0];
  for (const tier of RANK_TIERS) if (points >= tier.min) rank = tier;
  return rank;
};
