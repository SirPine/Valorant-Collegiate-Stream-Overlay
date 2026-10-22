const express = require('express');
const fs = require('fs');
const path = require('path');
const { fetchLiveRoster } = require('./valorant');

const app = express();
const PORT = process.env.PORT || 3000;

const ASSETS_DIR = path.join(__dirname, 'assets');
const OPTIONS_PATH = path.join(ASSETS_DIR, 'options.txt');
const SCORE_PATH = path.join(__dirname, 'score.json');
const ACTIVE_PATH = path.join(__dirname, 'active.json');
const INTRO_PATH = path.join(__dirname, 'intro.json');
const LIVE_SIDE_PATH = path.join(__dirname, 'live-side.json');
const AGENT_ICON_DIR = path.join(ASSETS_DIR, 'agent icons');
const TEAMS_DIR = path.join(ASSETS_DIR, 'teams');
const MAPS_DIR = path.join(ASSETS_DIR, 'maps');
const STATIC_BG_PATH = path.join(ASSETS_DIR, 'static.png');
const INTRO_BG_PATH = path.join(ASSETS_DIR, 'intro-background.png');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/agent-icons', express.static(AGENT_ICON_DIR));
app.use('/static.png', express.static(STATIC_BG_PATH));
app.use('/intro-background.png', express.static(INTRO_BG_PATH));
app.use('/teams', express.static(TEAMS_DIR));
app.use('/maps', express.static(MAPS_DIR));

// ---------- helpers ----------

// Roster pulled from the running Valorant client (see valorant.js). Kept after the match
// ends so the overlay doesn't jump back to options.txt mid-broadcast.
const LIVE_TITLE = 'LIVE';
let liveTeam = null;

function getTeams() {
  const teams = parseOptions();
  return liveTeam ? [liveTeam, ...teams] : teams;
}

function parseOptions() {
  let raw;
  try {
    raw = fs.readFileSync(OPTIONS_PATH, 'utf-8');
  } catch (e) {
    return [];
  }
  // teams are separated by one or more blank lines
  const blocks = raw.split(/\r?\n\s*\r?\n/);
  const teams = [];
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const title = lines[0];
    const players = lines.slice(1).map((line) => {
      const idx = line.indexOf('-');
      if (idx === -1) return { player: line, agent: '' };
      return { player: line.slice(0, idx).trim(), agent: line.slice(idx + 1).trim() };
    });
    teams.push({ title, players });
  }
  return teams;
}

function readScore() {
  try {
    return JSON.parse(fs.readFileSync(SCORE_PATH, 'utf-8'));
  } catch (e) {
    return { teamLabel: 'UB', opponentLabel: 'OPP', us: 0, them: 0, bestOf: 3 };
  }
}

function writeScore(score) {
  fs.writeFileSync(SCORE_PATH, JSON.stringify(score, null, 2));
}

function readActive() {
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_PATH, 'utf-8'));
  } catch (e) {
    return { title: null };
  }
}

function writeActive(active) {
  fs.writeFileSync(ACTIVE_PATH, JSON.stringify(active, null, 2));
}

// Which team the LIVE roster follows: 'ours' | 'enemy' | 'blue' | 'red'
const LIVE_SIDES = ['ours', 'enemy', 'blue', 'red'];

function readLiveSide() {
  try {
    return JSON.parse(fs.readFileSync(LIVE_SIDE_PATH, 'utf-8'));
  } catch (e) {
    return { side: 'ours' };
  }
}

function writeLiveSide(liveSide) {
  fs.writeFileSync(LIVE_SIDE_PATH, JSON.stringify(liveSide, null, 2));
}

function readIntro() {
  try {
    return JSON.parse(fs.readFileSync(INTRO_PATH, 'utf-8'));
  } catch (e) {
    return { targetTime: null, format: 3, maps: ['', '', ''] };
  }
}

function writeIntro(intro) {
  fs.writeFileSync(INTRO_PATH, JSON.stringify(intro, null, 2));
}

function listImageNames(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => f.replace(/\.(png|jpg|jpeg|webp)$/i, ''))
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return [];
  }
}

// ---------- SSE (live push to overlay) ----------

let clients = [];

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => res.write(payload));
}

app.get('/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  clients.push(res);

  // send current state immediately so a fresh OBS browser source is in sync
  res.write(`event: teams\ndata: ${JSON.stringify(getTeams())}\n\n`);
  res.write(`event: score\ndata: ${JSON.stringify(readScore())}\n\n`);
  res.write(`event: active\ndata: ${JSON.stringify(readActive())}\n\n`);
  res.write(`event: intro\ndata: ${JSON.stringify(readIntro())}\n\n`);

  req.on('close', () => {
    clients = clients.filter((c) => c !== res);
  });
});

// ---------- score API (used by the on-screen control panel) ----------

app.get('/api/score', (req, res) => res.json(readScore()));

app.post('/api/score', (req, res) => {
  const updated = { ...readScore(), ...req.body };
  writeScore(updated);
  broadcast('score', updated);
  res.json(updated);
});

// ---------- teams API ----------

app.get('/api/teams', (req, res) => res.json(getTeams()));

app.get('/api/active', (req, res) => res.json(readActive()));

app.post('/api/active', (req, res) => {
  const updated = { title: req.body.title != null ? req.body.title : null };
  writeActive(updated);
  broadcast('active', updated);
  res.json(updated);
});

app.get('/api/live-side', (req, res) => res.json(readLiveSide()));

app.post('/api/live-side', (req, res) => {
  if (!LIVE_SIDES.includes(req.body.side)) return res.status(400).json({ error: 'unknown side' });
  const updated = { side: req.body.side };
  writeLiveSide(updated);
  broadcast('liveSide', updated);
  res.json(updated);
  pollLive(); // swap the roster right away instead of waiting for the next tick
});

// ---------- intro scene API (timer, team logos, map picks) ----------

app.get('/api/intro', (req, res) => res.json(readIntro()));

app.post('/api/intro', (req, res) => {
  const updated = { ...readIntro(), ...req.body };
  writeIntro(updated);
  broadcast('intro', updated);
  res.json(updated);
});

app.get('/api/maps', (req, res) => res.json(listImageNames(MAPS_DIR)));

app.get('/api/team-logos', (req, res) => res.json(listImageNames(TEAMS_DIR)));

// Look up an image by name regardless of exact extension/case - this is more forgiving
// than assuming every file is exactly "<name>.png".
function findImageFile(dir, name) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return null;
  }
  const target = name.trim().toLowerCase();
  const match = files.find((f) => {
    const noExt = f.replace(/\.(png|jpg|jpeg|webp)$/i, '').toLowerCase();
    return noExt === target && /\.(png|jpg|jpeg|webp)$/i.test(f);
  });
  return match ? path.join(dir, match) : null;
}

app.get('/team-logo/:name', (req, res) => {
  const file = findImageFile(TEAMS_DIR, req.params.name);
  if (!file) return res.status(404).end();
  res.sendFile(file);
});

app.get('/map-image/:name', (req, res) => {
  const file = findImageFile(MAPS_DIR, req.params.name);
  if (!file) return res.status(404).end();
  res.sendFile(file);
});

// ---------- shutdown (used by the "Shut Down Server" button in the control panel) ----------

app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 200);
});

// ---------- watch options.txt for live changes ----------
// Polling is used instead of fs.watch because fs.watch is unreliable on
// some Windows/network-drive setups. 1s is fast enough to feel instant.

let lastOptionsRaw = null;
setInterval(() => {
  try {
    const raw = fs.readFileSync(OPTIONS_PATH, 'utf-8');
    if (raw !== lastOptionsRaw) {
      lastOptionsRaw = raw;
      broadcast('teams', getTeams());
    }
  } catch (e) {
    // options.txt not found yet / temporarily locked while being saved - ignore
  }
}, 1000);

// ---------- poll the Valorant client for the live roster ----------
// Silently does nothing while Valorant isn't open or you're in menus.

let lastLiveMatchId = null;
let livePolling = false;
async function pollLive() {
  if (livePolling) return; // previous poll still waiting on Riot's servers
  livePolling = true;
  try {
    // order live players the same way they're listed in options.txt
    const preferredOrder = [];
    for (const team of parseOptions()) {
      for (const p of team.players) {
        const name = p.player.toLowerCase();
        if (!preferredOrder.includes(name)) preferredOrder.push(name);
      }
    }

    const roster = await fetchLiveRoster(preferredOrder, readLiveSide().side);
    if (!roster) return;

    const next = { title: LIVE_TITLE, live: true, map: roster.map, players: roster.players };
    if (JSON.stringify(next) !== JSON.stringify(liveTeam)) {
      liveTeam = next;
      broadcast('teams', getTeams());
    }

    // new match detected - switch the overlay to the live roster automatically
    if (roster.matchId !== lastLiveMatchId) {
      lastLiveMatchId = roster.matchId;
      console.log(`Valorant match detected${roster.map ? ` on ${roster.map}` : ''} - showing live roster.`);
      const active = { title: LIVE_TITLE };
      writeActive(active);
      broadcast('active', active);
    }
  } catch (e) {
    // Riot Client closed mid-request, network hiccup, etc. - try again next tick
  } finally {
    livePolling = false;
  }
}
setInterval(pollLive, 2000);

app.listen(PORT, () => {
  console.log('');
  console.log('OBS overlay server is running:');
  console.log(`  Roster overlay (add as OBS Browser Source): http://localhost:${PORT}/overlay.html`);
  console.log(`  Intro/timer overlay (add as OBS Browser Source): http://localhost:${PORT}/intro.html`);
  console.log(`  Control panel (open in a browser or OBS custom dock): http://localhost:${PORT}/control.html`);
  console.log('');
});
