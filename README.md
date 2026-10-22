# Dynamic OBS Overlay

A small local web app that:
- Overlays player names + agent icons on top of your `assets/static.png`, reading from `assets/options.txt`
- Updates **live** the instant you save changes to `assets/options.txt` — no OBS refresh needed
- Gives you an on-screen score panel (buttons + arrow-key hotkeys) that updates the score live on stream

## 1. Setup (one time)

You need [Node.js](https://nodejs.org) installed (any recent version).

All your images and `options.txt` live together in the `assets` folder:
```
assets/
  static.png              <- roster overlay background
  intro-background.png    <- intro/timer overlay background
  options.txt              <- player/team roster data
  agent icons/             <- AgentName_icon.png files
  teams/                   <- TeamName.png logo files
  maps/                    <- MapName.png thumbnail files
```

1. Unzip this folder anywhere, e.g. `C:\obs-overlay` or `~/obs-overlay`.
2. Replace `assets/static.png` and `assets/intro-background.png` with your real overlay images
   (same filenames).
3. Put your real agent icon files into `assets/agent icons/`, named exactly:
   `AgentName_icon.png` (e.g. `Brimstone_icon.png`).
4. Put team logo files into `assets/teams/`, named `TeamName.png` (e.g. `Buffalo.png`).
5. Put map thumbnail files into `assets/maps/`, named `MapName.png` (e.g. `Bind.png`).
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
whenever you save `server.js` or `valorant.js`. Files in `public/` don't need a restart; just refresh the
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

## 4. Editing players/agents live, mid-stream

Just open `assets/options.txt` in Notepad (or any editor), edit it, and save. Each team/comp is its own block:
```
TeamOrMapTitle
PlayerName-AgentName
PlayerName-AgentName
PlayerName-AgentName
PlayerName-AgentName
PlayerName-AgentName
```
Leave **at least one blank line** between teams. For example:
```
Haven
Pine-Brimstone
Sensational-Neon
Jss-Omen
Ares-Sova
Wild-Skye

Bind
Pine-Jett
Sensational-Cypher
Jss-Sage
Ares-Sova
Wild-Fade
```
The overlay will pick up any edits within about a second — no need to touch OBS.

## 4b. Automatic roster from Valorant

If Valorant is running **on the same PC as this server** (you're playing or spectating), the
server reads the roster straight from the game. You don't need to edit `options.txt`:
- As soon as agent select starts, a **LIVE** button appears at the top of the team list
  (e.g. "LIVE · Ascent"), and the overlay switches to it automatically.
- Agents update as players hover or lock, and the roster stays correct once the match loads.
- Player order follows the order names appear in `options.txt` (matched case-insensitively against
  in-game names), so the rows don't shuffle around. Unknown names go last.
- **LIVE shows:** buttons in the control panel pick which team the LIVE roster follows:
  - **Ours:** your team. When spectating, it's the team whose in-game names best match `options.txt`.
  - **Enemy:** the other team.
  - **Blue / Red:** a fixed team (Blue starts on defense, Red on attack).

  Riot hides the enemy team during agent select, so Enemy (or the other color) stays blank until the
  match loads.
- The LIVE roster stays up after the match ends, so the overlay doesn't jump. You can still click any
  `options.txt` block to override it.

This uses Riot's unofficial local client API (read-only, the same one tools like VRY use) plus
valorant-api.com for agent and map names, so it needs internet access and may break if Riot changes
things. If it stops working, `options.txt` keeps working as before.

## 5. Switching which team/comp is shown

Open the control panel (`http://localhost:3000/control.html`) — under "Active Team / Comp" you'll see a
button for every team block found in `assets/options.txt`. Click one to instantly switch what's shown on the
overlay (useful for switching per-map comps mid-cast). The first team is selected automatically by default.
This list updates live too, so if you add a new team block to `assets/options.txt`, a new button appears
automatically.

## 6. Map score (Bo1/Bo3/Bo5 diamonds)

The map-win diamonds sit in the top-left and top-right corners of the screen — over the area
where Valorant's own in-game HUD shows each team — rather than in a separate box. Left corner =
your team, right corner = opponent. Filled diamonds = maps won, dim/outline diamonds = not yet won.

In the control panel:
- Two small text boxes at the top set the labels shown above each diamond group (e.g. "UB" and
  "Sentinels").
- **Best of** buttons set how many diamonds show per side (Bo1 → 1, Bo3 → 2, Bo5 → 3).
- The **US MAPS WON** / **THEM MAPS WON** +/- buttons (and the ↑↓←→ hotkeys) fill in diamonds as
  maps are won.

The 5-agent roster list is unrelated to this and untouched — it always shows whichever team/comp
is selected further down in the panel.

## 7. Intro / Timer scene

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

**Maps:** drop image files into the `assets/maps` folder, named exactly `<MapName>.png`. Go to the
**Intro / Timer** tab in the control panel to:
- Set the countdown timer (pick a date/time, hit Set — it counts down live; Clear resets it to
  `00:00:00`)
- Choose Bo1 or Bo3 (Bo1 shows a single centered map slot, Bo3 shows all three)
- Pick each map from a dropdown — it's automatically populated from whatever files are in the
  `assets/maps` folder, so just add a new file there and it shows up as an option right away, no restart
  needed.

## Notes / troubleshooting
- The server's lifetime is tied directly to the terminal window `start.bat` opens — close that
  window, the server stops; no timers, no background-tab tricks, nothing else to think about.
- `start.bat` checks port 3000 before starting, so you can't accidentally end up with two servers
  running at once.
- The 5 player rows are positioned to match the placeholder boxes measured
  from your original `static.png` layout. If you change the static background's layout, edit the
  `top`/`left` px values in `public/overlay.html` (`.player-row`) to match.
- If an agent icon doesn't show up, double check the exact spelling/case in `assets/options.txt`
  matches the `AgentName_icon.png` filename in `assets/agent icons/`.
- Score and team label are saved to `score.json`, so they survive a restart.
- The currently active team/comp is saved to `active.json`, so it also survives a restart.
- If you rename or remove the currently active team's title in `assets/options.txt`, the overlay
  automatically falls back to showing the first team in the file.
