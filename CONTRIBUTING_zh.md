# Contributing to Open Agricola

[English](CONTRIBUTING.md) | [中文](CONTRIBUTING_zh.md)

> 本文件是中文翻译镜像；[CONTRIBUTING.md](CONTRIBUTING.md) 是唯一权威版本。

感谢你的关注！提交 issue / PR 前请先读完本文。

## 开发环境

前置依赖：

- **Node.js 24.15 及以上，且不含 Node 25 线**。`engines` 声明 `^24.15.0 || >=26.0.0`：`isolated-vm` 7 要求 `node >= 24`，而 `jsdom` 30 只接受 `^24.15.0 || >=26.0.0`，整条 Node 25 被排除。`better-sqlite3` 等原生依赖按 Node ABI 编译，用更低版本启动会出现 `NODE_MODULE_VERSION` 不匹配。
- **pnpm**。版本由 `package.json` 的 `packageManager` 字段锁定，推荐 `corepack enable` 自动匹配。
- **canvas 原生编译所需的系统库与工具链**。缺少时 `pnpm install` 会在编译 canvas 时失败：

  ```bash
  # Debian / Ubuntu
  sudo apt-get install -y build-essential pkg-config python3 \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev

  # macOS
  brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
  ```

安装与启动：

```bash
pnpm install
./restart-local.sh    # 本地应用启动 / 重启统一入口，在 127.0.0.1 上启动后端 (5175) + 前端 (5173)
./restart-local.sh --intranet   # 改绑局域网 IP，便于从另一台机器测试
```

## 测试

三层测试：

- **Unit**（`shared/**/__tests__/*.test.ts`）——纯领域逻辑。
- **Session**（`server/__tests__/*.test.ts`）——直接实例化 `GameSession`，断言 `state` / `pending` / `log` / `scores`。规则正确性测试写在这一层。
- **E2E**（`e2e-tests/*.spec.ts`）——Playwright 浏览器测试，需要前后端在运行。

```bash
pnpm test:fast              # fast project（CI 默认）
pnpm test                   # vitest 全量（fast + slow）
pnpm verify focus <file.test.ts> # 调试期间定向 Vitest，不重启应用
pnpm verify prepush         # 最终源码的完整 fast + lint
pnpm verify <file.spec.ts>   # 重启隔离应用并跑 Playwright
pnpm verify status          # 检查验证记录是否对应当前源码
pnpm run test:e2e           # Playwright E2E
pnpm run lint               # ESLint，error 必须清零
```

调试期间针对受影响行为跑定向测试，纯测试、工具和文档改动不要求每次重启应用。涉及应用行为、UI 或 WebSocket 时，最终验证先通过 `./restart-local.sh` 重启并检查真实行为；`pnpm verify <file.spec.ts>` 会在隔离环境完成这些步骤。最终源码上运行 `pnpm verify prepush`，按风险补相关 slow Session / E2E。定向检查不能代替完整门禁。

Session 夹具区分真实开局和预设工作阶段场景，见[卡牌测试模板](docs/CARD_TEST_TEMPLATE_zh.md#52-状态准备方式)。验证记录、测试依赖准备与本机全量 CI 见 [CI 操作文档](docs/operations/ci-checks.md)。记录用于识别过期结果，不会自动跳过检查。

贡献者只需要 `./restart-local.sh` 这一个 shell 脚本。`deploy-backend.sh` 和 `backup-offsite.sh` 是维护者专用的，用于运维 owner 的生产机，不属于任何贡献流程。

## 架构边界（必读）

- 三层 `shared/`（领域逻辑）+ `server/`（HTTP + WS 服务）+ `client/`（React UI）。前端只负责渲染与输入收集，**不做规则裁定**。
- 后端 `GameSession`（`server/game/authoritative-session.ts`）是 `GameState` 的唯一写入者。
- 卡牌能力尽量在卡牌文件内部闭环；**禁止**在核心文件加单卡 `if-else`、建集中式卡牌效果注册表、在前端硬编码卡牌规则。

完整规范（卡牌实现规则、Card Workflow、文档同步硬规则）见 [AGENTS.md](AGENTS.md)，架构细节见 [docs/ARCHITECTURE_zh.md](docs/ARCHITECTURE_zh.md)。卡牌相关改动前请先阅读 [docs/CARD_TEST_TEMPLATE_zh.md](docs/CARD_TEST_TEMPLATE_zh.md) 并提供测试说明。

## Commit 与 PR

- Commit 标题规范：`feat: ...` / `fix: ...` / `refactor: ...` / `docs: ...`，message 用英文，简洁明了。
- 永远 rebase main，**禁止 merge commit**。
- 每次 push 前 rebase main，在最终源码上运行 `pnpm verify prepush`。push 后等待所有相关 GitHub Actions run 结束；失败要修复，skipped 不算成功验证。
- 卡牌相关改动必须同步 [docs/card_implementation_status_zh.md](docs/card_implementation_status_zh.md)；改动通用扩展点（hook phase、ActionFlow node、协议层）必须同步 [docs/ARCHITECTURE_zh.md](docs/ARCHITECTURE_zh.md)。

## Issue

报 bug / 提功能请求请使用 issue 模板。对局中发现的规则 bug 优先用游戏内的 Bug Report 按钮提交——它会自动附带对局 replay，定位效率高得多。
