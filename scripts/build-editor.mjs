import * as esbuild from 'esbuild';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'public/js/editor.bundle.mjs');

mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
    entryPoints: [join(root, 'public/js/editor.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    outfile,
    sourcemap: true,
    logLevel: 'info',
});

console.log('Wrote', outfile);
