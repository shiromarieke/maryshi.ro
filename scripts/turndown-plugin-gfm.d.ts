// turndown-plugin-gfm ships without type definitions.
declare module 'turndown-plugin-gfm' {
	import type TurndownService from 'turndown';
	export const gfm: TurndownService.Plugin;
}
