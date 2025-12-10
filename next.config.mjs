/** @type {import('next').NextConfig} */
// next.config.mjs
const basePath = "/Interpretable-Style-Parameterized-Racing-Control-Website"

const nextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true }, // Disable image optimization for static export
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
