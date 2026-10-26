// Session-local, bounded measurements. Never accept operation names from a
// request, exception, URL or form. Nothing here is sent to a server or AI.
export const PERFORMANCE_PHASES = ['auth.profile', 'workspace.initial', 'workspace.refresh',
  'record.snapshot', 'record.write', 'record.draft.flush', 'record.draft.cleanup', 'record.history'] as const;
export type PerformancePhase = typeof PERFORMANCE_PHASES[number];
interface Timing { phase: PerformancePhase; durationMs: number; ok: boolean }
const timings: Timing[] = [];
let generation = 0;
export function addPerformanceTiming(phase: PerformancePhase, durationMs: number, ok: boolean) {
  if (!(PERFORMANCE_PHASES as readonly string[]).includes(phase) || !Number.isFinite(durationMs) || durationMs < 0) return;
  timings.push({ phase, durationMs: Math.min(3_600_000, Math.round(durationMs)), ok: ok === true });
  if (timings.length > 100) timings.splice(0, timings.length - 100);
}
export async function measureOperation<T>(phase: PerformancePhase, operation: () => PromiseLike<T>, options?:{ignoreAbort?:boolean}): Promise<T> {
  const start = performance.now();
  const turn = generation;
  let ok = false;
  let ignoredAbort = false;
  try { const value = await operation(); ok = true; return value; }
  catch(error){ignoredAbort=options?.ignoreAbort===true&&typeof error==='object'&&error!==null&&'name' in error&&error.name==='AbortError';throw error;}
  finally { if (!ignoredAbort&&turn === generation) addPerformanceTiming(phase, performance.now() - start, ok); }
}
export function readPerformanceSummary() {
  return PERFORMANCE_PHASES.flatMap(phase => {
    const samples = timings.filter(item => item.phase === phase);
    if (!samples.length) return [];
    return [{ phase, count: samples.length, failed: samples.filter(item => !item.ok).length,
      lastMs: samples.at(-1)!.durationMs,
      averageMs: Math.round(samples.reduce((sum, item) => sum + item.durationMs, 0) / samples.length),
      maxMs: Math.max(...samples.map(item => item.durationMs)) }];
  });
}
export function clearPerformanceTimings() { timings.length = 0; generation++; }
