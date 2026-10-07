import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Convierte el Markdown de una nota (CommonMark + GFM) en HTML **sanitizado**.
 * Es el único punto por el que el contenido del usuario llega a `{@html}` (ver ADR 0002).
 */
export function renderMarkdown(source: string): string {
	const html = marked.parse(source, { gfm: true, async: false });
	return DOMPurify.sanitize(html, {
		USE_PROFILES: { html: true },
		ADD_ATTR: ['checked', 'disabled', 'type'],
		FORBID_TAGS: ['style', 'form', 'iframe', 'script'],
		FORBID_ATTR: ['style', 'onerror', 'onclick']
	});
}
