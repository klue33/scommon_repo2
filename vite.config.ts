import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => ({
  plugins: [
    // babel:{} opts out of @preact/preset-vite's transformHookNames
    // plugin, which CJS-requires zimmerframe >=1.x (ESM-only) and
    // 500s the dev server. Production build doesn't load that path.
    preact({ babel: {} }),
  ],
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  build: {
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "src/embed.tsx"),
      output: {
        // Single, predictably-named files so the Squarespace embed
        // snippet can reference them without a manifest lookup.
        entryFileNames: "wayfinder.js",
        chunkFileNames: "wayfinder-[name].js",
        assetFileNames: (info) =>
          info.name?.endsWith(".css") ? "wayfinder.css" : "[name][extname]",
      },
    },
  },
  server: { host: "127.0.0.1", port: 3100 },
  test: {
    environment: "node",
    globals: false,
  },
}));
