import { fileURLToPath } from "node:url";

import wails from "@wailsio/runtime/plugins/vite";

export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: {
    enabled: true,
  },

  ssr: false,
  router: {
    options: {
      hashMode: true,
    },
  },

  hooks: {
    "prerender:routes": ({ routes }) => {
      routes.clear();
    },
  },

  // Stop Nitro wiping output.publicDir at the start of `nuxt dev`.
  $production: {
    nitro: {
      output: {
        publicDir: "./dist",
      },
    },
  },

  // Required by Wails.
  devServer: {
    host: "127.0.0.1",
    port: Number(process.env.WAILS_VITE_PORT) || 9245,
  },

  vite: {
    server: {
      strictPort: true,
    },
    // Nuxt sets Vite's root to app/, bindings path must be absolute.
    plugins: [wails(fileURLToPath(new URL("./bindings", import.meta.url)))],
  },

  alias: {
    "#services": fileURLToPath(
      new URL("./bindings/github.com/ekkohnet/okula/internal/services", import.meta.url),
    ),
  },

  modules: ["@nuxt/eslint", "@nuxt/ui"],

  css: ["~/assets/css/main.css"],

  ui: {
    colorMode: true,
    fonts: true,
  },

  fonts: {
    families: [
      {
        name: "Geist",
        provider: "fontsource",
        styles: ["normal", "italic"],
        weights: ["100 900"],
      },
    ],
  },
});
