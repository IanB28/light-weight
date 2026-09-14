import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import './index.css';
import { PreferencesProvider } from './lib/preferences-context.js';
import { I18nProvider } from './lib/i18n.js';
import { FeedbackProvider } from './lib/feedback-context.js';
import { AuthProvider } from './lib/auth-context.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <I18nProvider>
        <AuthProvider>
          <FeedbackProvider>
            <App />
          </FeedbackProvider>
        </AuthProvider>
      </I18nProvider>
    </PreferencesProvider>
  </React.StrictMode>
);

// Registrar Service Worker para soporte PWA y modo Offline
if ('serviceWorker' in navigator && !window.location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
