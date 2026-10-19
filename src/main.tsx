import { StrictMode, startTransition } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Self-hosted type (v3.11): Public Sans for everything — website, dashboard
// and POS — with Noto Sans Bengali only as the fallback for Bengali text the
// owner or customers enter.
import '@fontsource-variable/public-sans/wght.css';
import '@fontsource-variable/noto-sans-bengali/wght.css';
// v3.13 — Hindi and Arabic letters for the website languages. Each font is
// split by unicode-range, so a page without such letters downloads none of it.
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import '@fontsource-variable/noto-sans-arabic/wght.css';
import './index.css';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { CartProvider } from './context/CartContext.tsx';
import { LanguageProvider } from './lib/i18n.tsx';
import { installApiAuth } from './lib/api.ts';
import { startReveal } from './lib/reveal.ts';

// Safe proxying for window.fetch in restricted iframe sandboxes
try {
  if (typeof window !== 'undefined' && window.fetch) {
    let _activeFetch = window.fetch.bind(window);
    Object.defineProperty(window, 'fetch', {
      get() {
        return _activeFetch;
      },
      set(fn) {
        _activeFetch = fn;
      },
      configurable: true,
      enumerable: true,
    });
  }
} catch {
  // Silently ignore if environment prohibits property redefinition
}

// Attach the admin session token to every same-origin /api request.
// Done once here so no call site can accidentally skip authentication.
installApiAuth();

// Storefront scroll animations (sections rise in as they are scrolled to)
startReveal();

// v3.12 — the first render runs as a transition: React works in small slices
// and lets the browser breathe in between, so the page answers taps sooner
// (lower Total Blocking Time) on slower phones.
const root = createRoot(document.getElementById('root')!);
startTransition(() => {
  root.render(
    <StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <LanguageProvider>
              <App />
            </LanguageProvider>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </StrictMode>
  );
});

