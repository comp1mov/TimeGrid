import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: ".drawing-lab-build",
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      input: "drawing-lab.html",
      output: { inlineDynamicImports: true },
    },
  },
});
