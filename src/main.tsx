import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APP_VERSION } from './hooks/useAppUpdate';
import { InputFieldAppearance } from './components/InputFieldAppearance';
import { installDiagnostics } from './services/diagnostics';

const disposeDiagnostics = installDiagnostics(APP_VERSION);
if (import.meta.hot) import.meta.hot.dispose(disposeDiagnostics);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InputFieldAppearance />
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`, { scope: './' });
  });
}
