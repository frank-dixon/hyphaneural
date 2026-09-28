#!/usr/bin/env node
/**
 * Watch src/js — on save, re-minify into docs/js + static/js.
 */
const chokidar = require('chokidar');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const srcGlob = path.join(root, 'src', 'js', '*.js');

function rebuild() {
  const child = spawn(process.execPath, [path.join(__dirname, 'build-js.js')], {
    stdio: 'inherit',
    cwd: root,
  });
  child.on('exit', (code) => {
    if (code !== 0) console.error('[watch:js] build failed');
  });
}

console.log('[watch:js] watching src/js/*.js');
rebuild();
chokidar.watch(srcGlob, { ignoreInitial: true }).on('all', (evt, p) => {
  console.log('[watch:js]', evt, path.relative(root, p));
  rebuild();
});
