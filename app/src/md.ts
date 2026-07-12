// Rendering markdown sicuro, condiviso da chat e lettore .md.
// L'HTML raw dentro il markdown (risposte del modello, output dei tool, file .md aperti) è dato
// NON fidato: marked >= 8 non sanifica più nulla, quindi senza DOMPurify un `<img onerror=...>`
// eseguirebbe JS nel contesto della UI e potrebbe leggere il token dell'engine.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

// I link esterni non devono dare accesso a window.opener alla pagina di destinazione.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Markdown → HTML sanificato, pronto per dangerouslySetInnerHTML.
 *  Il profilo html di DOMPurify toglie script/handler inline; gli schemi pericolosi
 *  (javascript:, data:) sono già bloccati dalla URI policy di default.
 *  I form sono ammessi dal profilo html ma qui non servono mai: senza bloccarli una risposta
 *  potrebbe renderizzare un modulo di phishing che invia quel che scrivi a un host esterno. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'option'],
    FORBID_ATTR: ['formaction', 'action'],
  });
}
