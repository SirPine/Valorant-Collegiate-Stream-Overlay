// Starts the overlay server. Every URL it handles is listed here; the work itself lives in the
// other files in src/.

const express = require('express');
const paths = require('./paths');
const state = require('./state');
const { broadcast, addClient } = require('./events');
const { getLiveRoster, refreshSides, startLiveRoster } = require('./live-roster');
const { startMapPool } = require('./map-pool');
const { listImageNames, findImageFile, sendApiImage } = require('./images');
const { getAgentIconUrl, getMapList, getMapSplashUrl } = require('./valorant-api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(paths.PUBLIC_DIR));
app.use('/static.png', express.static(paths.STATIC_BG_PATH));
app.use('/intro-background.png', express.static(paths.INTRO_BG_PATH));
app.use('/teams', express.static(paths.TEAMS_DIR));

// ---------- live updates ----------

app.get('/events', (req, res) =>
  addClient(req, res, {
    roster: getLiveRoster(),
    score: state.readScore(),
    intro: state.readIntro(),
    mapPool: state.readMapPool(),
  })
);

// ---------- score (control panel) ----------

app.get('/api/score', (req, res) => res.json(state.readScore()));

app.post('/api/score', (req, res) => {
  const updated = { ...state.readScore(), ...req.body };
  state.writeScore(updated);
  broadcast('score', updated);
  res.json(updated);
});

// ---------- live roster ----------

app.get('/api/roster', (req, res) => res.json(getLiveRoster()));

// "Switch Teams": swap which in-game team shows on the left (your team) and right (opponent)
app.post('/api/switch-teams', (req, res) => {
  const updated = { swapped: !state.readSides().swapped };
  state.writeSides(updated);
  refreshSides();
  res.json(updated);
});

// ---------- intro scene (timer, team logos, map picks) ----------

app.get('/api/intro', (req, res) => res.json(state.readIntro()));

app.post('/api/intro', (req, res) => {
  const updated = { ...state.readIntro(), ...req.body };
  state.writeIntro(updated);
  broadcast('intro', updated);
  res.json(updated);
});

// Every competitive map, from valorant-api.com, so new maps show up on their own. Falls back to
// the files in assets/maps if the API can't be reached.
app.get('/api/maps', async (req, res) => {
  let maps = null;
  try {
    maps = await getMapList();
  } catch (e) {
    // offline - use the local folder
  }
  res.json(maps || listImageNames(paths.MAPS_DIR));
});

// Which of those maps are in the current competitive rotation (last seen in Valorant)
app.get('/api/map-pool', (req, res) => res.json(state.readMapPool()));

app.get('/api/team-logos', (req, res) => res.json(listImageNames(paths.TEAMS_DIR)));

// ---------- images ----------

app.get('/team-logo/:name', (req, res) => {
  const file = findImageFile(paths.TEAMS_DIR, req.params.name);
  if (!file) return res.status(404).end();
  res.sendFile(file);
});

app.get('/agent-icon/:name', (req, res) =>
  sendApiImage(res, {
    name: req.params.name,
    cacheDir: paths.AGENT_ICON_CACHE_DIR,
    getUrl: getAgentIconUrl,
    localDir: paths.AGENT_ICON_DIR,
  })
);

app.get('/map-image/:name', (req, res) =>
  sendApiImage(res, {
    name: req.params.name,
    cacheDir: paths.MAP_CACHE_DIR,
    getUrl: getMapSplashUrl,
    localDir: paths.MAPS_DIR,
  })
);

// ---------- shutdown (the "Shut Down Server" button in the control panel) ----------

app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 200);
});

// ---------- start ----------

startLiveRoster();
startMapPool();

app.listen(PORT, () => {
  console.log('');
  console.log('OBS overlay server is running:');
  console.log(`  Roster overlay (add as OBS Browser Source): http://localhost:${PORT}/overlay.html`);
  console.log(`  Intro/timer overlay (add as OBS Browser Source): http://localhost:${PORT}/intro.html`);
  console.log(`  Control panel (open in a browser or OBS custom dock): http://localhost:${PORT}/control.html`);
  console.log('');
});
