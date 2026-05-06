#!/usr/bin/env node
// Genera imgs/[carpeta]/index.json y thumbnails WebP para hosting estático.
// Uso: node generar-index.js mutuo-inauguracion
//      node generar-index.js --all

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const THUMB_PREFIX = 'thumb__';
const THUMB_WIDTH = 900;
const THUMB_QUALITY = 72;

function isSourceImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath);
  return IMAGE_EXTENSIONS.has(ext) && !name.startsWith(THUMB_PREFIX);
}

function listImagesRecursive(absDir) {
  const results = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && isSourceImage(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  walk(absDir);
  results.sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'es', { numeric: true, sensitivity: 'base' }));
  return results;
}

function ensureUniqueFileNames(filePaths, carpeta) {
  const seen = new Set();
  for (const filePath of filePaths) {
    const name = path.basename(filePath);
    if (seen.has(name)) {
      throw new Error(`Hay nombres duplicados en imgs/${carpeta}: ${name}`);
    }
    seen.add(name);
  }
}

async function createThumb(sourcePath, targetPath) {
  await sharp(sourcePath)
    .rotate()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY })
    .toFile(targetPath);
}

async function processFolder(carpeta) {
  const base = path.join(__dirname, 'imgs', carpeta);
  const outFile = path.join(base, 'index.json');

  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    console.error(`❌  Carpeta no encontrada: imgs/${carpeta}`);
    return;
  }

  const sourceFiles = listImagesRecursive(base);
  ensureUniqueFileNames(sourceFiles, carpeta);

  const images = [];
  for (const sourcePath of sourceFiles) {
    const fileName = path.basename(sourcePath);
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const thumbName = `${THUMB_PREFIX}${baseName}.webp`;
    const thumbAbsPath = path.join(base, thumbName);

    await createThumb(sourcePath, thumbAbsPath);

    images.push({
      src: `/imgs/${carpeta}/${fileName}`,
      thumb: `/imgs/${carpeta}/${thumbName}`,
      alt: baseName.replace(/[-_]+/g, ' ').trim(),
    });
  }

  fs.writeFileSync(outFile, JSON.stringify({ images }, null, 2), 'utf8');
  console.log(`✅  imgs/${carpeta}/index.json → ${images.length} fotos`);
  console.log(`🖼️   imgs/${carpeta}/thumb__*.webp → ${images.length} miniaturas`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--all')) {
    const imgsDir = path.join(__dirname, 'imgs');
    const carpetas = fs.readdirSync(imgsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    if (carpetas.length === 0) {
      console.log('No se encontraron subcarpetas en imgs/');
      return;
    }

    for (const carpeta of carpetas) {
      await processFolder(carpeta);
    }
    return;
  }

  if (args.length > 0) {
    for (const carpeta of args) {
      await processFolder(carpeta);
    }
    return;
  }

  console.log('Uso: node generar-index.js <carpeta>   →  genera thumbnails + index.json');
  console.log('     node generar-index.js --all       →  procesa todas las carpetas en imgs/');
}

main().catch((error) => {
  console.error('❌  Error al generar thumbnails/index:', error.message);
  process.exitCode = 1;
});
