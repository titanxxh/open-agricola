# 发布候选验证：哪些测试最耗时、哪些可以裁减或降本

调研日期 2026-11-20，基线 main `d214ea798`。只读调研，没有运行完整套件。

## 数据来源

- GitHub run 44691030640（pre 候选 `79aa0b78`，producer `ae6f3e8b`）各任务日志。
- fast、slow 的逐文件耗时从 Vitest 日志解析，见 `fast-gh.json`，格式为 `[file, project, tests, ms]`。
- chromium 用的是 Playwright dot reporter，`results.json` 也不带耗时，所以逐 spec 只能用本机权重表 `scripts/ci/browser-spec-weights.json`。按该 producer 的表还原的分片名单见 `shards-44691030640.json`。
- 每个 spec 覆盖什么、是否在别处已有覆盖，见 `q1-spec-coverage.tsv`。
- 计时里含 pre 专有文件：fast 有 50 个、合计 114 s，chromium 里有 `prerelease-session.spec.ts`。所以这组数据和 main 略有出入。

## 基线

| 任务 | GitHub | 说明 |
|---|---|---|
| fast | 墙钟 1074 s，1278 个文件 | 测试时间合计 2228 s：fast-scripts 1349、fast-server 786、fast-client 59、其余约 35。Vitest 自报的分布是 tests 72%、setup 18%、import 5%、transform 3%（这些百分比按总时间算，不是墙钟） |
| slow | 148 s | 998 个单卡 Session 测试，不在关键路径上 |
| chromium-1..4 | 6.8 / 12.6 / 11.7 / 18.2 分钟 | 本机每片约 480 s，GitHub 与本机的比值为 0.84 / 1.56 / 1.44 / 2.3 |
| webkit | 4.3 分钟，16 个测试 | |
| browser-sandbox | 24 s | |

- 所有浏览器任务都只用 1 个 Playwright worker（`playwright.config.ts:8`），lane 数也是默认的 1。
- 本机完整验证 13–16.5 分钟，CPU 已打满，约 105 CPU·分钟（见 #1779）。

## fast 为什么慢

### fast-scripts

fast-scripts 里约 68 个文件是发布、部署和 CI 编排工具的测试，合计约 1100 s。慢的原因有两个：

- 每个用例都 `mkdtemp`，复制 `scripts/ci` 和 `scripts/release`，执行 `git init/commit`，挂上 node 写的 gh/ssh 桩，再在新的根目录下用 tsx 执行 CLI。
- tsx 的转译缓存键里包含源文件的绝对路径。新根目录下冷启动要 1.0–1.2 s，热启动只要 0.05 s。

这些工具在发布时由受信 main（producer）执行，不是候选。仓库拆分后它们会离开 fast。

### fast-server

约 86 个文件、568 s，每个用例都新建一个 PG schema，估计一共建约 550 次。

### setup 占 18%

默认 `isolate: true`，每个文件都要重新跑一遍 setupFiles，也就是 `register-all` 加语言包。fast-server 的小文件每个 setup 约 0.35 s。

## 只降本、不损失覆盖的候选

| 项 | 估计节省 |
|---|---|
| fast-server 改为每个文件建一个 PG schema，用例之间清表，或改用已迁移的模板 | 150–250 GH worker·s（推断） |
| `code-gen-pr-snapshot` 合并成一次 tsc、一次 generate | 20–25 GH s |
| `workshop-browser-card-tests` 注入短的 runaway 超时。现在 `client/local-sandbox/card-tests.ts:6` 的 20 s 超时会真实等待，Chromium 和 WebKit 各等一次 | 约 35 本机 s |
| `server-maintenance` 用 `page.clock` 推进 15 s 的重试 | 约 20 本机 s |
| 测试内的 Pages 构建去重。`e2e-tests/helpers/pages-frontend.ts:16` 按随机端口的 `apiOrigin` 缓存，等于每次都重新构建；`hosted-password-login` 自己又构建了一份 | 60–120 本机 s（推断） |
| 删除 `seasonal-fence-log`，它是 `seasonal-settlement-logs` 的子集 | 13 本机 s |
| chromium 套件排除 `local-sandbox`，`browser-sandbox` 任务已经在跑同一个文件 | GH 约 24 s |
| GitHub workflow 预拉 `operations-dashboard` 用到的 grafana、prometheus 镜像。本机 harness 已经预拉 | 仅影响 GitHub |
| 合并 4 个 bug-report 管理端 spec。它们各自另起一套完整的 `restart-local.sh` 应用 | 15–30 本机 s（推断） |

## 裁减发布覆盖的候选

| 候选 | 估计节省 | 失去什么 |
|---|---|---|
| 主要断言规则结果的 E2E 改为 `@extended`：`listener-lifecycle-room` 5 个用例留 1 个；`action-space-use`、`moor-completion-window`、`a040-clay-positions`、`moor-granted-lifecycle`、`action-log-source` 整个文件；`seasonal-settlement-logs` 只留 1–2 例 | 约 140 本机 s | 规则本身有 Session 测试；失去的是双客户端同步和 reload 后的回填 |
| 变体收窄：`ws-dual-player` 座位只测 2 和 6；`frontend-browser-scenario-matrix` 视口 6 个留 3 个；删掉 `standard-solo-ui` 的 14 轮整局 | 约 55 本机 s | 中间人数和这几个具体尺寸 |
| encyclopedia 移动布局只跑与布局相关的用例 | 60–80 本机 s | 要改 `encyclopedia.requirements.json` 里钉住的 81 个用例 |
| 测试成功时不再留诊断截图（178 处，从不比对） | 40–100 本机 s（推断） | 成功的运行不留截图 |

## chromium-4 在 GitHub 上慢 2.3 倍的原因

- **权重表有误差。** 两版 profile 之间同一 spec 的权重大幅摆动，例如 `workshop-browser-card-tests` 从 2 变到 49，`standard-solo-acceptance` 从 60 变到 20。`platform-shell` 记为 89、`stale-chunk-recovery` 记为 47，这些应该重测，不是裁减对象。
- **测试本身在 4 vCPU 上更吃亏：**
  - `standard-solo-acceptance` 会重启整个应用；
  - `operations-dashboard` 在测试里现场 `docker run`，GitHub 上没有预拉镜像；
  - `application-loading` 和 `public-asset-worker` 在测试里做生产构建；
  - 多页面 reload；
  - `verify.sh` 强制使用软件 GL，渲染全部吃 CPU。

## 其他发现

- **Routine 漏选。** 测试通过子进程执行的脚本，不会被算作依赖。例如改 `scripts/release/publish.ts` 时，Routine 选不中 `release-publish.test.ts`。完整名单见当日的子代理探针。
- `prerelease-owner-verification` 里的 `@webkit` 用例不在 WebKit 命令列表中。
- `local-sandbox` 在发布验证里跑了两遍。
