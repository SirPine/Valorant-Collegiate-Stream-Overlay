// Live push to the overlay + control panel pages (Server-Sent Events). Each open page keeps a
// connection to /events, and broadcast() sends an update to all of them at once.

let clients = [];

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  clients.forEach((res) => send(res, event, data));
}

// `snapshot` is { eventName: data } sent right away, so a freshly opened page is in sync
function addClient(req, res, snapshot) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  clients.push(res);

  for (const [event, data] of Object.entries(snapshot)) send(res, event, data);

  req.on('close', () => {
    clients = clients.filter((c) => c !== res);
  });
}

module.exports = { broadcast, addClient };
