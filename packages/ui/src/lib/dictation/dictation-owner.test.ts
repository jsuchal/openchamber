import { afterEach, describe, expect, test } from 'bun:test';

import { claimDictation, getDictationOwner, releaseDictation, subscribeDictationOwner } from './dictation-owner';

describe('dictation owner', () => {
    const first = Symbol('first');
    const second = Symbol('second');

    afterEach(() => {
        releaseDictation(first);
        releaseDictation(second);
    });

    test('allows only one composer to hold the dictation lease', () => {
        expect(claimDictation(first)).toBe(true);
        expect(claimDictation(second)).toBe(false);
        expect(getDictationOwner()).toBe(first);
        releaseDictation(first);
        expect(claimDictation(second)).toBe(true);
        expect(getDictationOwner()).toBe(second);
    });

    test('notifies controls when ownership changes and ignores a non-owner release', () => {
        let notifications = 0;
        const unsubscribe = subscribeDictationOwner(() => { notifications += 1; });
        expect(claimDictation(first)).toBe(true);
        releaseDictation(second);
        expect(notifications).toBe(1);
        releaseDictation(first);
        expect(notifications).toBe(2);
        unsubscribe();
    });
});
