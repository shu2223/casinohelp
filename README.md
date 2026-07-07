# 博彩决策助手

Rust 后端（唯一计算引擎）+ Next.js 前端。前端不做任何计算，所有 `/api/*` 请求由 Next 代理到 Rust 服务。

## 启动（两个都要开）

```powershell
# 终端 1：Rust 后端（端口 8787）
.\target\release\lucky-tools-server.exe
# 没有构建产物时先构建：cargo build --release

# 终端 2：前端（端口 3000）
npm run dev
```

浏览器打开 http://localhost:3000 。

- Rust 后端没启动时，前端页面能打开但所有计算会报错——先开后端。
- 后端换端口时：设置环境变量 `RUST_BACKEND_URL`（前端）与 `PORT`(后端) 保持一致。
- 手机访问：`npm run dev -- -H 0.0.0.0`，手机浏览器访问 `http://<电脑局域网IP>:3000`。

## 架构

| 部分 | 位置 | 职责 |
|---|---|---|
| `crates/core` | Rust | 全部公式与单元测试（凯利/组合凯利/赔率转换/去水/EV）——**唯一权威实现** |
| `crates/server` | Rust (axum) | JSON API + 输入校验，监听 8787 |
| `app/`, `components/` | Next.js | 纯界面；`/api/*` 经 `next.config.mjs` rewrites 代理到 Rust |
| `lib/types.ts` | TS | Rust API 响应的类型声明（无逻辑） |

规格与验收：`REQUIREMENTS.md` / `ACCEPTANCE.md` / `ACCEPTANCE_REPORT.md`。
