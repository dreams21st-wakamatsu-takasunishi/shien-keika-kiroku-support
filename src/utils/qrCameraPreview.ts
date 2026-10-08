// Presentation only: never transform the video stream or the decoded QR data.
export const QR_PREVIEW_MIRROR_KEY = 'd-support:qr-preview-mirror:v1';

export function qrPreviewMirrored(facingMode?: string, override?: boolean) {
  return override ?? facingMode === 'user';
}

export function readQrPreviewMirrorPreference(storage?: Pick<Storage, 'getItem'>): boolean | undefined {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    const value = target?.getItem(QR_PREVIEW_MIRROR_KEY);
    return value === 'true' ? true : value === 'false' ? false : undefined;
  } catch { return undefined; }
}

export function saveQrPreviewMirrorPreference(value: boolean, storage?: Pick<Storage, 'setItem'>) {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    target?.setItem(QR_PREVIEW_MIRROR_KEY, String(value));
  } catch { /* Storage restrictions must not prevent scanning or changing the preview. */ }
}
