import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Base path must match the GitHub repo name for Pages asset paths to resolve
  base: "/klaviyo-report-builder/",
});
