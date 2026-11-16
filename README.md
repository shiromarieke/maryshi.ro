# maryshi.ro

Static rebuild of https://maryshi.ro with [Astro](https://astro.build), deployed to GitHub Pages.

## Commands

| Command              | Action                                   |
| :------------------- | :--------------------------------------- |
| `npm install`        | Install dependencies                     |
| `npm run dev`        | Dev server at `localhost:4321`           |
| `npm run build`      | Build the site into `./dist/`            |
| `npm run preview`    | Preview the build locally                |
| `npm run import`     | Re-import content from WordPress (skips existing entries, add `-- --force` to overwrite) |

## Content

- Posts: `src/content/posts/<slug>/index.md`, URL `/<slug>/`
- Pages: `src/content/pages/<slug>/index.md`, URL `/<slug>/`
- Put images next to `index.md` and reference them as `![alt](./image.png)`; they are resized and converted at build time.
- Categories: `src/data/categories.json`, listed at `/category/<slug>/`
- Files that must keep their old URL (PDFs etc.): `public/wp-content/uploads/...`

New post front matter:

```yaml
---
slug: my-new-post
title: My new post
date: 2026-11-16
categories: [stickers]
description: Short summary for the list and meta description
cover: ./cover.png
lang: en
---
```

## Relative URLs

The build makes every URL relative (`integrations/relative-links.mjs`), so the same `dist/` works at
https://maryshi.ro/ and at https://shiromarieke.github.io/maryshi.ro/. Write links as `/about/` in
Markdown and components as usual; they are rewritten after the build.
