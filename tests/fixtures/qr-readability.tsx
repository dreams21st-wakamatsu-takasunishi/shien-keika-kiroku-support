import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import { BrowserQRCodeReader } from '@zxing/browser';
import { StaffQrReadability } from '../../src/components/StaffQrReadability';
import { STAFF_QR_IMAGE_OPTIONS } from '../../src/utils/staffQrImage';
import { attendanceQrPayload } from '../../src/utils/attendanceQr';
import '../../src/index.css';

// Synthetic display only, no camera, Auth, QR RPC or real staff data.
const fakeImage = await QRCode.toDataURL(attendanceQrPayload('0123456789abcdef'.repeat(4)), STAFF_QR_IMAGE_OPTIONS);
function Preview() {
  const [state, setState] = useState({ seconds: 120, loading: false, receipt: '', error: '', statusError: '', imageUrl: fakeImage });
  const [renewals, setRenewals] = useState(0);
  (window as any).__qrReadabilityTest = {
    set: (changes: Partial<typeof state>) => setState(old => ({ ...old, ...changes })), renewals,
    decode: (black = 0, white = 255) => {
      const image = document.querySelector<HTMLImageElement>('img')!;
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 360;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0, 360, 360);
      const pixels = ctx.getImageData(0, 0, 360, 360);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const value = Math.round(black + (white - black) * pixels.data[i] / 255);
        pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = value;
      }
      ctx.putImageData(pixels, 0, 0);
      try { return new BrowserQRCodeReader().decodeFromCanvas(canvas).getText() === attendanceQrPayload('0123456789abcdef'.repeat(4)); }
      catch { return false; }
    },
  };
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-950"><p className="mb-3 text-sm">架空職員の表示確認です。本番のQRではありません。カメラ・打刻・ログインは行いません。</p><section className="mx-auto max-w-xl rounded-3xl bg-white p-4 text-center"><h1 className="text-lg font-black">本人用QRコード・架空職員</h1>
    <StaffQrReadability {...state} displayName="架空職員" onRenew={() => { setRenewals(old => old + 1); setState({ seconds: 120, loading: false, receipt: '', error: '', statusError: '', imageUrl: fakeImage }); }} />
  </section></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>);
