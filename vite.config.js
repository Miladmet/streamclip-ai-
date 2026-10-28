import { defineConfig } from "vite";

export default defineConfig({
  server: {
    headers: {
      // Cross-origin isolation can improve WebAssembly performance in supported browsers.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp"
    }
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg"]
  }
});
