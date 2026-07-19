/** Copia testo negli appunti in modo affidabile ovunque giri la UI.
 *  Ordine: IPC Electron (deterministico — navigator.clipboard nel renderer può essere negato
 *  dal permission handler e fallire in silenzio) → clipboard API (browser https) →
 *  execCommand (browser http, es. Tailscale IP). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (await window.cockpit.copyText?.(text)) return true;
  } catch {
    /* prova il prossimo canale */
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* prova il prossimo canale */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
