#!/usr/bin/env node
// Renders public/og-image.png (1200×630), the preview image shown when the site is shared
// on social media, in the site's style: pastel gradient, round profile photo, VT323.
//
// Uses a local Chrome to render HTML, so the result matches the site exactly. Set CHROME to
// the browser binary if it isn't at the default macOS location.
//
// Usage: node scripts/make-og-image.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { site } from '../src/site.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/og-image.png');
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Embed font and photo as data URIs, so Chrome needs no file access.
const font = await fs.readFile(path.join(ROOT, 'node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2'));
const photo = await sharp(path.join(ROOT, 'src/assets/profile.jpg')).resize({ width: 900 }).jpeg({ quality: 85 }).toBuffer();
const dataUri = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

const html = `<!doctype html>
<meta charset="utf-8">
<style>
	@font-face { font-family: 'VT323'; src: url(${dataUri('font/woff2', font)}) format('woff2'); }
	* { box-sizing: border-box; }
	html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
	body {
		display: flex;
		align-items: center;
		gap: 72px;
		padding: 0 96px;
		color: #383e42;
		font-family: 'VT323', monospace;
		-webkit-font-smoothing: none;
		background-color: #fbf3dc;
		background-image:
			radial-gradient(55% 40% at 100% 0%, #edc2e8 0%, rgba(237, 194, 232, 0) 100%),
			radial-gradient(50% 35% at 100% 85%, #cfd8fa 0%, rgba(207, 216, 250, 0) 100%),
			radial-gradient(45% 32% at 0% 66%, #c4f6dd 0%, rgba(196, 246, 221, 0) 100%),
			linear-gradient(180deg, #fdc7b6 0%, #fcdccb 22%, #fbf3d3 44%, #ecf8dc 60%, #d5f6ea 78%, #c3f4f8 100%);
	}
	img {
		flex: 0 0 auto;
		width: 300px;
		height: 300px;
		border: 5px solid #383e42;
		border-radius: 50%;
		object-fit: cover;
		object-position: 48% 28%;
		box-shadow: 0 16px 40px rgba(56, 62, 66, 0.3), 0 5px 12px rgba(56, 62, 66, 0.2);
	}
	h1 { margin: 0; font-size: 112px; font-weight: 400; line-height: 0.9; }
	.aka { margin: 10px 0 0; font-size: 48px; color: #5b6166; }
	.about { margin: 36px 0 0; font-size: 44px; line-height: 1.1; }
	.url {
		display: inline-block;
		margin-top: 40px;
		font-size: 44px;
		text-decoration: underline dotted 3px;
		text-underline-offset: 8px;
	}
</style>
<img src="${dataUri('image/jpeg', photo)}" alt="">
<div>
	<h1>${site.name}</h1>
	<p class="aka">aka shiro</p>
	<p class="about">Privacy, information security<br>&amp; digital rights</p>
	<span class="url">maryshi.ro</span>
</div>
`;

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'og-image-'));
const page = path.join(dir, 'og.html');
const shot = path.join(dir, 'og.png');
await fs.writeFile(page, html);
try {
	execFileSync(CHROME, [
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--force-device-scale-factor=1',
		'--window-size=1200,630',
		'--virtual-time-budget=3000',
		`--screenshot=${shot}`,
		`file://${page}`,
	], { stdio: 'ignore' });
	// Re-encode: smaller file, and fails loudly if Chrome produced no image.
	await sharp(shot).png({ compressionLevel: 9 }).toFile(OUT);
} finally {
	await fs.rm(page, { force: true });
	await fs.rm(shot, { force: true });
	await fs.rmdir(dir);
}

const { width, height } = await sharp(OUT).metadata();
console.log(`wrote public/og-image.png (${width}×${height})`);
