import { useCallback, useEffect, useRef, useState } from 'react';

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD_TIME = __APP_BUILD_TIME__;

type AppUpdateState = 'idle' | 'checking' | 'available' | 'updating' | 'error';

function versionFromWorker(worker?: ServiceWorker | null) {
  if (!worker) return undefined;
  try {
    return new URL(worker.scriptURL).searchParams.get('v') || undefined;
  } catch {
    return undefined;
  }
}

export function useAppUpdate() {
  const [state, setState] = useState<AppUpdateState>('idle');
  const [availableVersion, setAvailableVersion] = useState<string>();
  const registrationRef = useRef<ServiceWorkerRegistration>();
  const waitingWorkerRef = useRef<ServiceWorker>();
  const reloadOnControllerChangeRef = useRef(false);

  const captureWaitingWorker = useCallback((registration: ServiceWorkerRegistration) => {
    const worker = registration.waiting;
    if (!worker) return false;
    const workerVersion = versionFromWorker(worker);
    if (workerVersion === APP_VERSION) {
      worker.postMessage({ type: 'SKIP_WAITING' });
      return false;
    }
    waitingWorkerRef.current = worker;
    setAvailableVersion(workerVersion);
    setState('available');
    return true;
  }, []);

  const watchRegistration = useCallback((registration: ServiceWorkerRegistration) => {
    registrationRef.current = registration;
    captureWaitingWorker(registration);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorkerRef.current = registration.waiting || worker;
          setAvailableVersion(versionFromWorker(registration.waiting || worker));
          setState('available');
        }
      });
    });
  }, [captureWaitingWorker]);

  const checkForUpdate = useCallback(async () => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return false;
    setState((current) => current === 'available' ? current : 'checking');
    try {
      const versionUrl = new URL('./version.json', window.location.href);
      versionUrl.searchParams.set('checkedAt', String(Date.now()));
      const response = await fetch(versionUrl, { cache: 'no-store' });
      if (response.ok) {
        const manifest = await response.json() as { version?: string };
        if (manifest.version && manifest.version !== APP_VERSION) {
          setAvailableVersion(manifest.version);
          setState('available');
          return true;
        }
      }
      const registration = registrationRef.current || await navigator.serviceWorker.ready;
      if (!registrationRef.current) watchRegistration(registration);
      await registration.update();
      if (captureWaitingWorker(registration)) return true;
      if (!registration.installing) setState('idle');
      return Boolean(registration.installing);
    } catch {
      setState('error');
      return false;
    }
  }, [captureWaitingWorker, watchRegistration]);

  const applyUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current || registrationRef.current?.waiting;
    reloadOnControllerChangeRef.current = true;
    setState('updating');
    if (worker) worker.postMessage({ type: 'SKIP_WAITING' });
    else window.location.reload();
    window.setTimeout(() => window.location.reload(), 4_000);
    return true;
  }, []);

  const refreshApplication = useCallback(async () => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    if (state === 'available' && applyUpdate()) return;
    const foundUpdate = await checkForUpdate();
    if (foundUpdate) {
      window.setTimeout(() => {
        if (!applyUpdate()) window.location.reload();
      }, 800);
      return;
    }
    window.location.reload();
  }, [applyUpdate, checkForUpdate, state]);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let disposed = false;
    const controllerChanged = () => {
      if (reloadOnControllerChangeRef.current) window.location.reload();
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate();
    };

    navigator.serviceWorker.ready.then((registration) => {
      if (!disposed) watchRegistration(registration);
    }).catch(() => setState('error'));
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    document.addEventListener('visibilitychange', checkWhenVisible);
    window.addEventListener('focus', checkWhenVisible);
    const timer = window.setInterval(() => void checkForUpdate(), 15 * 60 * 1_000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      document.removeEventListener('visibilitychange', checkWhenVisible);
      window.removeEventListener('focus', checkWhenVisible);
    };
  }, [checkForUpdate, watchRegistration]);

  return {
    state,
    updateAvailable: state === 'available',
    availableVersion,
    checkForUpdate,
    applyUpdate,
    refreshApplication,
  };
}
