# Facet

A browser puzzle of cut stones and accumulating pressure. Swap neighboring gems into lines, build strain on the stones left standing, and spend that strain on multiplying chains. Brilliant, star, and prism cuts open larger clears. Meet each level's target and continue until no productive swap remains.

## Run

Requires Node.js with npm.

```sh
npm ci
npm run dev
```

Open the URL Vite reports. For a static production site:

```sh
npm run build
npm run preview
```

`dist/` is the complete site. It can be hosted at an origin root or a sub-path, with no server logic or external requests.

## Controls

Drag a gem onto an orthogonal neighbor and release, or select one gem and press and release its neighbor. Bringing a drag back to its starting cell cancels the offer. Mouse, pen, and touch all work. Every menu has touch controls.

- **↑ / ↓**: highlight a menu choice.
- **Enter / Space**: choose it.
- **P / Escape**: pause or resume.
- **Escape**: return from instructions or the finished round.
- **M**: mute all sound and music.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The tests run the Simple 2D engine on a native canvas and counted clocks. They exercise the rules, independent debug poses, menus, pointer transactions, and frame-size-independent resolution.

## Assets and showcase

All pixel art, animation frames, live particle systems, sound effects, and music are original assets produced for this game and committed under `public/assets/`. The build simply copies those files. It never runs an asset-generation binary. `tools/produce_assets.py` records the one-time authoring recipes; rerunning it requires the production tools and sound banks available during authoring, and is not needed to install, play, or rebuild Facet.

`showcase/` contains the player-facing description, screenshots, and a few seconds of live play captured with the engine's drawing recorder.
