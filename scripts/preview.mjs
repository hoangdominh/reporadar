import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, PUBLIC_FILES } from './files.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

export async function createPreview({ root = new URL('dist/', ROOT), base = '/' } = {}) {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('Base must be / or /project-name/');
  const directory = await realpath(root);
  return createServer(async (request, response) => {
    const send = (status, text) => { response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); response.end(text); };
    if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); send(405, 'Method not allowed'); return; }
    try {
      const path = decodeURIComponent((request.url ?? '/').split('?')[0]);
      if (!path.startsWith(base) || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part === '..' || part === '.')) { send(404, 'Not found'); return; }
      const relative = path.slice(base.length) || 'index.html';
      if (!PUBLIC_FILES.includes(relative)) { send(404, 'Not found'); return; }
      const file = await realpath(resolve(directory, relative));
      if (!file.startsWith(directory + sep) || file !== resolve(directory, relative) || !(await stat(file)).isFile()) { send(404, 'Not found'); return; }
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type': MIME[extname(file)], 'Content-Length': body.length,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { send(404, 'Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [target = 'dist', base = '/'] = process.argv.slice(2);
    if (!['dist', 'root'].includes(target) || process.argv.length > 4) throw new Error('Usage: npm run preview -- [dist|root] [/base/]');
    const port = Number(process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535');
    const root = target === 'root' ? ROOT : new URL('dist/', ROOT);
    const server = await createPreview({ root, base });
    server.on('error', error => { console.error(`Preview failed: ${error.code}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`Preview ${fileURLToPath(root)} at http://127.0.0.1:${port}${base}`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
