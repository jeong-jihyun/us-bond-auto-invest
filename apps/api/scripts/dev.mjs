import { spawn } from 'child_process';
import { bundle } from './bundle.mjs';

const out = new URL('../dist/main.js', import.meta.url).pathname;
await bundle(new URL('../src/main.ts', import.meta.url).pathname, out);
spawn(process.execPath, [out], { stdio: 'inherit' });
