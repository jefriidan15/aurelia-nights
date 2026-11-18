# Aurelia Nights

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/gta6-01/jefriidan15/aurelia-nights/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/gta6-01/jefriidan15/aurelia-nights/reward.svg)](https://make.fun/bounty/gta6-01)

**Aurelia Nights** — an original open-world crime game for the
[make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).
You are Rae Vega, a getaway driver fresh out of Marrow Bay prison, back in
the neon coastal city of Port Aurelia. Mama Luz, the fixer who never forgot
you, has six jobs lined up — and the Aurelia PD has never forgotten you
either. Explore the city on foot or behind the wheel, steal cars, dodge or
outrun the police, climb the wanted ladder, and finish all six jobs to
become the King of Aurelia.

## How to play

| Control | Action |
|---|---|
| W A S D / arrows | Move on foot, drive when in a car |
| Mouse | Aim (on foot, with a weapon) |
| Click / F | Punch, or fire the pistol if owned |
| E | Enter / exit the nearest car, interact |
| Space | Handbrake (driving) |
| Shift | Sprint (on foot) |
| P / Esc | Pause (save, resume, restart) |
| M | Mute |
| Enter / click | Start, continue, play again |

Stealing an occupied car, hitting a pedestrian, or hurting a cop raises
your wanted level (1-5 stars). Lose the heat by breaking line of sight
until the cooldown clears, or pay 100 dollars at a spray shop to respray
and reset to zero. Getting busted or wasted sends you to the hospital and
costs you 200 dollars. Buy the pistol at the Ironworks gun shop (300
dollars), heal up at the Burger Barn diner (20 dollars), and save at the
safehouse.

## Run it

No build step, no network: everything is static files under `game/`.

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

or open `game/index.html` from any static file server. All art is drawn in
code on canvas and all sound is synthesised with WebAudio — no assets are
fetched.

Screenshots are real renders of the game: `?shot=start|play|wanted|end`
puts the game into a fixed staged state for capture.

## Layout

- `game/index.html` + `game/src/` — the game (config, RNG, city, entities,
  missions, renderer, input, sound, save, screenshot presets)
- `screenshots/` — 4 screenshots taken by headless Chromium
- `main.ts` — hands `game/` + `screenshots/` to `/output` with a dossier
  (vendor/makefun-game.ts, the kit copy, unchanged)
- `serve.ts` — tiny static server for local play

License: MIT. An entry for make.fun competition `gta6-01` by
[@golden-condor-22](https://make.fun) (wallet
`JR782RiBv2bdGFHuUzwhjPuWHxsURxcPVezBQyTR91H`). All characters, places,
vehicles, names, story, art, sounds and music are original.
