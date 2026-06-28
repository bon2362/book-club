# Preserve Markdown Toolbar Selection and Scroll

## Goal

Formatting selected text in the summary Markdown editor must not move the page or the textarea's internal viewport. The formatted fragment remains selected so the author can continue working from the same place.

## Root cause

`MarkdownToolbar` updates the controlled textarea and then calls `textarea.focus()` in a timer. Focusing a large textarea without options lets the browser scroll the page to bring the element into view. The toolbar button also receives pointer focus before its click handler, making selection preservation dependent on browser blur behavior.

## Design

Before changing the Markdown value, the toolbar records:

- `selectionStart` and `selectionEnd`;
- `scrollTop` and `scrollLeft` of the textarea.

Formatting buttons prevent their pointer-down default so they do not take focus from the textarea. After React applies the controlled value update, one shared restoration helper:

1. calls `textarea.focus({ preventScroll: true })`;
2. restores the intended selection range around the formatted inner text;
3. restores the textarea's internal scroll offsets.

The same helper is used after Wikipedia insertion. Keyboard activation remains unchanged because only pointer-down default behavior is suppressed.

The implementation does not force `window.scrollTo`: `preventScroll` avoids the page jump without a visible corrective movement.

## Tests

- Jest reproduces the regression by asserting that formatting restores focus with `preventScroll`, preserves the selected fragment, and returns the textarea to its previous internal scroll offsets.
- Jest asserts that pointer-down on a formatting button is cancelled, preserving the active textarea selection.
- Playwright covers the real browser behavior in the existing summary-editor UI suite: select text in a long document, format it, then assert the page position, textarea scroll position, focus, and selected text remain stable.

## Scope

No API, database, routing, or user-workflow changes. Technical feature and owner Wiki documentation do not need updates; the automated regression tests document the corrected behavior.
