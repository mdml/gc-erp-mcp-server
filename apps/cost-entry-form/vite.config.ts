import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Single-file bundle: HTML + inlined JS + CSS, zero external fetches.
// Consumed by apps/mcp-server via Text-loader `import costEntryFormHtml from
// "@gc-erp/cost-entry-form/dist/cost-entry-form.html"` and served over
// `resources/read` at `ui://cost-entry/form.html`. No esm.sh at runtime.
//
// Vite `root: "src"` means the entry HTML lives at `src/cost-entry-form.html`;
// the output lands at `dist/cost-entry-form.html` (one level up, per
// `outDir: "../dist"`). The filename carries into the resource URI, so keep it
// stable.
export default defineConfig({
  plugins: [viteSingleFile()],
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/cost-entry-form.html",
    },
  },
});
