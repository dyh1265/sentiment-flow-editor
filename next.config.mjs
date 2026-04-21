/** @type {import('next').NextConfig} */

// GitHub Pages project sites serve from `<user>.github.io/<repo>/`, so every
// asset URL has to be prefixed with the repo name. Locally (npm run dev /
// docker nginx / Vercel) we want the app at the root. The workflow sets
// GITHUB_PAGES=true; nothing else does, so local paths stay pristine.
const isGithubPages = process.env.GITHUB_PAGES === "true";
// NEXT_PUBLIC_BASE_PATH lets a fork override the repo name without touching
// this file (e.g. if you rename the repo or host at a different subpath).
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (isGithubPages ? "/sentiment-flow-editor" : "");

const nextConfig = {
  reactStrictMode: true,
  // Build to a fully static bundle (`out/`) with no server runtime. The app
  // runs entirely in the browser: VADER for local scoring, direct OpenAI calls
  // with the user's key for LLM features.
  output: "export",
  // Static exports can't use the Next image optimizer.
  images: { unoptimized: true },
  // Friendlier for static hosts that may or may not serve extensionless paths.
  trailingSlash: true,
  ...(basePath
    ? {
        basePath,
        // assetPrefix must end with a trailing slash so Next joins URLs
        // cleanly (basePath + "/" + "_next/...").
        assetPrefix: `${basePath}/`,
      }
    : {}),
};

export default nextConfig;
