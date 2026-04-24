/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  // Disable image optimization for Electron
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Keep native modules out of the webpack bundle entirely
  experimental: {
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native modules so webpack never tries to bundle them.
      // canvas / @napi-rs/canvas are required at runtime by pdfjs-dist and
      // process-bill.ts; the Module._resolveFilename shim in process-bill.ts
      // redirects require('canvas') → @napi-rs/canvas at runtime.
      const existing = Array.isArray(config.externals)
        ? config.externals
        : [config.externals].filter(Boolean)

      config.externals = [
        ...existing,
        ({ request }, callback) => {
          if (
            request &&
            (request === 'canvas' ||
              request.startsWith('@napi-rs/') ||
              request.endsWith('.node'))
          ) {
            return callback(null, `commonjs ${request}`)
          }
          callback()
        },
      ]
    }
    return config
  },
}
module.exports = nextConfig
