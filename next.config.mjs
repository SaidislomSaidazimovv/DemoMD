/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server-only packages that Next should NOT try to bundle for client/RSC.
    // Big native-ish CJS packages like pdfkit + archiver eat compile time otherwise.
    serverComponentsExternalPackages: ["pdfkit", "archiver"],
  },
};

export default nextConfig;
