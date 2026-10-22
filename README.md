# Dynamic OBS Overlay

A small local web app that:
- Overlays player names + agent icons on top of your `assets/static.png`, read live from the Valorant
  client: whatever the players actually pick shows up on stream, with no OBS refresh needed
- Gives you an on-screen score panel (buttons + arrow-key hotkeys) that updates the score live on stream

## 1. Setup (one time)

You need [Node.js](https://nodejs.org) installed (any recent version).

All your images live together in the `assets` folder:
```
assets/
  static.png              <- roster overlay background
  intro-background.png    <- intro/timer overlay background
  agent icons/             <- backup AgentName_icon.png files (used only when offline)
  teams/                   <- TeamName.png logo files
  maps/                    <- backup MapName.png images (used only when offline)
```

1. Unzip this folder anywhere, e.g. `C:\obs-overlay` or `~/obs-overlay`.
2. Replace `assets/static.png` and `assets/intro-background.png` with your real overlay images
   (same filenames).
3. Agent icons download automatically from valorant-api.com the first time each agent is shown,
   and a copy is kept in `cache/agent-icons/`. New agents work without adding any files. The
   `AgentName_icon.png` files in `assets/agent icons/` are only a backup for when the internet is down.
4. Put team logo files into `assets/teams/`, named `TeamName.png` (e.g. `Buffalo.png`).
5. Map images also come from valorant-api.com (the official 1920x1080 loading-screen art) and
   are kept in `cache/maps/`. The files in `assets/maps/` are only a backup for when the internet is down.
6. Open a terminal in this folder and run:
   ```
   npm install
   ```
   (only needed once, downloads the tiny web server library)

## 2. Running it

Double-click `start.bat`. This opens exactly **one terminal window** running the server — nothing
else opens. No app window, no browser tab.

**Closing that terminal window stops the server.** That's the whole lifecycle: open the terminal,
server's up; close it, server's down. If you try to run `start.bat` again while one is already
running, it'll tell you and won't start a second copy.

**While editing the code:** run `npm run dev` in a terminal instead. The server restarts by itself
whenever you save a file in `src/`. Files in `public/` don't need a restart; just refresh the
page or OBS source. Stop it with Ctrl+C. Only one server can run at a time, so close any `start.bat`
window first.

To add the control panel to your stream setup, put it inside OBS as a dock (see section 3) rather
than opening it in a separate browser tab.

## 3. Add it to OBS

**Overlays:**
- In OBS: Sources → + → Browser
- Roster overlay URL: `http://localhost:3000/overlay.html`
- Intro/timer overlay URL: `http://localhost:3000/intro.html`
- Width: `1920`, Height: `1080` (for both)
- Check "Shutdown source when not visible" OFF (so it keeps listening for live updates)

**Control panel (as an OBS dock, not a browser tab):**
- In OBS: View → Docks → Custom Browser Docks
- Name it "Stream Control", URL: `http://localhost:3000/control.html`
- It'll dock right inside the OBS window. Click into it once and use the arrow key hotkeys:
  - ↑ / ↓ = your score +1 / −1
  - → / ← = opponent score +1 / −1

## 4. Player names + agents (automatic, from Valorant)

The roster comes straight from the game. There's nothing to type in. Valorant has to be running
**on the same PC as this server** (you're playing or spectating):
- When agent select starts, the 5 player rows fill in with in-game names. Agents appear as players
  hover and lock them, and stay correct once the match loads.
- Players are listed alphabetically, so the rows don't reshuffle between agent select and the live game.
- Outside a match (menus, lobby, Valorant closed) the rows are empty. They clear a few seconds after
  a match ends.
- The **Live Roster** section of the control panel shows the map and each player's agent, so you
  can check what's on stream.
- The **Show:** buttons pick which team the roster follows:
  - **Ours:** your team. When spectating you're not on a team, so this means Blue.
  - **Enemy:** the other team. When spectating, this means Red.
  - **Blue / Red:** a fixed team (Blue starts on defense, Red on attack).

  Riot hides the enemy team during agent select, so Enemy (or the other color) stays blank until the
  match loads.

This uses Riot's unofficial local client API (read-only, the same one tools like VRY use) plus
valorant-api.com for agent and map names, so it needs internet access and may break if Riot changes
things.

## 5. Map score (Bo1/Bo3/Bo5 diamonds)

The map-win diamonds sit in the top-left and top-right corners of the screen — over the area
where Valorant's own in-game HUD shows each team — rather than in a separate box. Left corner =
your team, right corner = opponent. Filled diamonds = maps won, dim/outline diamonds = not yet won.

In the control panel:
- Two small text boxes at the top set the labels shown above each diamond group (e.g. "UB" and
  "Sentinels").
- **Best of** buttons set how many diamonds show per side (Bo1 → 1, Bo3 → 2, Bo5 → 3).
- The **US MAPS WON** / **THEM MAPS WON** +/- buttons (and the ↑↓←→ hotkeys) fill in diamonds as
  maps are won.

The player roster is unrelated to this and isn't affected by the score.

## 6. Intro / Timer scene

There's a second overlay scene for a pre-match "intro" screen: a countdown timer, both teams'
logos + names, and the maps being played.

**Add it as a separate Browser Source in OBS** (its own scene or alongside the roster overlay):
```
http://localhost:3000/intro.html
```
Same size as the other one: 1920x1080.

**Team logos:** drop image files into the `assets/teams` folder, named exactly `<TeamName>.png` — the
name must match what's typed into the "Our team" / "Opponent" fields on the **Score** tab of the
control panel (those fields are shared between both scenes, so you only set them once).

**Maps:** the map list and images come from valorant-api.com, so there are no files to manage. Go to the
**Intro / Timer** tab in the control panel to:
- Set the countdown timer (pick a date/time, hit Set — it counts down live; Clear resets it to
  `00:00:00`)
- Choose Bo1 or Bo3 (Bo1 shows a single centered map slot, Bo3 shows all three)
- Pick each map from a dropdown. It lists the current competitive map pool, so a new map shows up
  on its own when Riot adds it. If you're offline, it lists the files in `assets/maps` instead.

## Notes / troubleshooting
- The server's lifetime is tied directly to the terminal window `start.bat` opens — close that
  window, the server stops; no timers, no background-tab tricks, nothing else to think about.
- `start.bat` checks port 3000 before starting, so you can't accidentally end up with two servers
  running at once.
- The 5 player rows are positioned to match the placeholder boxes measured
  from your original `static.png` layout. If you change the static background's layout, edit the
  `top`/`left` px values in `public/overlay.html` (`.player-row`) to match.
- If an agent icon or map image doesn't show up, delete `cache/agent-icons` or `cache/maps` to force
  them to download again. Don't delete the whole `cache` folder unless you also want to reset your settings.
- Everything you set in the control panel (score, team labels, intro timer and maps, the Show: choice)
  is saved to `cache/state.json`, so it survives a restart. Delete it to reset everything to defaults.

## Project layout

```
src/                  the server (Node.js)
  server.js             starts the server; lists every URL it handles
  paths.js              where every folder and file lives
  state.js              saved control-panel settings (cache/state.json)
  events.js             pushes live updates to the overlay pages
  live-roster.js        checks Valorant every 2s and keeps the current roster
  riot-client.js        reads the match from the Riot Client / Riot's game servers
  valorant-api.js       agent + map names and images from valorant-api.com
  images.js             agent icons, map images, team logos
  http.js               small HTTPS helper
public/               the pages OBS and the control panel load
  overlay.html          roster overlay (player names + agents, map-score diamonds)
  intro.html            intro/timer scene
  control.html          control panel (OBS dock)
  dashboard.html        stream + chat + control panel in one page
assets/               your images (backgrounds, team logos)
cache/                created automatically, git-ignored: settings + downloaded images
start.bat             double-click to run the server
```
