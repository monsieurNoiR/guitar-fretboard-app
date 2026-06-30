const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3443;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const options = {
  key:  fs.readFileSync(path.join(ROOT, 'key.pem')),
  cert: fs.readFileSync(path.join(ROOT, 'cert.pem')),
};

const ROOT_WITH_SEP = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;

function isSafeChild(filePath) {
  // ROOT 自身、または ROOT/ 以下であることをセパレータ付きで確認
  return filePath === ROOT || filePath.startsWith(ROOT_WITH_SEP);
}

const server = https.createServer(options, (req, res) => {
  // パーセントエンコーディングをデコードしてからパス結合（%2e%2e%2f 等を正規化）
  let decoded;
  try {
    decoded = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // NUL バイトを拒否
  if (decoded.includes('\0')) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (decoded === '/') decoded = '/index.html';

  // path.resolve でシンボリックリンクなしの正規パスを生成
  const filePath = path.resolve(ROOT, '.' + decoded);

  if (!isSafeChild(filePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // シンボリックリンク経由の脱出を防ぐため realpath で確認
  fs.realpath(filePath, (rpErr, realFilePath) => {
    if (rpErr || !isSafeChild(realFilePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    fs.readFile(realFilePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(realFilePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nGuitar Fretboard App HTTPS server running`);
  console.log(`  Local:  https://localhost:${PORT}`);
  console.log(`  iPad:   https://192.168.1.7:${PORT}\n`);
});
