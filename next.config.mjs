/** @type {import('next').NextConfig} */
// next.config.mjs
const nextConfig = {
  output: "export",
  reactStrictMode: true,
  images: { unoptimized: true }, // Disable image optimization for static export
  basePath: "/Interpretable-Style-Parameterized-Racing-Control-Website",
};

export default nextConfig;
