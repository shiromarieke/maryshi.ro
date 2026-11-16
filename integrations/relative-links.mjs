// Astro integration: after the build, rewrite root-relative URLs ("/about/", "/_astro/x.webp")
// in all HTML and CSS files into URLs relative to the file ("../about/", "../_astro/x.webp").
//
// This lets the same build run at the domain root (https://maryshi.ro/) and in a
// subfolder (https://shiromarieke.github.io/maryshi.ro/) without configuring `base`.
// The dev server is not affected; it keeps serving root-relative URLs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Matches a root-relative URL: starts with "/" but not "//" (protocol-relative).
const ROOT_URL = /^\/(?!\/)/;

/** "/bar/baz.png" seen from page URL dir "/foo/" -> "../bar/baz.png" */
export function toRelative(url, fromDir) {
	if (!ROOT_URL.test(url)) return url;
	const [, pathname, suffix = ''] = /^([^?#]*)(.*)$/.exec(url);
	let rel = path.posix.relative(fromDir, pathname) || '.';
	if (pathname.endsWith('/') && !rel.endsWith('/')) rel += '/';
	if (!rel.startsWith('.')) rel = `./${rel}`;
	return rel + suffix;
}

function rewriteHtml(html, fromDir) {
	return html
		.replace(/\b(href|src|poster|action)="([^"]*)"/g, (_m, attr, url) => `${attr}="${toRelative(url, fromDir)}"`)
		.replace(/\b(srcset)="([^"]*)"/g, (_m, attr, value) => {
			const parts = value.split(',').map((part) => {
				const [url, ...descriptor] = part.trim().split(/\s+/);
				return [toRelative(url, fromDir), ...descriptor].join(' ');
			});
			return `${attr}="${parts.join(', ')}"`;
		})
		.replace(/url\((['"]?)(\/[^'")]*)\1\)/g, (_m, q, url) => `url(${q}${toRelative(url, fromDir)}${q})`);
}

function rewriteCss(css, fromDir) {
	return css.replace(/url\((['"]?)(\/[^'")]*)\1\)/g, (_m, q, url) => `url(${q}${toRelative(url, fromDir)}${q})`);
}

async function* walk(dir) {
	for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(full);
		else yield full;
	}
}

export default function relativeLinks() {
	return {
		name: 'relative-links',
		hooks: {
			'astro:build:done': async ({ dir, logger }) => {
				const outDir = fileURLToPath(dir);
				let count = 0;
				for await (const file of walk(outDir)) {
					const ext = path.extname(file);
					if (ext !== '.html' && ext !== '.css') continue;
					// URL directory of this file, e.g. dist/foo/index.html -> "/foo/"
					const fromDir = '/' + path.relative(outDir, path.dirname(file)).split(path.sep).join('/');
					const content = await fs.readFile(file, 'utf8');
					const rewritten = ext === '.html' ? rewriteHtml(content, fromDir) : rewriteCss(content, fromDir);
					if (rewritten !== content) {
						await fs.writeFile(file, rewritten);
						count++;
					}
				}
				logger.info(`made URLs relative in ${count} files`);
			},
		},
	};
}
