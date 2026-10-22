// Polls the Valorant client every 2s and keeps the current roster. The roster is only ever what
// players actually picked in game. Outside a match it's empty, so the overlay shows no names or
// agents.

const { fetchLiveRoster } = require('./riot-client');
const { readLiveSide } = require('./state');
const { broadcast } = require('./events');

const EMPTY_ROSTER = { map: '', players: [] };
// a few misses in a row before clearing, so a slow request or the switch from agent select
// to the live game doesn't blank the overlay for a moment
const MISSES_BEFORE_CLEAR = 3;

let liveRoster = EMPTY_ROSTER;
let lastLiveMatchId = null;
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

async function pollLive() {
  if (livePolling) return; // previous poll still waiting on Riot's servers
  livePolling = true;
  let roster = null;
  try {
    roster = await fetchLiveRoster(readLiveSide().side);
  } catch (e) {
    // Riot Client closed mid-request, network hiccup, etc. - counts as a miss
  } finally {
    livePolling = false;
  }

  if (!roster) {
    missedPolls++;
    if (missedPolls >= MISSES_BEFORE_CLEAR && liveRoster.players.length) {
      console.log('Not in a Valorant match - roster cleared.');
      lastLiveMatchId = null;
      setLiveRoster(EMPTY_ROSTER);
    }
    return;
  }

  missedPolls = 0;
  if (roster.matchId !== lastLiveMatchId) {
    lastLiveMatchId = roster.matchId;
    console.log(`Valorant match detected${roster.map ? ` on ${roster.map}` : ''} - showing live roster.`);
  }
  setLiveRoster({ map: roster.map, players: roster.players });
}

function startLiveRoster() {
  setInterval(pollLive, 2000);
}

module.exports = { getLiveRoster, pollLive, startLiveRoster };
