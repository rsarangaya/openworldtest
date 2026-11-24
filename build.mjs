// Bundles src/main.js (+ everything it imports) into one self-contained index.html.
//   npm run build   minified        npm run dev   unminified, easier to debug
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const readable = process.argv.includes('--readable');
const out = buildSync({ entryPoints: [path.join(here, 'src', 'main.js')], bundle: true, format: 'iife', write: false, minify: !readable, target: 'es2022', legalComments: 'none' });
let code = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
if (!readable) code = code.replace(/\/\*wgsl\*\/`([^`]*)`/g, (_, w) => '`' + w.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim() + '`');
const tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
const html = tpl.replace('/*SCRIPT*/', () => `try{${code}}catch(e){document.getElementById('err').textContent='Failed to start: '+e.message;document.getElementById('err').className='layer center on'}`);
writeFileSync(path.join(here, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} kB${readable ? ' (readable)' : ''}, ${(gzipSync(Buffer.from(html), { level: 9 }).length / 1024).toFixed(1)} kB gzipped`);
