# Skyfall Arena

An original, fully playable 3D battle royale inspired by the genre — built from scratch with Three.js, HTML/CSS and fully procedural art, then packaged for Android with Capacitor. No third-party game art, names or trademarks are used.

**Playable in the browser and downloadable as a real Android APK.**

---

## What is in the game

### Modes (all launch real matches)

| Mode | Players | Rules |
| --- | --- | --- |
| Battle Royale | 100 | Skybus drop, loot, build, one life, shrinking storm, last team wins |
| Zero Build | 100 | Same island and storm with building disabled |
| Ranked Battle Royale | 80 | Tougher AI, placement + elimination rank points |
| Team Rumble | 20 v 20 | Respawns, no storm, first team to 25 eliminations |
| Box Fights | 1 v 1 | Sky arena, unlimited mats, first to 5 eliminations |
| Zone Wars | 4 v 4 | Closing storm, best-of-three rounds |
| 1v1 / 2v2 / 3v3 / 4v4 | 2–8 | Respawn duels, first team to 5 |
| Creative Mode | solo | Whole island, unlimited materials, every build piece |
| Practice Mode | solo | Unlimited mats, respawning target dummies |

### Gameplay systems

- **Battle bus & drop** — 27 second flight path, manual deploy, glider, landing.
- **Storm** — phased waiting/closing circles with increasing damage and moving centers.
- **100-participant matches** — AI opponents fight each other, rotate with the zone, build
  cover when shot, use loot and close in on the player.
- **Loot** — floor loot, ammo, shields/heals, material stacks, 48 chests and supply drops,
  six rarity tiers with stat scaling.
- **Weapons** — 11 weapons: AR, burst rifle, SMG, pump-style shotgun, bolt sniper, DMR,
  LMG, pistol, rocket launcher, charge bow, grenades and a harvesting tool. Hitscan and
  projectile paths, headshots, falloff, recoil, spread, reloads, tracers, muzzle flash,
  impacts and explosions.
- **Building** — walls, floors, ramps and roofs; wood/brick/metal health; turbo building,
  piece rotation, ghost preview, structural damage, piece destruction and material costs.
- **Editing** — wall edits (window, door, half, corner), floor/roof/ramp half edits,
  cycling variants and instant reset.
- **Movement** — sprint, crouch, slide, jump, mantle/step-up, swimming, freefall, gliding,
  fall damage and third-person camera with ADS/scope zoom.
- **Vehicles** — drivable Rift Karts parked around the marina.
- **World** — 1,800 m island with eight named POIs (town, industrial, mountain, forest,
  desert, marina, underground vault), roads, destructible trees/rocks, day-night cycle,
  dynamic weather (clear, rain, fog, snow) and a canvas minimap.
- **Audio** — all effects synthesized at runtime with the Web Audio API (gunshots,
  explosions, footsteps, building, chests, storm, UI, victory/defeat stings and ambient wind).
- **Progression** — XP and levels, career stats, rank points and tiers, mode victories,
  challenges and an unlock-free locker with 7 outfits, 3 pickaxes, 3 gliders, 3 emotes.

### Controls

Desktop: WASD, Shift sprint, Space jump/glide, mouse aim, left click fire/place,
right click ADS, R reload, E interact, Tab inventory, Q build, 1–4 pieces,
G edit, H reset edit, 1–6 hotbar, wheel switching, Esc pause.

Mobile: dynamic left joystick, drag right side to look, FIRE/AIM/JUMP/CROUCH/RUN/RELOAD/
BUILD/EDIT/USE/BAG/EMOTE buttons. Every button can be dragged and resized in
**Settings → Touch → Customize HUD**, and sensitivity/HUD scale are configurable.

Controller: standard gamepad mapping (Xbox/PlayStation/Bluetooth) with dead zone and
sensitivity settings. Left stick moves, right stick aims, RT fires, LT aims, A jumps,
B crouches, X reloads, Y toggles building, LB/RB switch pieces, Menu opens inventory.

---

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build in dist/
```

Everything runs offline; matches are generated locally against AI opponents. There is no
account system and no remote game server.

## Build the Android APK

Requirements: Node 20+, JDK 17, Android SDK (platform 36, build-tools 36).

```bash
npm install
npm run build
npx cap sync android
python3 tools/gen_icons.py

# create a signing key (or use your own and export SKYFALL_KEYSTORE)
keytool -genkeypair -v -keystore android/skyfall-release.keystore -alias skyfall \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass skyfall-dev-password -keypass skyfall-dev-password \
  -dname "CN=Skyfall Arena, O=Skyfall Arena, C=US"

cd android
./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

The release build reads `SKYFALL_KEYSTORE`, `SKYFALL_KEYSTORE_PASSWORD`,
`SKYFALL_KEY_ALIAS` and `SKYFALL_KEY_PASSWORD` when present.

### Continuous integration

`.github/workflows/android.yml` builds, verifies and uploads the APK on every push to
`main`/`master`, and attaches it to a GitHub Release when a `v*` tag is pushed. Add a
`SKYFALL_KEYSTORE_BASE64` repository secret to sign with your own key; otherwise CI
generates an ephemeral development key.

### Android configuration

- Package: `com.skyfall.arena`
- Version: `1.0.0` (versionCode 1)
- Orientation: sensor landscape, immersive full-screen, screen kept awake
- Min SDK 24, target/compile SDK 36
- Permissions: INTERNET, ACCESS_NETWORK_STATE, VIBRATE, WAKE_LOCK
- WebGL ES 3.0 required, gamepad supported
- Adaptive launcher icon and splash screens generated by `tools/gen_icons.py`

---

## Project layout

```
index.html              page shell
src/main.js             boot, screen flow, match lifecycle
src/engine.js           renderer, sky, main-menu diorama
src/world.js            island generation, POIs, collision, minimap, weather
src/player.js           movement, camera, inventory, health
src/character.js        procedural animated characters, weapons, gliders
src/weapons.js          hitscan/projectile combat, effects
src/building.js         build pieces, edits, structural health
src/bots.js             AI opponents and abstract match simulation
src/storm.js            shrinking zone
src/loot.js             pickups, chests, supply drops
src/game.js             match rules, modes, rounds, scoring, spectating
src/ui.js               lobby, locker, career, settings, matchmaking, results
src/hud.js              in-match HUD, minimap, touch layout editor
src/audio.js            procedural WebAudio sound
src/settings.js         persistent settings + profile
android/                Capacitor Android project
.github/workflows/      APK CI
tools/gen_icons.py      launcher icon / splash generator
```

## Scope & known limitations

- Matches are **single-player against AI opponents**. The online systems in the brief
  (server-authoritative networking, real matchmaking, parties, anti-cheat, regional
  servers) are **not implemented**; there is no remote multiplayer server in this project.
- The map is procedurally generated from simple primitives: it is intentionally stylized
  rather than photorealistic, and runs without external art assets.
- The APK is verified structurally (`aapt` badging + `apksigner`); it has not been run on
  a physical device or emulator in the build environment.
- Cosmetic content is available to all players from the start; there is no store or
  monetization.

## License

MIT — see [LICENSE](LICENSE). Skyfall Arena is an original work and is not affiliated
with, endorsed by, or sponsored by any existing game or brand.
