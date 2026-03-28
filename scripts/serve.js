const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 8080);
const root = process.argv[3] || 'F:\\DarkArea_InventoryUI';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ii': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relativePath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
  const filePath = path.resolve(root, relativePath);
  const rootPath = path.resolve(root);

  if (!filePath.startsWith(rootPath)) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    let resolvedPath = filePath;

    if (!statErr && stats.isDirectory()) {
      resolvedPath = path.join(filePath, 'index.html');
    }

    fs.readFile(resolvedPath, (readErr, data) => {
      if (readErr) {
        send(res, 404, 'Not Found');
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const type = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}/`);
});
