#!/usr/bin/env node
// One-time import of the WordPress site at maryshi.ro into Astro content folders.
//
// Reads posts, pages, categories and media from the public WordPress REST API and writes:
//   src/content/posts/<slug>/index.md   (+ the post's images next to it)
//   src/content/pages/<slug>/index.md   (+ the page's images next to it)
//   src/data/categories.json
//   public/wp-content/uploads/...       (non-image uploads such as PDFs, at their old URLs)
//
// Existing index.md files are left alone unless --force is given, so edits made after
// the import are not overwritten by accident.
//
// Usage: node scripts/import-wordpress.mjs [--force]

import fs from 'node:fs/promises';
import path from 'node:path';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import YAML from 'yaml';
import * as he from 'he';

const SITE = 'https://maryshi.ro';
const API = `${SITE}/wp-json/wp/v2`;
const ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src/content');
const DATA_DIR = path.join(ROOT, 'src/data');
const PUBLIC_DIR = path.join(ROOT, 'public');

const UPLOAD_RE = /^(?:https?:)?\/\/(?:www\.)?maryshi\.ro\/wp-content\/uploads\/([^?#]+)/i;
const INTERNAL_RE = /^(?:https?:)?\/\/(?:www\.)?maryshi\.ro(\/[^#?]*)?([?#].*)?$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
const SIZE_SUFFIX_RE = /-\d+x\d+(\.\w+)$/;

const force = process.argv.includes('--force');
const warnings = [];
const warn = (where, message) => warnings.push(`${where}: ${message}`);

// ---------------------------------------------------------------- fetching

async function fetchAll(type) {
	const items = [];
	for (let page = 1; ; page++) {
		const url = `${API}/${type}?per_page=100&page=${page}`;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
		items.push(...(await res.json()));
		const totalPages = Number(res.headers.get('x-wp-totalpages') ?? 1);
		if (page >= totalPages) return items;
	}
}

async function downloadFirst(urls, dest) {
	try {
		await fs.access(dest);
		return true; // already downloaded in an earlier run
	} catch {}
	for (const url of urls) {
		const res = await fetch(url);
		if (!res.ok) continue;
		await fs.mkdir(path.dirname(dest), { recursive: true });
		await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
		return true;
	}
	return false;
}

// ---------------------------------------------------------------- uploads

/** "https://maryshi.ro/wp-content/uploads/2022/02/a%20b.png" -> "2022/02/a b.png" */
function uploadPath(url) {
	const match = UPLOAD_RE.exec(url ?? '');
	return match ? decodeURIComponent(match[1]) : null;
}

const uploadUrl = (rel) => `${SITE}/wp-content/uploads/${encodeURI(rel)}`;

/** Maps every resized variant ("x-1024x728.png") to its original upload ("x.png"). */
function buildOriginalMap(media) {
	const map = new Map();
	for (const item of media) {
		const original = uploadPath(item.source_url);
		if (!original) continue;
		map.set(original, original);
		for (const size of Object.values(item.media_details?.sizes ?? {})) {
			const variant = uploadPath(size.source_url);
			if (variant) map.set(variant, original);
		}
	}
	return map;
}

// ---------------------------------------------------------------- html -> markdown

const plainText = (html) => he.decode((html ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

function createConverter(ctx) {
	const td = new TurndownService({
		headingStyle: 'atx',
		codeBlockStyle: 'fenced',
		bulletListMarker: '-',
		emDelimiter: '_',
	});
	td.use(gfm);
	td.remove(['script', 'style']);
	td.keep(['iframe', 'video', 'audio']);

	// Rules added later take precedence over earlier ones and over the defaults.
	td.addRule('link', {
		filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
		replacement: (content, node) => {
			const href = ctx.rewriteHref(node.getAttribute('href'));
			const title = node.getAttribute('title');
			return `[${content}](${href}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`;
		},
	});
	td.addRule('linkedImage', {
		// <a href="full.png"><img src="full-300x200.png"></a> -> just the (full-size) image
		filter: (node) =>
			node.nodeName === 'A' &&
			IMAGE_EXT_RE.test(uploadPath(node.getAttribute('href')) ?? '') &&
			node.children.length === 1 &&
			node.children[0].nodeName === 'IMG' &&
			node.textContent.trim() === '',
		replacement: (content) => content,
	});
	td.addRule('image', {
		filter: 'img',
		replacement: (_content, node) => {
			const src = node.getAttribute('src') ?? '';
			const alt = (node.getAttribute('alt') ?? '').replace(/[[\]]/g, '');
			return `![${alt}](${ctx.localImage(src) ?? src})`;
		},
	});
	td.addRule('figcaption', {
		filter: 'figcaption',
		replacement: (content) => `\n\n_${content.trim()}_\n\n`,
	});
	return td;
}

// ---------------------------------------------------------------- entries

async function importEntry(kind, item, { originalOf, categorySlugs, mediaById }) {
	const slug = item.slug;
	const where = `${kind}/${slug}`;
	const dir = path.join(CONTENT_DIR, kind, slug);
	const file = path.join(dir, 'index.md');

	if (!force) {
		try {
			await fs.access(file);
			console.log(`skip   ${where} (exists, use --force to overwrite)`);
			return;
		} catch {}
	}

	if (item.link !== `${SITE}/${slug}/`) warn(where, `WordPress URL is ${item.link}, not /${slug}/`);

	const images = new Map(); // original upload path -> { name, candidates }
	const files = new Set(); // upload paths copied to public/

	const ctx = {
		localImage(url) {
			const rel = uploadPath(url);
			if (!rel) {
				if (url && !url.startsWith('data:')) warn(where, `external image kept as-is: ${url}`);
				return null;
			}
			const original = originalOf.get(rel) ?? rel.replace(SIZE_SUFFIX_RE, '$1');
			if (!images.has(original)) {
				let name = path.basename(original).replace(/[^\w.-]+/g, '-');
				const taken = new Set([...images.values()].map((i) => i.name));
				for (let n = 2; taken.has(name); n++) name = name.replace(/(-\d+)?(\.\w+)$/, `-${n}$2`);
				images.set(original, { name, candidates: [...new Set([original, rel])].map(uploadUrl) });
			}
			return `./${images.get(original).name}`;
		},
		rewriteHref(href) {
			const rel = uploadPath(href);
			if (rel) {
				files.add(rel);
				return `/wp-content/uploads/${encodeURI(rel)}`;
			}
			const internal = INTERNAL_RE.exec(href);
			if (internal) {
				let p = internal[1] || '/';
				if (!p.endsWith('/') && !path.extname(p)) p += '/'; // /contact -> /contact/
				return p + (internal[2] ?? '');
			}
			return href;
		},
	};

	const html = item.content.rendered;
	if (/<iframe/i.test(html)) warn(where, 'contains an iframe embed (kept as raw HTML)');
	if (/wp-block-gallery|class="gallery/i.test(html)) warn(where, 'contains a gallery, check the layout');
	let markdown = createConverter(ctx).turndown(html).trim();

	const frontmatter = { slug, title: plainText(item.title.rendered) };
	if (kind === 'posts') {
		frontmatter.date = `${item.date_gmt}Z`;
		frontmatter.categories = item.categories.map((id) => categorySlugs.get(id)).filter(Boolean);
		const description = plainText(item.excerpt?.rendered).replace(/\s*(\[…\]|…|Continue reading.*)$/, '');
		if (description) frontmatter.description = description;
		const cover = mediaById.get(item.featured_media);
		if (cover) {
			frontmatter.cover = ctx.localImage(cover.source_url);
			const alt = plainText(cover.alt_text);
			if (alt) frontmatter.coverAlt = alt;
		}
	}
	if (item.modified_gmt && item.modified_gmt !== item.date_gmt) frontmatter.updated = `${item.modified_gmt}Z`;
	frontmatter.wordpressId = item.id;

	// A missing local image breaks the Astro build, so failed downloads keep the remote URL.
	await fs.mkdir(dir, { recursive: true });
	for (const [original, { name, candidates }] of images) {
		if (await downloadFirst(candidates, path.join(dir, name))) continue;
		warn(where, `image download failed, kept remote URL: ${uploadUrl(original)}`);
		markdown = markdown.replaceAll(`](./${name})`, `](${uploadUrl(original)})`);
		if (frontmatter.cover === `./${name}`) {
			delete frontmatter.cover;
			delete frontmatter.coverAlt;
		}
	}
	await fs.writeFile(file, `---\n${YAML.stringify(frontmatter)}---\n\n${markdown}\n`);

	for (const rel of files) {
		const ok = await downloadFirst([uploadUrl(rel)], path.join(PUBLIC_DIR, 'wp-content/uploads', rel));
		if (!ok) warn(where, `file download failed: ${rel}`);
	}

	console.log(`write  ${where} (${images.size} images, ${files.size} files)`);
}

// ---------------------------------------------------------------- main

console.log(`Fetching from ${API} ...`);
const [posts, pages, categories, media] = await Promise.all(
	['posts', 'pages', 'categories', 'media'].map(fetchAll),
);
console.log(`${posts.length} posts, ${pages.length} pages, ${categories.length} categories, ${media.length} media\n`);

const context = {
	originalOf: buildOriginalMap(media),
	categorySlugs: new Map(categories.map((c) => [c.id, c.slug])),
	mediaById: new Map(media.map((m) => [m.id, m])),
};

const postSlugs = new Set(posts.map((p) => p.slug));
for (const page of pages) {
	if (postSlugs.has(page.slug)) warn(`pages/${page.slug}`, 'slug also used by a post');
}

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.writeFile(
	path.join(DATA_DIR, 'categories.json'),
	JSON.stringify(
		categories.map((c) => ({ slug: c.slug, name: plainText(c.name), description: plainText(c.description) })),
		null,
		'\t',
	) + '\n',
);

for (const post of posts) await importEntry('posts', post, context);
for (const page of pages) await importEntry('pages', page, context);

console.log(`\n${warnings.length} warnings`);
for (const w of warnings) console.log(`- ${w}`);
