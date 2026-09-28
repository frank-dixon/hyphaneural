#!/usr/bin/env node
/**
 * Minify src/js → docs/js (Pages) and static/js (Django map).
 * Run once for ship, or via watch on save.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src', 'js');
const pagesOut = path.join(root, 'docs', 'js');
const staticOut = path.join(root, 'static', 'js');

const PAGES_ENTRIES = ['app.js', 'canvas.js', 'gene-follow.js', 'panel.js', 'bands.js'];
const STATIC_ENTRIES = ['map.js']; // Django map only

async function buildOne(file, outDir) {
  const entry = path.join(srcDir, file);
  if (!fs.existsSync(entry)) {
    console.warn('skip missing', file);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  await esbuild.build({
    entryPoints: [entry],
    outfile: path.join(outDir, file),
    bundle: false,
    minify: true,
    target: ['es2018'],
    legalComments: 'none',
    logLevel: 'silent',
  });
  const kb = (fs.statSync(path.join(outDir, file)).size / 1024).toFixed(1);
  console.log('minified', file, '→', path.relative(root, outDir) + '/' + file, `(${kb} KB)`);
}

async function buildAll() {
  for (const f of PAGES_ENTRIES) await buildOne(f, pagesOut);
  for (const f of STATIC_ENTRIES) await buildOne(f, staticOut);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
