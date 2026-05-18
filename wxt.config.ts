import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
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
    ],
    host_permissions: ["<all_urls>"],
    side_panel: {
      default_path: "sidepanel.html",
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Ctrl+Shift+X",
          mac: "MacCtrl+Shift+X",
        },
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
