// Tiny HTTPS helpers shared by the Riot Client and valorant-api.com code.

const https = require('https');

// JSON request. `insecure` is for the Riot Client's local API, which uses a self-signed cert.
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

// Raw file download (images).
function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 10000 }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('timeout', function () {
        this.destroy(new Error('timeout'));
      })
      .on('error', reject);
  });
}

module.exports = { request, download };
