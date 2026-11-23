import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The built page allows inline code only and no network destination at all,
// so even a compromised dependency could not send a loaded file anywhere.
// Added at build time only: the development server needs module requests.
const CONTENT_SECURITY_POLICY =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    // Written as text: the tag helper of Vite would escape the quotes.
    transformIndexHtml: (html) =>
      html.replace(
        '<meta name="viewport"',
        `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n    <meta name="viewport"`,
      ),
  }
}

// The build is a single self-contained dist/index.html: every script and
// style is inlined so the page can be hosted as one static file.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile(), contentSecurityPolicy()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // No source maps: nothing but index.html must be needed at runtime.
    sourcemap: false,
    // Everything is inlined, so the preload helper (which would call the
    // network API) is not needed.
    modulePreload: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
