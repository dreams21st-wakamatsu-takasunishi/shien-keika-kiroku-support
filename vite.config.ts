import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const gitVersion = process.env.GITHUB_SHA?.slice(0, 7);
  const githubBuildNumber = process.env.GITHUB_RUN_NUMBER
    ? `${process.env.GITHUB_RUN_NUMBER}.${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : undefined;
  const appVersion = process.env.VITE_APP_VERSION?.trim()
    || (gitVersion && githubBuildNumber ? `${gitVersion}.${githubBuildNumber}` : gitVersion)
    || `${process.env.npm_package_version || '0.0.0'}-local`;
  const buildTime = process.env.VITE_APP_BUILD_TIME?.trim() || new Date().toISOString();

  return {
    // Relative assets work both at the GitHub Pages root and under /<repository>/.
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'emit-app-version',
        generateBundle(_options, bundle) {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ version: appVersion, buildTime }),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'asset-manifest.json',
            source: JSON.stringify({
              version: appVersion,
              assets: Object.keys(bundle)
                .filter((fileName) => fileName.startsWith('assets/'))
                .map((fileName) => `./${fileName}`),
            }),
          });
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_TIME__: JSON.stringify(buildTime),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled when DISABLE_HMR is enabled.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
