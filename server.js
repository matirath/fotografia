const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const archiver = require('archiver');

let CLIENTES = [];
try {
  const configPath = path.join(__dirname, 'clientes-config.json');
  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    CLIENTES = Array.isArray(configData.clientes) ? configData.clientes : [];
  }
} catch (err) {
  console.warn('No se pudo cargar clientes-config.json:', err.message);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function isSafeRelativePath(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_\-/]*$/.test(value) && !value.includes('..');
}

function listImagesInDirectory(absDirPath, requestPathPrefix, startsWithFilter) {
  const entries = fs.readdirSync(absDirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => {
      const ext = path.extname(fileName).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) return false;
      if (!startsWithFilter) return true;
      return fileName.toLowerCase().startsWith(startsWithFilter.toLowerCase());
    })
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

  return files.map((fileName) => ({
    src: path.posix.join(requestPathPrefix, fileName),
    alt: path.basename(fileName, path.extname(fileName)).replace(/[-_]+/g, ' ').trim(),
  }));
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  let pathname = parsed.pathname;

  if (pathname === '/api/gallery') {
    const folder = (parsed.searchParams.get('folder') || '').trim().replace(/^\/+|\/+$/g, '');
    const startsWith = (parsed.searchParams.get('startsWith') || '').trim();

    if (folder && !isSafeRelativePath(folder)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Parametro folder invalido' }));
      return;
    }

    const baseImagesDir = path.join(__dirname, 'imgs');
    const targetDir = folder ? path.join(baseImagesDir, folder) : baseImagesDir;
    const normalizedBase = path.resolve(baseImagesDir);
    const normalizedTarget = path.resolve(targetDir);

    if (!normalizedTarget.startsWith(normalizedBase)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Acceso denegado' }));
      return;
    }

    if (!fs.existsSync(normalizedTarget) || !fs.statSync(normalizedTarget).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Carpeta no encontrada' }));
      return;
    }

    try {
      const requestPrefix = folder ? path.posix.join('/imgs', folder) : '/imgs';
      const images = listImagesInDirectory(normalizedTarget, requestPrefix, startsWith);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ images }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No se pudo listar la galeria' }));
      return;
    }
  }

  if (pathname === '/api/download-favorites') {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 10 * 1024 * 1024) {
        res.writeHead(413);
        res.end('Payload too large');
        req.connection.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const fotos = Array.isArray(payload.fotos) ? payload.fotos : [];
        const clave = (payload.clave || 'galeria').replace(/[^a-zA-Z0-9_-]/g, '');

        if (!fotos.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No hay fotos para descargar' }));
          return;
        }

        // Limita a 500 fotos máximo
        const fotosList = fotos.slice(0, 500);

        const archive = archiver('zip', { zlib: { level: 6 } });
        const filename = `galeria-${clave}-${Date.now()}.zip`;

        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store'
        });

        archive.pipe(res);

        for (const fotoSrc of fotosList) {
          const fotoPath = path.join(__dirname, fotoSrc.replace(/^\//, ''));
          const normalizedBase = path.resolve(path.join(__dirname, 'imgs'));
          const normalizedFoto = path.resolve(fotoPath);

          if (!normalizedFoto.startsWith(normalizedBase)) {
            console.warn('Intento de acceso denegado:', fotoSrc);
            continue;
          }

          if (fs.existsSync(normalizedFoto)) {
            const filename = path.basename(normalizedFoto);
            archive.file(normalizedFoto, { name: filename });
          }
        }

        archive.on('error', (err) => {
          console.error('Archive error:', err);
          res.writeHead(500);
          res.end('Error generating archive');
        });

        await archive.finalize();
      } catch (err) {
        console.error('Download-favorites error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error processing request' }));
      }
    });
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(__dirname, pathname);

  // Prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, {'Content-Type': 'text/plain'});
      res.end('File not found: ' + pathname);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME[ext] || 'application/octet-stream'});
    res.end(data);
  });
});

server.listen(8000, () => {
  console.log('Server running at http://localhost:8000');
});