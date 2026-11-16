#!/usr/bin/env node
// Generates the favicons in public/ from one pixel-art "M" on a 16×16 grid.
//
//   public/favicon.svg          16×16 grid, notched gradient tile with 1px anthracite outline
//   public/favicon.ico          the same at 16 and 32 px (PNG-in-ICO)
//   public/apple-touch-icon.png 180×180, full-bleed gradient (iOS rounds the corners itself
//                               and would turn transparent corners black), M at 9× on a 20×20 grid
//
// Usage: node scripts/make-favicons.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const PUBLIC = path.resolve(import.meta.dirname, '../public');

const INK = '#383e42';
const GRADIENT = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#fdc7b6"/>
		<stop offset="0.5" stop-color="#fbf3d3"/>
		<stop offset="1" stop-color="#c3f4f8"/>
	</linearGradient>`;

// The letter, 10×10 pixels with its top-left corner at (x, y).
const letter = (x, y) =>
	`<path fill="${INK}" transform="translate(${x - 3} ${y - 3})" d="M3 3h2v10h-2zM11 3h2v10h-2zM5 4h1v1h-1zM10 4h1v1h-1zM5 5h2v1h-2zM9 5h2v1h-2zM6 6h4v1h-4zM7 7h2v1h-2z"/>`;

const faviconSvg = (size = 16) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 16 16" shape-rendering="crispEdges">
	<defs>${GRADIENT}</defs>
	<path fill="${INK}" d="M1 0h14v1h1v14h-1v1h-14v-1h-1v-14h1z"/>
	<path fill="url(#g)" d="M2 1h12v1h1v12h-1v1h-12v-1h-1v-12h1z"/>
	${letter(3, 3)}
</svg>
`;

const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 20 20" shape-rendering="crispEdges">
	<defs>${GRADIENT}</defs>
	<rect width="20" height="20" fill="url(#g)"/>
	${letter(5, 5)}
</svg>
`;

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

/** ICO container holding PNG images (supported by all current browsers and Windows). */
function ico(images) {
	const header = Buffer.alloc(6 + 16 * images.length);
	header.writeUInt16LE(0, 0); // reserved
	header.writeUInt16LE(1, 2); // type: icon
	header.writeUInt16LE(images.length, 4);
	let offset = header.length;
	images.forEach(({ size, data }, i) => {
		const e = 6 + 16 * i;
		header.writeUInt8(size % 256, e); // width (0 = 256)
		header.writeUInt8(size % 256, e + 1); // height
		header.writeUInt8(0, e + 2); // palette colours
		header.writeUInt8(0, e + 3); // reserved
		header.writeUInt16LE(1, e + 4); // colour planes
		header.writeUInt16LE(32, e + 6); // bits per pixel
		header.writeUInt32LE(data.length, e + 8);
		header.writeUInt32LE(offset, e + 12);
		offset += data.length;
	});
	return Buffer.concat([header, ...images.map((img) => img.data)]);
}

await fs.writeFile(path.join(PUBLIC, 'favicon.svg'), faviconSvg());
const icoImages = await Promise.all([16, 32].map(async (size) => ({ size, data: await png(faviconSvg(size)) })));
await fs.writeFile(path.join(PUBLIC, 'favicon.ico'), ico(icoImages));
await fs.writeFile(path.join(PUBLIC, 'apple-touch-icon.png'), await png(appleSvg));

console.log('wrote public/favicon.svg, public/favicon.ico (16+32), public/apple-touch-icon.png (180)');
