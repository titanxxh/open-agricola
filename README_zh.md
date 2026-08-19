# Open Agricola

[English](README.md) | [中文](README_zh.md)

Open Agricola 项目的目标是支持全部的 Agricola 扩展。目前支持的包括：
- Revised version A-E 全部888张卡牌
- Parent Cards
- Through the Seasons
- Farmers of the Moor

同时希望为玩家实现新的扩展提供良好的基础设施（参考卡牌工坊功能）。

> 冷知识：截至目前，本repo所有代码均由AI agent产出。

[![CI](https://github.com/titanxxh/open-agricola/actions/workflows/ci.yml/badge.svg)](https://github.com/titanxxh/open-agricola/actions)
[![Pages Deploy](https://github.com/titanxxh/open-agricola/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/titanxxh/open-agricola/actions/workflows/deploy-pages.yml)
[![License: Apache 2.0](https://img.shields.io/github/license/titanxxh/open-agricola)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://titanxxh.github.io/open-agricola/)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20Me-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/titanxxh)
[![爱发电](https://img.shields.io/badge/爱发电-支持titanxxh-946ce6)](https://afdian.com/a/titanxxh)

> **免责声明**：Open Agricola 是一款爱好者自制的实现。Agricola © Uwe Rosenberg / Lookout Spiele / Z-Man Games。本项目与相关权利人无关，也未获得其认可。

## Features

- 后端权威 + WebSocket 实时多人同步
- 2-6 人房间、simultaneous draft、Community Deck、自定义工坊卡
- **LLM-Assisted Card Design** — 浏览器内调用 LLM 设计自定义卡牌，自动生成农场主画风的卡牌图片和**实现代码**；配置 GitHub 集成后可从工坊提交 PR

## Live Demo

https://titanxxh.github.io/open-agricola/

![Open Agricola 游戏运行截图](docs/assets/gameplay-screenshot.webp)

## Quick Start

前置：Node.js 22 + pnpm（项目 `package.json` 的 `packageManager` 字段已锁定 pnpm 版本）。`better-sqlite3` 等原生依赖按 Node ABI 编译，Node 20 启动会出现 `NODE_MODULE_VERSION` 不匹配。

`canvas` 从源码编译，需要先装系统库与编译工具链，否则 `pnpm install` 会失败：

```bash
# Debian / Ubuntu
sudo apt-get install -y build-essential pkg-config python3 \
  libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev

# macOS
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
```

```bash
pnpm install
./restart-intranet.sh    # 同时启动后端 (5175) + 前端 (5173)
```

常用验证命令：

```bash
pnpm test:fast
pnpm run lint
pnpm run build
```

## URL Parameters

| 参数 | 说明 |
|---|---|
| `player=p1` / `player=p2` | 锁定玩家视角 |
| `transport=ws` | 启用 WebSocket 实时同步 |
| `room=<id>` | 加入指定房间 |
| `maxPlayers=2..6` | 创建 WS 房间时设置人数 |
| `draftMode=simultaneous` | 创建 WS 房间时启用 simultaneous draft |
| `draftPoolSize=7..10` | 设置 draft 每类牌池大小 |
| `enableCommunityDeck=true` | 创建 WS 房间时加入 Community Deck |
| `enableParentCards=true` | 创建 WS 房间时启用 Parent Cards |
| `enableThroughTheSeasons=true` | 创建 WS 房间时启用 Through the Seasons |
| `enableFarmersOfTheMoor=true` | 创建 WS 房间时启用 Farmers of the Moor |
| `allowIncompleteFarmersOfTheMoorMinorDeal=true` | Farmers of the Moor 小改良池不完整时仍允许开局 |
| `customCards=id1,id2` | 创建 WS 房间时加载工坊卡 ID |
| `devMode=1` | 在固定 dev 房间或 embedded sandbox 启用开发者面板 |
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
![Vite](https://img.shields.io/badge/Vite-8-646cff)
![pnpm](https://img.shields.io/badge/pnpm-10-f69220)

后端 Node.js + WebSocket + SQLite（better-sqlite3）；前端 React 19 + Vite 8 + TypeScript。

## Documentation

| Topic | Doc |
|---|---|
| Architecture | [docs/ARCHITECTURE_zh.md](docs/ARCHITECTURE_zh.md) |
| Deployment | [docs/HOW_TO_DEPLOY_zh.md](docs/HOW_TO_DEPLOY_zh.md) |
| Platform & Workshop | [docs/PLATFORM_DESIGN_zh.md](docs/PLATFORM_DESIGN_zh.md) |
| Card Test Template | [docs/CARD_TEST_TEMPLATE_zh.md](docs/CARD_TEST_TEMPLATE_zh.md) |
| 卡牌实现现状 | [docs/card_implementation_status_zh.md](docs/card_implementation_status_zh.md) |
| Custom Card Sandbox | [docs/CUSTOM_CARD_SANDBOX_zh.md](docs/CUSTOM_CARD_SANDBOX_zh.md) |
| Community Cards | [docs/community_cards.md](docs/community_cards.md) |
| CI Checks | [docs/operations/ci-checks.md](docs/operations/ci-checks.md) |

## Contributing

PRs welcome. 开发环境、测试、commit 与 PR 规范见 [CONTRIBUTING_zh.md](CONTRIBUTING_zh.md)。AI 协作约束（卡牌实现规范、文档同步硬规则、测试边界）见 [AGENTS.md](AGENTS.md)。安全漏洞请按 [SECURITY_zh.md](SECURITY_zh.md) 私下报告。

## 支持项目

如果这个项目对你有帮助，可以请开发者喝杯咖啡：

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/titanxxh)

<a href="https://afdian.com/a/titanxxh"><img width="180" src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.png" alt="爱发电"></a>

## License

[Apache 2.0](LICENSE)。fan project disclaimer + 美术素材归属声明见 [NOTICE](NOTICE)。
