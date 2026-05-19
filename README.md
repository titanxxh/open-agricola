# Open Agricola

后端权威 + WebSocket 实时多人同步的 Agricola 桌游在线复刻。

[![CI](https://github.com/titanxxh/open-agricola/actions/workflows/ci.yml/badge.svg)](https://github.com/titanxxh/open-agricola/actions)
[![Pages Deploy](https://github.com/titanxxh/open-agricola/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/titanxxh/open-agricola/actions/workflows/deploy-pages.yml)
[![License: Apache 2.0](https://img.shields.io/github/license/titanxxh/open-agricola)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://titanxxh.github.io/open-agricola/)

> **Disclaimer**: Open Agricola is a fan-made implementation. Agricola is © Uwe Rosenberg / Lookout Spiele / Z-Man Games. This project is not affiliated with or endorsed by the rights holders.

## Features

- **LLM-Assisted Card Design** — 浏览器内调用 LLM 设计自定义卡牌，自动生成卡牌艺术，PR 一键提交到工坊
- 后端权威 + WebSocket 实时多人同步
- 248+ 张原版 Agricola 卡（接近 BGA 完整集）
- 一键 Docker 自部署（自建 VPS + GitHub Pages 双部署）
- 自定义代码沙盒（TypeScript AST 校验 + VM 隔离执行）

## Live Demo

https://titanxxh.github.io/open-agricola/

<!-- TODO: 截图占位（后续 PR 补） -->

## Quick Start

前置：Node.js 22 + pnpm（项目 `package.json` 的 `packageManager` 字段已锁定 pnpm 版本）。`better-sqlite3` 等原生依赖按 Node ABI 编译，Node 20 启动会出现 `NODE_MODULE_VERSION` 不匹配。

```bash
pnpm install
./restart-intranet.sh    # 同时启动后端 (5175) + 前端 (5173)
```

## URL Parameters

| 参数 | 说明 |
|---|---|
| `player=p1` / `player=p2` | 锁定玩家视角 |
| `transport=ws` | 启用 WebSocket 实时同步 |
| `room=<id>` | 加入指定房间 |
| `devMode=1` | 启用开发者面板（资源编辑、回合跳转、卡牌工具） |
| `customCards=id1,id2` | 创建 WS 房间时加载工坊卡 ID |
| `page=workshop` | 打开工坊页面 |
| `page=login` | 强制跳登录页（认证后默认跳大厅）|

## Project Structure

```
shared/    前后端共用：领域模型、引擎、卡牌、行动、协议
server/    后端：HTTP + WebSocket，权威状态
client/    前端：React UI、transport 抽象、hooks
docs/      架构、部署、平台设计、卡牌进度
```

## Tech Stack

![Node](https://img.shields.io/badge/node-22-brightgreen)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Vite](https://img.shields.io/badge/Vite-7-646cff)
![pnpm](https://img.shields.io/badge/pnpm-10-f69220)

后端 Node.js + WebSocket + SQLite（better-sqlite3）；前端 React 19 + Vite 7 + TypeScript。

## Documentation

| Topic | Doc |
|---|---|
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Deployment | [docs/HOW_TO_DEPLOY.md](docs/HOW_TO_DEPLOY.md) |
| Platform & Workshop | [docs/PLATFORM_DESIGN.md](docs/PLATFORM_DESIGN.md) |
| Card Test Template | [docs/CARD_TEST_TEMPLATE.md](docs/CARD_TEST_TEMPLATE.md) |
| 卡牌实现现状 | [docs/card_implementation_status.md](docs/card_implementation_status.md) |

## Contributing

PRs welcome. Commit 标题规范：`feat: ...` / `fix: ...` / `refactor: ...` / `docs: ...`，message 用英文。AI 协作约束（卡牌实现规范、文档同步硬规则、测试边界）见 [AGENTS.md](AGENTS.md)。

## License

[Apache 2.0](LICENSE)。fan project disclaimer + BGA studio attribution 见 [NOTICE](NOTICE)。
