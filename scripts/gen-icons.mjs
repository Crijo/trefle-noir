// Génère les icônes PNG de la PWA à partir de public/favicon.svg (npm run icons).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
// Version « maskable » : fond plein jusqu'aux bords, motif réduit dans la zone sûre.
const maskable = svg
  .replace('rx="96"', 'rx="0"')
  .replace(/<circle cx="256" cy="256" r="196"/, '<g transform="translate(256 256) scale(.78) translate(-256 -256)"><circle cx="256" cy="256" r="196"')
  .replace('</svg>', '</g></svg>');

const out = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', maskable, 180],
];
for (const [name, src, size] of out) {
  const png = new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png);
  console.log(`public/icons/${name} (${size}px)`);
}
