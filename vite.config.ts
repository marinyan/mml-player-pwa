import { defineConfig } from "vite";

// GitHub Pages subpath for a repository named "mml-player-pwa".
// Change this to "/" for a custom domain or to "/your-repo-name/" after renaming.
export default defineConfig({
  base: "/mml-player-pwa/",
  test: {
    environment: "node"
  }
});
