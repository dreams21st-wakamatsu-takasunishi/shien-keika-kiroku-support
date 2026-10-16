/** Coalesce notifications during a read. A scope change invalidates old work
 * without waiting for its network response; it must never publish to a new user.
 */
export function createWorkspaceRefreshQueue() {
  let scope = '', generation = 0;
  let pending: { full: boolean; tables: Set<string> } | undefined;
  let running: Promise<void> | undefined;
  return {
    reset(nextScope: string) {
      if (scope === nextScope) return;
      scope = nextScope; generation++; pending = undefined; running = undefined;
    },
    request(tables: readonly string[] | undefined, work: (tables: string[] | undefined, current: () => boolean) => Promise<void>) {
      if (!pending) pending = { full: !tables, tables: new Set(tables) };
      else { pending.full ||= !tables; tables?.forEach(table => pending!.tables.add(table)); }
      if (running) return running;
      const turn = generation;
      const current = () => generation === turn;
      running = (async () => {
        while (current() && pending) {
          const batch = pending; pending = undefined;
          await work(batch.full ? undefined : [...batch.tables], current);
        }
      })().finally(() => { if (current()) running = undefined; });
      return running;
    },
  };
}
