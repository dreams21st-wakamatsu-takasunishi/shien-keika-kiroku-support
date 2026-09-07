export type AppUpdateState = 'idle' | 'checking' | 'available' | 'updating' | 'error';
export interface AppUpdateSnapshot { state: AppUpdateState; availableVersion?: string }

interface AppUpdateOptions {
  version: string;
  serviceWorker: Pick<ServiceWorkerContainer, 'getRegistration' | 'addEventListener' | 'removeEventListener'>;
  fetchVersion: () => Promise<string | undefined>;
  onChange: (snapshot: AppUpdateSnapshot) => void;
  reload: () => void;
  schedule: (callback: () => void, delay: number) => number;
  cancelSchedule: (timer: number) => void;
}

function workerVersion(worker?: ServiceWorker | null) {
  try {
    return worker ? new URL(worker.scriptURL).searchParams.get('v') || undefined : undefined;
  } catch {
    return undefined;
  }
}

/** One lifetime per mounted header. Background checks never reload the page. */
export class AppUpdateController {
  private snapshot: AppUpdateSnapshot = { state: 'idle' };
  private disposed = false;
  private registration?: ServiceWorkerRegistration;
  private worker?: ServiceWorker;
  private checkPromise?: Promise<boolean>;
  private stopWatching?: () => void;
  private reloadTimer?: number;
  private reloadRequested = false;

  constructor(private options: AppUpdateOptions) {
    options.serviceWorker.addEventListener('controllerchange', this.controllerChanged);
  }

  private publish(snapshot: AppUpdateSnapshot) {
    if (this.disposed || this.snapshot.state === 'updating') return;
    this.snapshot = snapshot;
    this.options.onChange(snapshot);
  }

  private captureWaitingWorker = () => {
    const worker = this.registration?.waiting;
    if (!worker) return false;
    const version = workerVersion(worker);
    if (version === this.options.version) return false;
    this.worker = worker;
    this.publish({ state: 'available', availableVersion: version || this.snapshot.availableVersion });
    return true;
  };

  private watch(registration: ServiceWorkerRegistration) {
    if (this.disposed || this.registration === registration) return;
    this.stopWatching?.();
    this.registration = registration;
    let installing: ServiceWorker | null = null;
    const stateChanged = () => {
      if (installing?.state === 'installed') this.captureWaitingWorker();
    };
    const updateFound = () => {
      installing?.removeEventListener('statechange', stateChanged);
      installing = registration.installing;
      installing?.addEventListener('statechange', stateChanged);
      stateChanged();
    };
    registration.addEventListener('updatefound', updateFound);
    updateFound();
    this.captureWaitingWorker();
    this.stopWatching = () => {
      registration.removeEventListener('updatefound', updateFound);
      installing?.removeEventListener('statechange', stateChanged);
    };
  }

  async start() {
    try {
      const registration = await this.options.serviceWorker.getRegistration();
      if (registration) this.watch(registration);
    } catch {
      this.publish({ state: 'error' });
    }
  }

  check = (): Promise<boolean> => {
    if (this.disposed || this.snapshot.state === 'updating') return Promise.resolve(false);
    if (this.checkPromise) return this.checkPromise;
    this.checkPromise = this.performCheck().finally(() => { this.checkPromise = undefined; });
    return this.checkPromise;
  };

  private async performCheck() {
    if (this.snapshot.state !== 'available') this.publish({ state: 'checking' });
    try {
      const version = await this.options.fetchVersion();
      if (this.disposed) return false;
      if (version && version !== this.options.version) {
        this.publish({ state: 'available', availableVersion: version });
      }
      const registration = this.registration || await this.options.serviceWorker.getRegistration();
      if (this.disposed) return false;
      if (registration) {
        this.watch(registration);
        await registration.update();
        if (this.disposed) return false;
        this.captureWaitingWorker();
      }
      if (this.snapshot.state === 'available') return true;
      this.publish({ state: 'idle' });
      return false;
    } catch {
      // A temporary outage does not erase a previously discovered update.
      if (this.snapshot.state === 'available') return true;
      this.publish({ state: 'error' });
      return false;
    }
  }

  private reloadOnce = () => {
    if (this.disposed || this.reloadRequested) return;
    this.reloadRequested = true;
    if (this.reloadTimer !== undefined) this.options.cancelSchedule(this.reloadTimer);
    this.reloadTimer = undefined;
    this.options.reload();
    // If beforeunload was cancelled, keep the existing page usable. Any further
    // refresh must come from a new explicit action, never from the old timer.
    this.snapshot = { state: 'idle' };
    if (!this.disposed) this.options.onChange(this.snapshot);
  };

  private controllerChanged = () => {
    if (this.snapshot.state === 'updating') this.reloadOnce();
  };

  /** Call only after an explicit user update/refresh action. */
  apply = () => {
    if (this.disposed || this.snapshot.state === 'updating') return;
    this.reloadRequested = false;
    this.publish({ ...this.snapshot, state: 'updating' });
    const worker = this.worker || this.registration?.waiting;
    if (!worker) {
      this.reloadOnce();
      return;
    }
    // One fallback only. Disposal or controllerchange cancels it, including when
    // beforeunload is cancelled so there is no second surprise reload later.
    this.reloadTimer = this.options.schedule(this.reloadOnce, 4_000);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      this.reloadOnce();
    }
  };

  refresh = async () => {
    if (this.disposed || this.snapshot.state === 'updating') return;
    if (this.snapshot.state !== 'available') await this.check();
    if (!this.disposed) this.apply();
  };

  dispose() {
    this.disposed = true;
    this.stopWatching?.();
    if (this.reloadTimer !== undefined) this.options.cancelSchedule(this.reloadTimer);
    this.options.serviceWorker.removeEventListener('controllerchange', this.controllerChanged);
  }
}
