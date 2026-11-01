import { NODE_TYPES, type NodeKind } from '@devascent/domain';

const KIND_BY_KEY = new Map<string, NodeKind>(
  Object.values(NODE_TYPES).flatMap((t) => (t.shortcut ? [[t.shortcut, t.kind] as const] : [])),
);

export function shortcutToKind(key: string): NodeKind | undefined {
  return KIND_BY_KEY.get(key.toLowerCase());
}

/** Shortcuts never fire while the user is typing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
