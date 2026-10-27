// Keeps the current competitive map pool up to date. Riot only tells us while Valorant is open, so
// the last pool seen is saved in cache/state.json and used the rest of the time. When Riot rotates
// maps (new act), the next check picks it up and every open control panel updates.

const { fetchMapPool } = require('./riot-client');
const { readMapPool, writeMapPool } = require('./state');
const { broadcast } = require('./events');

const CHECK_EVERY_MS = 60 * 1000; // until we've got the pool this run (e.g. waiting for Valorant to open)
const RECHECK_AFTER_MS = 10 * 60 * 1000; // after that, the pool only changes once an act

let lastSuccess = 0;
let checking = false;

async function checkMapPool() {
  if (checking || Date.now() - lastSuccess < RECHECK_AFTER_MS) return;
  checking = true;
  try {
    const maps = await fetchMapPool();
    if (!maps) return; // Valorant not open - keep the saved pool

    lastSuccess = Date.now();
    const saved = readMapPool();
    const changed = JSON.stringify(maps) !== JSON.stringify(saved.maps);
    // updatedAt = when we last confirmed the pool, so the control panel can show how fresh it is
    const updated = { maps, updatedAt: new Date().toISOString() };
    writeMapPool(updated);
    broadcast('mapPool', updated);
    if (changed) console.log(`Competitive map pool: ${maps.join(', ')}`);
  } catch (e) {
    // network hiccup / Riot Client closed mid-request - try again next tick
  } finally {
    checking = false;
  }
}

function startMapPool() {
  checkMapPool();
  setInterval(checkMapPool, CHECK_EVERY_MS);
}

module.exports = { startMapPool };
