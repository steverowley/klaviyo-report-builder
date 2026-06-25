import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves from the /klaviyo-report-builder/ subpath, so asset URLs
  // must be prefixed with it. Vercel serves from the domain root, where that
  // prefix would 404 every asset (blank page). Vercel sets VERCEL=1 during its
  // build; GitHub Actions does not — so this keeps both deploy targets working.
  base: process.env.VERCEL ? "/" : "/klaviyo-report-builder/",
});
