/**
 * Shared guard for global keyboard handlers: true when the event target is a
 * form field, so shortcuts and Space-pan never swallow typing. Extend here
 * (e.g. contentEditable for the text tool) — both keyboard paths use it.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
