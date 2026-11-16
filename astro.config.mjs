// @ts-check
import { defineConfig } from 'astro/config';
import relativeLinks from './integrations/relative-links.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://maryshi.ro',
	// Keep the WordPress URL style: /<slug>/
	trailingSlash: 'always',
	// Make all URLs in the build relative, so it works under any path
	// (e.g. https://shiromarieke.github.io/maryshi.ro/ for testing).
	integrations: [relativeLinks()],
});
