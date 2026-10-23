import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/icon/Icon';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';
import { isIMECompositionEvent } from '@/lib/ime';
import { formatShortcutForDisplay } from '@/lib/shortcuts';
import { appendInlineText } from '@/components/chat/composer/text';
import { ComposerDictation } from '@/components/dictation/ComposerDictation';
import { useCommentImagePaste } from './useCommentImagePaste';
import { useCommentSnippetPicker } from './useCommentSnippetPicker';

export interface InlineCommentInputProps {
  initialText?: string;
  onTextChange?: (text: string) => void;
  onSave: (text: string, range?: { start: number; end: number; side?: 'additions' | 'deletions' }) => void;
  onCancel: () => void;
  fileLabel?: string;
  lineRange?: { start: number; end: number; side?: 'additions' | 'deletions' };
  isEditing?: boolean;
  className?: string;
  maxWidth?: number;
  startDictationOnMount?: boolean;
  onDictationStarted?: () => void;
  /** Fill of the selected lines the comment belongs to, when the host knows it. */
  bandColor?: string;
  /**
   * A floating pill like the chat's comment field, with no band: for rendered
   * previews, where there are no selected lines for a band to continue.
   */
  floating?: boolean;
}

const MAX_FIELD_HEIGHT_PX = 120;

/**
 * The comment editor shown under selected diff, editor and preview lines. It
 * sits in a band tinted like the selected lines it comments on (the editor's
 * selected-line fill, or `bandColor` from a diff), with the field and a round
 * attach button inside. Over a rendered preview it floats as a glass pill
 * instead (`floating`), like the chat's comment field.
 *
 * The field is a plain textarea because it lives inside other editors' DOM: an
 * annotation slot of the diff viewer's shadow tree and a block widget of the
 * file editor. The composer's CodeMirror editor there lost its caret and
 * jumped to the start of the line while typing; a textarea owns its caret and
 * selection and is not affected by the host editor's DOM. Dictation reuses the
 * composer overlay, but its confirm action saves this comment rather than
 * submitting a chat message.
 */
export function InlineCommentInput({
  initialText = '',
  onTextChange,
  onSave,
  onCancel,
  fileLabel,
  lineRange,
  isEditing = false,
  className,
  maxWidth,
  startDictationOnMount = false,
  onDictationStarted,
  bandColor,
  floating = false,
}: InlineCommentInputProps) {
  const { t } = useI18n();
  const { isMobile } = useDeviceInfo();
  const [text, setText] = React.useState(initialText);
  const [dictationActive, setDictationActive] = React.useState(false);
  const commentInputRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveShortcut = formatShortcutForDisplay('enter');
  void isEditing;

  const resizeTextarea = () => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_FIELD_HEIGHT_PX)}px`;
  };

  const handleTextChange = (value: string) => {
    setText(value);
    onTextChange?.(value);
  };

  React.useLayoutEffect(resizeTextarea, [text]);

  // Stable range snapshot to prevent race with selection clearing
  const stableRangeRef = useRef(lineRange);
  useEffect(() => {
    if (lineRange) {
      stableRangeRef.current = lineRange;
    }
  }, [lineRange]);

  const normalizeRange = (range?: { start: number; end: number; side?: 'additions' | 'deletions' }) => {
    if (!range) return undefined;
    const start = Math.min(range.start, range.end);
    const end = Math.max(range.start, range.end);
    return { ...range, start, end };
  };

  const displayRange = normalizeRange(lineRange);
  const ariaLabel = [
    fileLabel,
    displayRange ? t('inlineComment.range.lines', { start: displayRange.start, end: displayRange.end }) : null,
  ].filter(Boolean).join(' • ') || t('inlineComment.actions.comment');

  // Opens ready to type, caret after any text the comment started with. The
  // field focuses without scrolling; on mobile the band comes into view above
  // the keyboard.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    const end = textarea.value.length;
    textarea.setSelectionRange(end, end);
    if (isMobile) textarea.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }, [isMobile]);

  // A pasted image becomes a citation in the text; the caret lands after it
  // once the new text renders. Snippets chosen from the picker do the same.
  const imagePaste = useCommentImagePaste();
  const pendingCaretRef = useRef<number | null>(null);
  React.useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    if (caret === null) return;
    pendingCaretRef.current = null;
    textareaRef.current?.setSelectionRange(caret, caret);
  }, [text]);

  const replaceRange = (from: number, to: number, insert: string) => {
    const current = textareaRef.current?.value ?? text;
    pendingCaretRef.current = from + insert.length;
    handleTextChange(`${current.slice(0, from)}${insert}${current.slice(to)}`);
    textareaRef.current?.focus();
  };

  // `#` opens the composer's snippet picker; references expand on send.
  const getCaret = React.useCallback(() => textareaRef.current?.selectionStart ?? 0, []);
  const snippetPicker = useCommentSnippetPicker({ text, getCaret, replaceRange });

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const pasted = imagePaste.takePastedImages(event.clipboardData, field.value, {
      start: field.selectionStart,
      end: field.selectionEnd,
    });
    if (!pasted) return;
    event.preventDefault();
    replaceRange(pasted.from, pasted.to, pasted.insertion);
  };

  const save = (value = text) => {
    if (value.trim()) {
      onSave(value, normalizeRange(stableRangeRef.current));
      void imagePaste.attachCitedImages(value);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isIMECompositionEvent(event)) return;
    if (snippetPicker.handleKeyDown(event)) return;
    // Desktop Enter attaches; Shift+Enter and mobile Enter break the line.
    // Cmd/Ctrl+Enter stays available for hardware keyboards on mobile.
    if (event.key === 'Enter' && !event.shiftKey && (!isMobile || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const handleSaveClick = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // Stop propagation to prevent parent selection clearing before save
    e.stopPropagation();
    save();
  };

  return (
    <div
      className={cn(
        'w-full max-w-[min(100%,calc(var(--oc-context-panel-width,100vw)-var(--oc-editor-gutter-width,0px)))] font-sans',
        !floating && 'oc-inline-comment-band px-3 py-2',
        className
      )}
      style={{
        maxWidth: maxWidth ? `${Math.max(200, Math.floor(maxWidth))}px` : undefined,
        backgroundColor: floating ? undefined : bandColor,
      }}
      ref={commentInputRef}
      data-comment-input="true"
      data-comment-dictation-active={dictationActive ? 'true' : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          'relative flex items-end gap-2 py-1 pe-1 text-foreground',
          floating
            ? 'oc-glass-popover oc-glass-floating rounded-3xl ps-4'
            : 'oc-raised oc-field rounded-lg bg-[var(--surface-elevated)] ps-3',
        )}
        data-dictation-host="true"
      >
        {snippetPicker.picker}
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => {
            handleTextChange(event.target.value);
            snippetPicker.sync(event.target.value, event.target.selectionStart);
          }}
          onSelect={(event) => snippetPicker.sync(event.currentTarget.value, event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isMobile
            ? t('inlineComment.input.placeholderShort')
            : t('inlineComment.input.placeholder', { shortcut: saveShortcut })}
          aria-label={ariaLabel}
          spellCheck
          className={cn(
            'min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground',
            isMobile && 'text-base leading-6'
          )}
          style={{ minHeight: 0 }}
        />
        <ComposerDictation
          isMobile={isMobile}
          footerIconButtonClass="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
          footerPaddingClass={isMobile ? 'px-1.5 py-1.5' : 'px-2.5 py-1.5'}
          iconSizeClass="h-4 w-4"
          sendIconSizeClass="h-4 w-4"
          compactOverlay
          sendActionLabel={t('inlineComment.actions.comment')}
          sendActionIcon="attachment-2"
          startOnMount={startDictationOnMount}
          onStart={onDictationStarted}
          onActiveChange={setDictationActive}
          onInsert={(transcript) => handleTextChange(appendInlineText(text, transcript))}
          onInsertAndSend={(transcript) => save(appendInlineText(text, transcript).trim())}
        />
        {!dictationActive ? <button
          type="button"
          onClick={handleSaveClick}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={!text.trim()}
          className={cn(
            'mb-0.5 flex shrink-0 items-center justify-center rounded-full bg-[var(--primary-base)] text-[var(--primary-foreground)] transition-opacity duration-150 hover:opacity-90 disabled:opacity-40',
            isMobile ? 'h-9 w-9' : 'h-8 w-8'
          )}
          aria-label={t('inlineComment.actions.comment')}
          title={t('inlineComment.actions.comment')}
        >
          <Icon name="attachment-2" className="h-4 w-4" />
        </button> : null}
      </div>
    </div>
  );
}
