import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('./public', import.meta.url));
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg'};
createServer(async(req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep) || pathname.includes('/.')) throw Error();
    const data = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  } catch {res.writeHead(404); res.end('Not found');}
}).listen(Number(process.env.PORT || 3011), '127.0.0.1', () => console.log('http://127.0.0.1:3011/'));
