// Image lookups: team logos from assets/teams, and agent icons + map images from valorant-api.com.

const fs = require('fs');
const path = require('path');
const { download } = require('./http');
const { normalizeName } = require('./valorant-api');

const IMAGE_EXT = /\.(png|jpg|jpeg|webp)$/i;

// Names of the images in a folder, without extensions ("Ball State.png" -> "Ball State")
function listImageNames(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => IMAGE_EXT.test(f))
      .map((f) => f.replace(IMAGE_EXT, ''))
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return [];
  }
}

// Look up an image by name regardless of exact extension/case - this is more forgiving
// than assuming every file is exactly "<name>.png".
function findImageFile(dir, name) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    return null;
  }
  const target = name.trim().toLowerCase();
  const match = files.find((f) => IMAGE_EXT.test(f) && f.replace(IMAGE_EXT, '').toLowerCase() === target);
  return match ? path.join(dir, match) : null;
}

// Agent icons and map images come from valorant-api.com, so new agents/maps work without adding
// files. Each image is downloaded once and kept in cache/. If the API can't be reached, fall
// back to a matching file in the local assets folder.
async function sendApiImage(res, { name, cacheDir, getUrl, localDir }) {
  const key = normalizeName(name);
  if (!key) return res.status(404).end();

  const cached = path.join(cacheDir, key + '.png');
  if (fs.existsSync(cached)) return res.sendFile(cached);

  try {
    const url = await getUrl(key);
    if (url) {
      const image = await download(url);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cached, image);
      return res.sendFile(cached);
    }
  } catch (e) {
    // offline / API down - try the local folder below
  }

  let localFiles = [];
  try {
    localFiles = fs.readdirSync(localDir);
  } catch (e) {
    // no local folder
  }
  // "Jett_icon.png" / "jett.png" / "Ascent.webp" all match
  const local = localFiles.find(
    (f) => IMAGE_EXT.test(f) && normalizeName(f.replace(/(_icon)?\.\w+$/i, '')) === key
  );
  if (local) return res.sendFile(path.join(localDir, local));
  res.status(404).end();
}

module.exports = { listImageNames, findImageFile, sendApiImage };
