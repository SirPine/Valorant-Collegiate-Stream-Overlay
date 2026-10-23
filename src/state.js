// Everything the control panel saves (score, intro scene, whether the teams are switched) lives
// in one file, cache/state.json, so it survives a restart. Missing sections fall back to defaults.

const fs = require('fs');
const { CACHE_DIR, STATE_PATH } = require('./paths');

const DEFAULT_STATE = {
  score: { teamLabel: 'UB', opponentLabel: 'OPP', us: 0, them: 0, bestOf: 3 },
  intro: { targetTime: null, format: 3, maps: ['', '', ''] },
  // swapped: false = your in-game team on the left (Blue when spectating), true = on the right
  sides: { swapped: false },
};

// only known sections are kept, so settings that no longer exist drop out of the file
function readState() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  } catch (e) {
    // no file yet - all defaults
  }
  const state = {};
  for (const section of Object.keys(DEFAULT_STATE)) state[section] = saved[section] || DEFAULT_STATE[section];
  return state;
}

function writeState(section, value) {
  const state = readState();
  state[section] = value;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

module.exports = {
  readScore: () => readState().score,
  writeScore: (score) => writeState('score', score),
  readIntro: () => readState().intro,
  writeIntro: (intro) => writeState('intro', intro),
  readSides: () => readState().sides,
  writeSides: (sides) => writeState('sides', sides),
};
