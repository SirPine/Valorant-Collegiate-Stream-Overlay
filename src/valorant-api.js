// Static game data from valorant-api.com: agent and map names, agent icons, map images and the
// current client version. Fetched once and kept in memory; retried on the next call if the
// site couldn't be reached.

const { request } = require('./http');

let agentNames = null; // uuid -> "Jett"
let agentIconUrls = null; // "kayo" -> "https://media.valorant-api.com/agents/<uuid>/displayicon.png"
let mapNames = null; // "/Game/Maps/Ascent/Ascent" -> "Ascent"
let competitiveMaps = null; // [{ name: "Ascent", splash: "https://media.valorant-api.com/maps/<uuid>/splash.png" }]
let clientVersion = null;

async function loadGameData() {
  if (!agentNames) {
    const res = await request('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    if (res.status === 200) {
      agentNames = {};
      agentIconUrls = {};
      for (const a of res.json.data) {
        agentNames[a.uuid.toLowerCase()] = a.displayName;
        agentIconUrls[normalizeName(a.displayName)] = a.displayIcon;
      }
    }
  }
  if (!mapNames) {
    const res = await request('https://valorant-api.com/v1/maps');
    if (res.status === 200) {
      mapNames = {};
      competitiveMaps = [];
      for (const m of res.json.data) {
        mapNames[m.mapUrl] = m.displayName;
        // only competitive maps have callout descriptions ("A/B Sites") - this skips
        // The Range, Skirmish and the Team Deathmatch maps
        if (m.tacticalDescription && m.splash) competitiveMaps.push({ name: m.displayName, splash: m.splash });
      }
      competitiveMaps.sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  if (!clientVersion) {
    const res = await request('https://valorant-api.com/v1/version');
    if (res.status === 200) clientVersion = res.json.data.riotClientVersion;
  }
}

// "KAY/O" / "KAYO" / "kayo" -> "kayo", so any spelling of an agent or map name finds its image
function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getAgentIconUrl(name) {
  await loadGameData();
  return (agentIconUrls && agentIconUrls[normalizeName(name)]) || null;
}

// null if valorant-api.com can't be reached
async function getMapList() {
  await loadGameData();
  return competitiveMaps && competitiveMaps.map((m) => m.name);
}

async function getMapSplashUrl(name) {
  await loadGameData();
  const key = normalizeName(name);
  const map = (competitiveMaps || []).find((m) => normalizeName(m.name) === key);
  return map ? map.splash : null;
}

// The lookups below need loadGameData() to have run first.

// agent ID from the game -> "KAYO" (the name shown in the roster and used in icon URLs)
function agentNameForId(characterId) {
  if (!characterId || !agentNames) return '';
  const name = agentNames[characterId.toLowerCase()] || '';
  return name.replace(/[^A-Za-z0-9]/g, '');
}

// map path from the game ("/Game/Maps/Ascent/Ascent") -> "Ascent"
function mapNameForId(mapId) {
  return (mapNames && mapNames[mapId]) || '';
}

// map code name used in Riot's queue settings ("Duality") -> "Bind". The code name is the last
// part of the map path ("/Game/Maps/Duality/Duality").
function mapNameForCode(code) {
  if (!mapNames) return '';
  const path = Object.keys(mapNames).find((p) => p.split('/').pop() === code);
  return path ? mapNames[path] : '';
}

function getClientVersion() {
  return clientVersion;
}

module.exports = {
  loadGameData,
  normalizeName,
  getAgentIconUrl,
  getMapList,
  getMapSplashUrl,
  agentNameForId,
  mapNameForId,
  mapNameForCode,
  getClientVersion,
};
