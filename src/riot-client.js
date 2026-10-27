// Pulls the live roster (player names + agents) straight from the running Valorant client.
//
// How it works: the Riot Client exposes a local HTTPS API (port + password are in its
// "lockfile"). From that we get auth tokens, our own player ID and region, then ask Riot's
// game servers what match we're in - first agent select ("pregame"), then the live game
// ("core-game"). Player IDs are turned into names via Riot's name service, and agent/map
// IDs into display names via valorant-api.com.
//
// This is the same read-only API that tools like VRY use. It only works on the PC that is
// running Valorant (playing or spectating), and it's unofficial, so Riot can change it.

const fs = require('fs');
const { request } = require('./http');
const { LOCKFILE_PATH } = require('./paths');
const { loadGameData, agentNameForId, mapNameForId, mapNameForCode, getClientVersion } = require('./valorant-api');

const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown',
  })
).toString('base64');

const REGION_TO_SHARD = { na: 'na', latam: 'na', br: 'na', eu: 'eu', ap: 'ap', kr: 'kr', pbe: 'pbe' };

// ---------- local Riot Client API ----------

function readLockfile() {
  try {
    const [, , port, password, protocol] = fs.readFileSync(LOCKFILE_PATH, 'utf-8').split(':');
    return { port, password, protocol };
  } catch (e) {
    return null; // Riot Client isn't running
  }
}

function localGet(lock, endpoint) {
  const auth = Buffer.from(`riot:${lock.password}`).toString('base64');
  return request(`https://127.0.0.1:${lock.port}${endpoint}`, {
    headers: { Authorization: `Basic ${auth}` },
    insecure: true,
  });
}

// Returns the Valorant launch session (only present while the game is open), which carries
// the region in its launch args, e.g. "-ares-deployment=na".
async function getValorantSession(lock) {
  const res = await localGet(lock, '/product-session/v1/external-sessions');
  if (res.status !== 200 || !res.json) return null;
  return Object.values(res.json).find((s) => s.productId === 'valorant') || null;
}

function regionFromSession(session) {
  const args = (session.launchConfiguration && session.launchConfiguration.arguments) || [];
  const arg = args.find((a) => a.startsWith('-ares-deployment='));
  return arg ? arg.split('=')[1] : null;
}

// ---------- remote (Riot game server) API ----------

const nameCache = {}; // puuid -> GameName

async function lookupNames(ctx, puuids) {
  const missing = puuids.filter((id) => !nameCache[id]);
  if (missing.length) {
    const res = await request(`https://pd.${ctx.shard}.a.pvp.net/name-service/v2/players`, {
      method: 'PUT',
      headers: { ...ctx.headers, 'Content-Type': 'application/json' },
      body: missing,
    });
    if (res.status === 200 && Array.isArray(res.json)) {
      for (const p of res.json) nameCache[p.Subject] = p.GameName;
    }
  }
  return puuids.map((id) => nameCache[id] || '');
}

// Both getters return { matchId, mapId, myTeam, teams: { Blue: [...], Red: [...] } }.
// During agent select Riot only reveals your own team, so `teams` has just that one.

async function getPregame(ctx) {
  const glz = `https://glz-${ctx.region}-1.${ctx.shard}.a.pvp.net`;
  const player = await request(`${glz}/pregame/v1/players/${ctx.puuid}`, { headers: ctx.headers });
  if (player.status !== 200 || !player.json) return null;
  const match = await request(`${glz}/pregame/v1/matches/${player.json.MatchID}`, { headers: ctx.headers });
  if (match.status !== 200 || !match.json) return null;
  const ally = match.json.AllyTeam || { TeamID: 'Blue', Players: [] };
  return {
    matchId: match.json.ID,
    mapId: match.json.MapID,
    myTeam: ally.TeamID,
    teams: { [ally.TeamID]: ally.Players.map((p) => ({ puuid: p.Subject, characterId: p.CharacterID })) },
  };
}

async function getCoreGame(ctx) {
  const glz = `https://glz-${ctx.region}-1.${ctx.shard}.a.pvp.net`;
  const player = await request(`${glz}/core-game/v1/players/${ctx.puuid}`, { headers: ctx.headers });
  if (player.status !== 200 || !player.json) return null;
  const match = await request(`${glz}/core-game/v1/matches/${player.json.MatchID}`, { headers: ctx.headers });
  if (match.status !== 200 || !match.json) return null;

  const all = match.json.Players || [];
  const teams = {};
  for (const p of all) {
    (teams[p.TeamID] = teams[p.TeamID] || []).push({ puuid: p.Subject, characterId: p.CharacterID });
  }
  return {
    matchId: match.json.MatchID,
    mapId: match.json.MapID,
    myTeam: (all.find((p) => p.Subject === ctx.puuid) || {}).TeamID, // undefined when spectating
    teams,
  };
}

// ---------- main entry points ----------

// Logs in through the local Riot Client. Returns what the game-server requests need, or null if
// the Riot Client or Valorant isn't running.
async function connect() {
  const lock = readLockfile();
  if (!lock) return null;

  const session = await getValorantSession(lock);
  if (!session) return null; // Valorant not open

  const region = regionFromSession(session);
  const shard = REGION_TO_SHARD[region];
  if (!shard) return null;

  const tokens = await localGet(lock, '/entitlements/v1/token');
  if (tokens.status !== 200 || !tokens.json) return null;

  await loadGameData();

  return {
    region,
    shard,
    puuid: tokens.json.subject,
    headers: {
      Authorization: `Bearer ${tokens.json.accessToken}`,
      'X-Riot-Entitlements-JWT': tokens.json.token,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': getClientVersion() || session.version || '',
    },
  };
}

// Returns { matchId, map, myTeam, teams: { Blue: [{ player, agent }], Red: [...] } }, or null
// when not in a match. myTeam is undefined when spectating. During agent select only your own
// team is known.
async function fetchLiveRoster() {
  const ctx = await connect();
  if (!ctx) return null;

  const game = (await getPregame(ctx)) || (await getCoreGame(ctx));
  if (!game) return null; // in menus / lobby

  const puuids = Object.values(game.teams).flat().map((p) => p.puuid);
  const names = await lookupNames(ctx, puuids);
  const nameOf = Object.fromEntries(puuids.map((id, i) => [id, names[i]]));

  const teams = {};
  for (const [teamId, members] of Object.entries(game.teams)) {
    teams[teamId] = members
      .map((p) => ({ player: nameOf[p.puuid], agent: agentNameForId(p.characterId) }))
      // alphabetical, so the rows don't reshuffle between agent select and the live game
      .sort((a, b) => a.player.localeCompare(b.player, undefined, { sensitivity: 'base' }));
  }

  return {
    matchId: game.matchId,
    map: mapNameForId(game.mapId),
    myTeam: game.myTeam,
    teams,
  };
}

// The current competitive map pool, e.g. ["Abyss", "Bind", ...], or null if Valorant isn't open.
// Comes from the settings the game uses for custom games: each queue lists its maps with a
// weight, and maps out of rotation have weight 0. Map names there are code names ("Duality" =
// Bind), translated with valorant-api.com's map data.
async function fetchMapPool() {
  const ctx = await connect();
  if (!ctx) return null;

  const glz = `https://glz-${ctx.region}-1.${ctx.shard}.a.pvp.net`;
  const res = await request(`${glz}/parties/v1/parties/customgameconfigs`, { headers: ctx.headers });
  if (res.status !== 200 || !res.json) return null;

  const competitive = (res.json.Queues || []).find((q) => q.QueueID === 'competitive');
  if (!competitive || !Array.isArray(competitive.MapWeights)) return null;

  const pool = competitive.MapWeights.map((entry) => entry.split(':')) // "Duality:1"
    .filter(([, weight]) => Number(weight) > 0)
    .map(([code]) => mapNameForCode(code))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return pool.length ? pool : null;
}

module.exports = { fetchLiveRoster, fetchMapPool };
