/** Share an in-flight read only; a retry after settlement always reads the server. */
export function createSingleFlight() {
  const pending = new Map<string, Promise<unknown>>();
  return function read<T>(key: string, fetch: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const request = Promise.resolve().then(fetch).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
  };
}
