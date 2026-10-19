import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  return {
    plugins: [react(), tailwindcss()],
    // v3.10 — `vite build` must always make a production build. Vite reads
    // NODE_ENV from the .env file, and a server .env that says
    // NODE_ENV=development silently produced a development build: React's
    // debugging version (3x larger and much slower in the browser). The
    // website's own code uses no .env values, so the build ignores the file.
    ...(command === 'build' ? { envDir: false as const } : {}),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // v3.13 — jsPDF asks for "html2canvas"; the app already ships the
        // maintained fork html2canvas-pro (same API), so the PDF code no longer
        // carries two copies of it
        html2canvas: 'html2canvas-pro',
      },
    },
    build: {
      // The storefront used to ship as one ~978 kB chunk. Splitting the heavy,
      // rarely-changing libraries out lets the browser cache them across deploys
      // and keeps the first storefront paint off the dashboard's chart code.
      chunkSizeWarningLimit: 700,
      // v3.12 — the server reads .vite/manifest.json to tell the browser, with
      // the page itself, which page file to fetch (e.g. the product page)
      manifest: true,
      // esbuild minification keeps the build fast; console/debugger are dropped
      // so production bundles carry no developer noise.
      minify: 'esbuild',
      cssCodeSplit: true,
      sourcemap: false,
      target: 'es2020',
      rollupOptions: {
        output: {
          /**
           * A function rather than a map: the React JSX runtime is pulled in
           * through the plugin, so a plain ['react'] entry left the vendor chunk
           * empty and React inside the app bundle.
           */
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
            if (id.includes('lucide-react')) return 'icons';
            if (id.includes('canvas-confetti')) return 'confetti';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
              return 'vendor';
            }
            return undefined;
          },
        },
      },
    },
    esbuild: {
      drop: process.env.NODE_ENV === 'production' ? ['debugger'] : [],
      legalComments: 'none',
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
