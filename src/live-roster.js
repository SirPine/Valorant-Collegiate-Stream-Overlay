// Polls the Valorant client every 2s and keeps the current roster for both teams. The roster is
// only ever what players actually picked in game. Outside a match it's empty, so the overlay
// shows no names or agents.
//
// The overlay has a left side (your team - "Our team" on the Score tab) and a right side (the
// opponent). By default the left side is the in-game team you're on, or Blue when spectating;
// "Switch Teams" in the control panel swaps them.

const { fetchLiveRoster } = require('./riot-client');
const { readSides } = require('./state');
const { broadcast } = require('./events');

const EMPTY_ROSTER = { map: '', left: [], right: [] };
// a few misses in a row before clearing, so a slow request or the switch from agent select
// to the live game doesn't blank the overlay for a moment
const MISSES_BEFORE_CLEAR = 3;

let lastGame = null; // last fetchLiveRoster() result, so a team switch shows up instantly
let liveRoster = EMPTY_ROSTER;
let missedPolls = 0;
let livePolling = false;

function getLiveRoster() {
  return liveRoster;
}

function setLiveRoster(next) {
  if (JSON.stringify(next) === JSON.stringify(liveRoster)) return;
  liveRoster = next;
  broadcast('roster', liveRoster);
}

// in-game teams (Blue/Red) -> overlay sides. During agent select Riot only reveals your own
// team, so the other side stays empty until the match loads.
function toSides(game) {
  const ourTeam = game.myTeam || 'Blue';
  const otherTeam = ourTeam === 'Blue' ? 'Red' : 'Blue';
  const [leftTeam, rightTeam] = readSides().swapped ? [otherTeam, ourTeam] : [ourTeam, otherTeam];
  return { map: game.map, left: game.teams[leftTeam] || [], right: game.teams[rightTeam] || [] };
}

// re-apply the left/right choice right away (after "Switch Teams")
function refreshSides() {
  if (lastGame) setLiveRoster(toSides(lastGame));
}

async function pollLive() {
  if (livePolling) return; // previous poll still waiting on Riot's servers
  livePolling = true;
  let game = null;
  try {
    game = await fetchLiveRoster();
  } catch (e) {
    // Riot Client closed mid-request, network hiccup, etc. - counts as a miss
  } finally {
    livePolling = false;
  }

  if (!game) {
    missedPolls++;
    if (missedPolls >= MISSES_BEFORE_CLEAR && lastGame) {
      console.log('Not in a Valorant match - roster cleared.');
      lastGame = null;
      setLiveRoster(EMPTY_ROSTER);
    }
    return;
  }

  missedPolls = 0;
  if (!lastGame || game.matchId !== lastGame.matchId) {
    console.log(`Valorant match detected${game.map ? ` on ${game.map}` : ''} - showing live roster.`);
  }
  lastGame = game;
  setLiveRoster(toSides(game));
}

function startLiveRoster() {
  setInterval(pollLive, 2000);
}

module.exports = { getLiveRoster, refreshSides, startLiveRoster };
