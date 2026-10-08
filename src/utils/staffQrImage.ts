// Changes rendering only, never the one-use QR payload or its lifetime.
export const STAFF_QR_IMAGE_OPTIONS = {
  width: 720,
  margin: 4,
  errorCorrectionLevel: 'M' as const,
  color: { dark: '#000000ff', light: '#ffffffff' },
};
