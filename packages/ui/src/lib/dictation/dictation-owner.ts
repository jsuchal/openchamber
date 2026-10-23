/** One microphone capture at a time across all composer dictation controls. */

type Listener = () => void;

export const COMMENT_DICTATION_SUBMIT_EVENT = 'openchamber:comment-dictation-submit';
export const COMMENT_DICTATION_START_EVENT = 'openchamber:comment-dictation-start';

let owner: symbol | null = null;
const listeners = new Set<Listener>();

const notify = () => {
    for (const listener of listeners) listener();
};

export const getDictationOwner = (): symbol | null => owner;

export const subscribeDictationOwner = (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/** Claim synchronously so two controls responding to the same event cannot both start. */
export const claimDictation = (candidate: symbol): boolean => {
    if (owner && owner !== candidate) return false;
    if (owner !== candidate) {
        owner = candidate;
        notify();
    }
    return true;
};

export const releaseDictation = (candidate: symbol): void => {
    if (owner !== candidate) return;
    owner = null;
    notify();
};
