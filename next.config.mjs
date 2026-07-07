/** @type {import('next').NextConfig} */

const isStaticExport = process.env.CF_PAGES === "1" || process.env.NEXT_OUTPUT === "export"

// 本地 Next dev 使用 rewrite 代理到 Rust 后端。
// Cloudflare Pages 静态导出时，浏览器通过 NEXT_PUBLIC_API_BASE_URL 直连 Fly 后端。
const backend = process.env.RUST_BACKEND_URL ?? "http://127.0.0.1:8787"

const nextConfig = isStaticExport
  ? {
      output: "export",
    }
  : {
      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: `${backend}/api/:path*`,
          },
        ]
      },
    }

export default nextConfig
