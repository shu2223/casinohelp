/** @type {import('next').NextConfig} */

// Rust 后端地址：所有 /api/* 请求都代理到它。
// 用环境变量 RUST_BACKEND_URL 可覆盖（例如后端跑在其他端口/机器时）。
const backend = process.env.RUST_BACKEND_URL ?? "http://127.0.0.1:8787"

const nextConfig = {
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
