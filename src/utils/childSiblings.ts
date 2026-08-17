import type { ChildProfile } from '../types';

function uniqueActiveIds(ids: string[], childrenById: Map<string, ChildProfile>, ownId?: string) {
  return Array.from(new Set(ids))
    .filter((id) => id !== ownId && childrenById.has(id))
    .sort();
}

/**
 * Returns a symmetric sibling view even while older, one-sided data is being
 * migrated. Legacy free-text groups are only used when sibling_ids has never
 * been loaded for that child.
 */
export function buildSiblingIdsByChild(children: ChildProfile[]) {
  const childrenById = new Map(children.map((child) => [child.id, child] as const));
  const adjacency = new Map(children.map((child) => [child.id, new Set<string>()] as const));

  children.forEach((child) => {
    if (Array.isArray(child.siblingIds)) {
      uniqueActiveIds(child.siblingIds, childrenById, child.id).forEach((siblingId) => {
        adjacency.get(child.id)?.add(siblingId);
        adjacency.get(siblingId)?.add(child.id);
      });
      return;
    }
    const legacyGroup = child.siblingGroup?.trim();
    if (!legacyGroup) return;
    children
      .filter((candidate) => candidate.id !== child.id && candidate.siblingGroup?.trim() === legacyGroup)
      .forEach((candidate) => {
        adjacency.get(child.id)?.add(candidate.id);
        adjacency.get(candidate.id)?.add(child.id);
      });
  });

  return new Map(Array.from(adjacency, ([childId, siblingIds]) => [
    childId,
    uniqueActiveIds(Array.from(siblingIds), childrenById, childId),
  ]));
}

/** Connected sibling components provide one stable grouping key to dispatch. */
export function buildSiblingGroupByChild(children: ChildProfile[]) {
  const siblingsByChild = buildSiblingIdsByChild(children);
  const result = new Map<string, string>();
  const visited = new Set<string>();

  children.forEach((child) => {
    if (visited.has(child.id)) return;
    const component: string[] = [];
    const pending = [child.id];
    while (pending.length) {
      const current = pending.pop();
      if (!current || visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      (siblingsByChild.get(current) || []).forEach((siblingId) => {
        if (!visited.has(siblingId)) pending.push(siblingId);
      });
    }
    if (component.length < 2) return;
    const groupKey = `siblings:${component.sort().join('|')}`;
    component.forEach((childId) => result.set(childId, groupKey));
  });

  return result;
}

/** Mirrors the database sibling-link operation for immediate local UI updates. */
export function applySiblingSelection(children: ChildProfile[], savedChild: ChildProfile) {
  const activeIds = new Set(children.map((child) => child.id));
  activeIds.add(savedChild.id);
  const groupIds = new Set([
    savedChild.id,
    ...(savedChild.siblingIds || []).filter((id) => activeIds.has(id) && id !== savedChild.id),
  ]);

  const source = children.some((child) => child.id === savedChild.id)
    ? children
    : [...children, savedChild];
  return source.map((child) => {
    const base = child.id === savedChild.id ? savedChild : child;
    if (groupIds.has(child.id)) {
      return {
        ...base,
        siblingIds: Array.from(groupIds).filter((id) => id !== child.id).sort(),
        siblingGroup: undefined,
      };
    }
    return {
      ...base,
      siblingIds: (base.siblingIds || []).filter((id) => !groupIds.has(id)).sort(),
    };
  });
}
