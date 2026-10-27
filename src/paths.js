// Every folder and file the server reads or writes, in one place.

const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'assets');
const CACHE_DIR = path.join(ROOT, 'cache');

module.exports = {
  PUBLIC_DIR: path.join(ROOT, 'public'),

  // your images
  STATIC_BG_PATH: path.join(ASSETS_DIR, 'static.png'),
  INTRO_BG_PATH: path.join(ASSETS_DIR, 'intro-background.png'),
  TEAMS_DIR: path.join(ASSETS_DIR, 'teams'),
  // offline backups for the images that normally come from valorant-api.com
  AGENT_ICON_DIR: path.join(ASSETS_DIR, 'agent icons'),
  MAPS_DIR: path.join(ASSETS_DIR, 'maps'),

  // generated at runtime (git-ignored)
  CACHE_DIR,
  STATE_PATH: path.join(CACHE_DIR, 'state.json'),
  AGENT_ICON_CACHE_DIR: path.join(CACHE_DIR, 'agent-icons'),
  MAP_CACHE_DIR: path.join(CACHE_DIR, 'maps'),

  // written by the Riot Client while it's running; holds the port + password of its local API
  LOCKFILE_PATH: path.join(process.env.LOCALAPPDATA || '', 'Riot Games', 'Riot Client', 'Config', 'lockfile'),
};
