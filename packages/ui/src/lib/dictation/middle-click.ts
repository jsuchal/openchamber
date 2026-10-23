/**
 * Cancel the Linux/X11 middle-button primary-selection paste that follows a
 * middle pointer press. The paste can arrive after the click handler moves
 * focus into a newly opened comment editor.
 */
export const suppressMiddleClickPaste = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();

    // SAFETY: DOM events raised by pointerdown expose a Node target; other targets fall back to the current document.
    const target = event.target as (Node & { ownerDocument?: Document }) | null;
    const ownerDocument = target?.ownerDocument ?? document;
    let timer: number | null = null;
    let cleaned = false;

    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        ownerDocument.removeEventListener('auxclick', onAuxClick, true);
        ownerDocument.removeEventListener('paste', onPaste, true);
        if (timer !== null) ownerDocument.defaultView?.clearTimeout(timer);
    };
    const onAuxClick = (next: Event) => {
        if (!('button' in next) || next.button !== 1) return;
        next.preventDefault();
        next.stopImmediatePropagation();
    };
    const onPaste = (next: Event) => {
        next.preventDefault();
        next.stopImmediatePropagation();
        cleanup();
    };

    ownerDocument.addEventListener('auxclick', onAuxClick, true);
    ownerDocument.addEventListener('paste', onPaste, true);
    timer = ownerDocument.defaultView?.setTimeout(cleanup, 1000) ?? null;
};
