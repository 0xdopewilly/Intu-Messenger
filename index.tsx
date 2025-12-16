import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Safely unregister Service Workers to ensure fresh API calls
const cleanupServiceWorkers = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      let unregistered = false;
      
      for (const registration of registrations) {
        console.log('Unregistering Service Worker to clear cache:', registration);
        await registration.unregister();
        unregistered = true;
      }

      // If we unregistered a SW, the page is likely running stale code. 
      // Force a reload to get the fresh bundle from the server.
      if (unregistered && !sessionStorage.getItem('sw_cleaned')) {
        console.log('Service Worker cleared. Reloading page for fresh content...');
        sessionStorage.setItem('sw_cleaned', 'true');
        window.location.reload();
      }
    } catch (error: any) {
      // Suppress "invalid state" errors which happen in restricted environments
      const msg = error?.message || String(error);
      if (!msg.includes('invalid state') && !msg.includes('SecurityError')) {
        console.warn('Service Worker cleanup warning:', error);
      }
    }
  }
};

// Execute cleanup immediately
cleanupServiceWorkers();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);