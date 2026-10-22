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
const path = require('path');
const https = require('https');

const LOCKFILE_PATH = path.join(
  process.env.LOCALAPPDATA || '',
  'Riot Games',
  'Riot Client',
  'Config',
  'lockfile'
);

const CLIENT_PLATFORM = Buffer.from(
  JSON.stringify({
    platformType: 'PC',
    platformOS: 'Windows',
    platformOSVersion: '10.0.19042.1.256.64bit',
    platformChipset: 'Unknown',
  })
).toString('base64');

const REGION_TO_SHARD = { na: 'na', latam: 'na', br: 'na', eu: 'eu', ap: 'ap', kr: 'kr', pbe: 'pbe' };

// ---------- tiny HTTPS helper (the local API uses a self-signed cert) ----------

function request(url, { method = 'GET', headers = {}, body, insecure = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method, headers, rejectUnauthorized: !insecure, timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch (e) {
            // non-JSON body - leave as null
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

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

// ---------- static game data (agent + map names) from valorant-api.com ----------

let agentNames = null; // uuid -> "Jett"
let mapNames = null; // "/Game/Maps/Ascent/Ascent" -> "Ascent"
let clientVersion = null;

async function loadGameData() {
  if (!agentNames) {
    const res = await request('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    if (res.status === 200) {
      agentNames = {};
      for (const a of res.json.data) agentNames[a.uuid.toLowerCase()] = a.displayName;
    }
  }
  if (!mapNames) {
    const res = await request('https://valorant-api.com/v1/maps');
    if (res.status === 200) {
      mapNames = {};
      for (const m of res.json.data) mapNames[m.mapUrl] = m.displayName;
    }
  }
  if (!clientVersion) {
    const res = await request('https://valorant-api.com/v1/version');
    if (res.status === 200) clientVersion = res.json.data.riotClientVersion;
  }
}

// "KAY/O" -> "KAYO", to match the "<Agent>_icon.png" filenames in assets/agent icons
function agentIconName(characterId) {
  if (!characterId || !agentNames) return '';
  const name = agentNames[characterId.toLowerCase()] || '';
  return name.replace(/[^A-Za-z0-9]/g, '');
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

// side: 'ours' | 'enemy' | 'blue' | 'red'. "Ours" is the team you're on - or, when
// spectating, the team whose names best match the rosters in options.txt.
async function pickTeamId(ctx, game, side, preferredNames) {
  if (side === 'blue') return 'Blue';
  if (side === 'red') return 'Red';

  let ours = game.myTeam;
  if (!ours) {
    let best = -1;
    for (const [id, members] of Object.entries(game.teams)) {
      const names = await lookupNames(ctx, members.map((m) => m.puuid));
      const hits = names.filter((n) => preferredNames.has(n.toLowerCase())).length;
      if (hits > best) {
        best = hits;
        ours = id;
      }
    }
  }
  if (side === 'enemy') return Object.keys(game.teams).find((id) => id !== ours) || null;
  return ours;
}

// ---------- main poll ----------

// preferredOrder: lowercase player names from options.txt, used to order the live roster the
// same way as your hand-written one (and to pick "our" team when spectating).
async function fetchLiveRoster(preferredOrder, side = 'ours') {
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

  const ctx = {
    region,
    shard,
    puuid: tokens.json.subject,
    headers: {
      Authorization: `Bearer ${tokens.json.accessToken}`,
      'X-Riot-Entitlements-JWT': tokens.json.token,
      'X-Riot-ClientPlatform': CLIENT_PLATFORM,
      'X-Riot-ClientVersion': clientVersion || session.version || '',
    },
  };

  const game = (await getPregame(ctx)) || (await getCoreGame(ctx));
  if (!game) return null; // in menus / lobby

  // The chosen team may not be visible yet (e.g. the enemy during agent select) - show an
  // empty roster until the match loads rather than stale names from last game.
  const teamId = await pickTeamId(ctx, game, side, new Set(preferredOrder));
  const members = game.teams[teamId] || [];

  const names = await lookupNames(ctx, members.map((p) => p.puuid));
  const players = members.map((p, i) => ({ player: names[i], agent: agentIconName(p.characterId) }));

  const rank = (name) => {
    const idx = preferredOrder.indexOf(name.toLowerCase());
    return idx === -1 ? Infinity : idx;
  };
  players.sort((a, b) => rank(a.player) - rank(b.player) || a.player.localeCompare(b.player));

  return {
    matchId: game.matchId,
    map: (mapNames && mapNames[game.mapId]) || '',
    players,
  };
}

module.exports = { fetchLiveRoster };
