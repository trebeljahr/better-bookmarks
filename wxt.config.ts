import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  // Use a visible folder so Chrome's "Load unpacked" picker shows it on
  // macOS (Finder hides dot-prefixed directories by default).
  outDir: "dist",
  // Do not let web-ext spawn a throwaway "guest" Chrome on `pnpm dev`.
  // Instead, load `dist/chrome-mv3` once via chrome://extensions →
  // Load unpacked in your real day-to-day Chrome. WXT's auto-reload
  // client still talks to the dev server over WebSocket regardless of
  // how the extension was loaded, so HMR keeps working.
  webExt: {
    disabled: true,
  },
  // Pin the dev server to a fixed high-3000s port so it never collides
  // with other projects running on 3000/3001/etc. `strictPort` makes
  // WXT fail loudly if 3147 is taken rather than silently sliding to a
  // different port (which would break the reload client baked into the
  // built extension).
  dev: {
    server: {
      port: 3147,
      strictPort: true,
      origin: "http://localhost:3147",
    },
  },
  modules: ["@wxt-dev/module-react", "./modules/copy-onnx-wasm.ts"],
  vite: () => ({
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ["@huggingface/transformers"] },
  }),
  manifest: {
    name: "Better Bookmarks",
    description:
      "Better Bookmarks is a Chrome extension that allows you to save your bookmarks in a more organized way.",
    version: "1.0",
    permissions: [
      "storage",
      "tabs",
      "bookmarks",
      "downloads",
      "alarms",
      "activeTab",
      "sidePanel",
      "contextMenus",
      "offscreen",
      "unlimitedStorage",
    ],
    host_permissions: ["<all_urls>", "https://huggingface.co/*"],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
    web_accessible_resources: [
      {
        resources: ["transformers/*.wasm", "transformers/*.mjs", "transformers/*.js"],
        matches: ["<all_urls>"],
      },
    ],
    side_panel: {
      default_path: "sidepanel.html",
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+Shift+X",
          mac: "MacCtrl+Shift+X",
        },
        description: "Open Better Bookmarks overview",
      },
      open_sidepanel: {
        suggested_key: {
          default: "Ctrl+Shift+B",
          mac: "MacCtrl+Shift+B",
        },
        description: "Open the Better Bookmarks side panel",
      },
    },
    action: {
      default_icon: {
        16: "/empty16.png",
        32: "/empty32.png",
        48: "/empty48.png",
        128: "/empty128.png",
      },
    },
    omnibox: { keyword: "bb" },
  },
});
