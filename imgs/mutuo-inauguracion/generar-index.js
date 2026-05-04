#!/usr/bin/env node
// Genera imgs/[carpeta]/index.json con la lista de fotos para hosting estático.
// Uso: node generar-index.js mutuo-inauguracion
//      node generar-index.js --all   (procesa todas las subcarpetas de imgs/)

const fs   = require('fs');
const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

function listImagesRecursive(absDir, webPrefix) {
  const results = [];
  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const webPath  = prefix + '/' + entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, webPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          results.push({
            src: webPath,
            alt: path.basename(entry.name, ext).replace(/[-_]+/g, ' ').trim(),
          });
        }
      }
    }
  }
  walk(absDir, webPrefix);
  results.sort((a, b) => a.src.localeCompare(b.src, 'es', { numeric: true, sensitivity: 'base' }));
  return results;
}

function processFolder(carpeta) {
  const base    = path.join(__dirname, 'imgs', carpeta);
  const outFile = path.join(base, 'index.json');

  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    console.error(`❌  Carpeta no encontrada: imgs/${carpeta}`);
    return;
  }

  const images = listImagesRecursive(base, `/imgs/${carpeta}`);
  fs.writeFileSync(outFile, JSON.stringify({ images }, null, 2), 'utf8');
  console.log(`✅  imgs/${carpeta}/index.json → ${images.length} fotos`);
}

const args = process.argv.slice(2);

if (args.includes('--all')) {
  const imgsDir = path.join(__dirname, 'imgs');
  const carpetas = fs.readdirSync(imgsDir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
  if (carpetas.length === 0) {
    console.log('No se encontraron subcarpetas en imgs/');
  } else {
    carpetas.forEach(processFolder);
  }
} else if (args.length > 0) {
  args.forEach(processFolder);
} else {
  console.log('Uso: node generar-index.js <carpeta>   →  genera index.json para esa carpeta');
  console.log('     node generar-index.js --all       →  genera index.json para todas las carpetas en imgs/');
}
