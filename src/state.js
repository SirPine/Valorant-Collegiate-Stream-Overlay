// Everything the control panel saves (score, intro scene, which team the roster follows) lives
// in one file, cache/state.json, so it survives a restart. Missing sections fall back to defaults.

const fs = require('fs');
const { CACHE_DIR, STATE_PATH } = require('./paths');

// Which team the live roster follows: 'ours' | 'enemy' | 'blue' | 'red'
const LIVE_SIDES = ['ours', 'enemy', 'blue', 'red'];

const DEFAULT_STATE = {
  score: { teamLabel: 'UB', opponentLabel: 'OPP', us: 0, them: 0, bestOf: 3 },
  intro: { targetTime: null, format: 3, maps: ['', '', ''] },
  liveSide: { side: 'ours' },
};

function readState() {
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) };
  } catch (e) {
    return { ...DEFAULT_STATE };
  }
}

function writeState(section, value) {
  const state = readState();
  state[section] = value;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

module.exports = {
  LIVE_SIDES,
  readScore: () => readState().score,
  writeScore: (score) => writeState('score', score),
  readIntro: () => readState().intro,
  writeIntro: (intro) => writeState('intro', intro),
  readLiveSide: () => readState().liveSide,
  writeLiveSide: (liveSide) => writeState('liveSide', liveSide),
};
