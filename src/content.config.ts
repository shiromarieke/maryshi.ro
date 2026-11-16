import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Each entry is a folder: src/content/<collection>/<slug>/index.md, with its images next to it.
// The `slug` front-matter field becomes the entry id and the URL: /<slug>/

const posts = defineCollection({
	loader: glob({ pattern: '*/index.md', base: './src/content/posts' }),
	schema: ({ image }) =>
		z.object({
			slug: z.string(),
			title: z.string(),
			date: z.coerce.date(),
			updated: z.coerce.date().optional(),
			categories: z.array(z.string()).default([]),
			description: z.string().optional(),
			cover: image().optional(),
			coverAlt: z.string().optional(),
			/** Archive cards crop the cover to fill ("scale to cover"); true shows it whole ("scale to fit"). */
			coverFit: z.boolean().default(false),
			lang: z.string().optional(),
			wordpressId: z.number().optional(),
		}),
});

const pages = defineCollection({
	loader: glob({ pattern: '*/index.md', base: './src/content/pages' }),
	schema: z.object({
		slug: z.string(),
		title: z.string(),
		updated: z.coerce.date().optional(),
		lang: z.string().optional(),
		wordpressId: z.number().optional(),
	}),
});

export const collections = { posts, pages };
