const http = require('http');
const fs = require('fs');
const path = require('path');

let PORT = parseInt(process.env.PORT, 10) || 3333;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4'
};

function startServer(portToUse) {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    // Rota oficial: "/" abre a página de vendas nova; o app continua em /index.html (ou /app)
    if (reqPath === '/' || !reqPath) reqPath = '/landing_v3.html';
    if (reqPath === '/app' || reqPath === '/app/') reqPath = '/index.html';
    
    const filePath = path.join(PUBLIC_DIR, '.' + reqPath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404;
          res.end('File Not Found');
        } else {
          res.statusCode = 500;
          res.end(`Server Error: ${err.code}`);
        }
      } else {
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.statusCode = 200;
        res.end(data);
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      startServer(portToUse + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(portToUse, () => {
    console.log(`🚀 CantaAí HTTP Server running at http://localhost:${portToUse}`);
  });
}

startServer(PORT);
