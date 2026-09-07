import { useCallback, useEffect, useRef, useState } from 'react';
import { AppUpdateController, AppUpdateSnapshot } from '../services/appUpdate';

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD_TIME = __APP_BUILD_TIME__;

export function useAppUpdate() {
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot>({ state: 'idle' });
  const controllerRef = useRef<AppUpdateController>();

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const requests = new Set<AbortController>();
    const controller = new AppUpdateController({
      version: APP_VERSION,
      serviceWorker: navigator.serviceWorker,
      onChange: setSnapshot,
      reload: () => window.location.reload(),
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancelSchedule: (timer) => window.clearTimeout(timer),
      fetchVersion: async () => {
        const abort = new AbortController();
        requests.add(abort);
        const timeout = window.setTimeout(() => abort.abort(), 10_000);
        try {
          const versionUrl = new URL('./version.json', window.location.href);
          versionUrl.searchParams.set('checkedAt', String(Date.now()));
          const response = await fetch(versionUrl, { cache: 'no-store', signal: abort.signal });
          if (!response.ok) throw new Error('Version check failed.');
          const manifest = await response.json() as { version?: string };
          return typeof manifest.version === 'string' ? manifest.version : undefined;
        } finally {
          window.clearTimeout(timeout);
          requests.delete(abort);
        }
      },
    });
    controllerRef.current = controller;
    void controller.start();
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void controller.check();
    };
    document.addEventListener('visibilitychange', checkWhenVisible);
    window.addEventListener('focus', checkWhenVisible);
    const timer = window.setInterval(checkWhenVisible, 15 * 60 * 1_000);
    return () => {
      controller.dispose();
      controllerRef.current = undefined;
      requests.forEach((request) => request.abort());
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkWhenVisible);
      window.removeEventListener('focus', checkWhenVisible);
    };
  }, []);

  const checkForUpdate = useCallback(() => controllerRef.current?.check() || Promise.resolve(false), []);
  const applyUpdate = useCallback(() => {
    if (controllerRef.current) controllerRef.current.apply();
    else window.location.reload();
  }, []);
  const refreshApplication = useCallback(async () => {
    if (controllerRef.current) await controllerRef.current.refresh();
    else window.location.reload();
  }, []);

  return {
    ...snapshot,
    updateAvailable: snapshot.state === 'available',
    checkForUpdate,
    applyUpdate,
    refreshApplication,
  };
}
