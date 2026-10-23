import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { suppressMiddleClickPaste } from './middle-click';

test('suppresses the auxclick and following primary-selection paste', () => {
    const window = new Window();
    const target = window.document.createElement('textarea');
    window.document.body.append(target);
    const pointerDown = new Event('pointerdown', { cancelable: true });
    Object.defineProperty(pointerDown, 'target', { value: target });
    suppressMiddleClickPaste(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);

    const auxClick = new window.MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    target.dispatchEvent(auxClick);
    expect(auxClick.defaultPrevented).toBe(true);

    const paste = new window.Event('paste', { bubbles: true, cancelable: true });
    target.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);

    window.close();
});
