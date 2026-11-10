# 独立预发布通道的发布与托管约束

研究日期：2026-11-11，Asia/Singapore。源码基线：`53b8a0ccf5649ce3bb7084303f0677e46c1d20e7`。本文是 throwaway 研究分支的事实记录，服务于[现有发布门禁与 GitHub 托管对独立预发布有哪些约束？](https://github.com/titanxxh/open-agricola/issues/1641)，不选择身份模型、数据拓扑或预发布验证强度。

## 已确认的结论

现有发布入口不能直接把未合入的 `prerelease` SHA 当作正式候选。新增通道需要独立的候选准入及部署目标。现有 `release.published` 请求链会接收 prerelease 事件；`--prerelease` 也不会自动创建隔离部署目标。独立后端容器可复用运行组件，但数据库、对象存储、账号和房间实例目录的隔离仍须另作决策。下文分别列出证据。

## 正式候选的准入与证据绑定

| 事实 | 固定源码证据 |
| --- | --- |
| 候选必须等于同仓已合入 main 的 PR 最终 `merge_commit_sha`，并可从显式解析的 `refs/heads/main` 到达。未合入分支在检查验证回执前就被拒绝。 | [candidate-verification.ts，230–278 行](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/candidate-verification.ts#L230-L278) |
| 准入检查 PR、线性历史、禁止强推与删除的当前原生保护。 | [candidate-verification.ts，197–215 行](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/candidate-verification.ts#L197-L215) |
| 完整回执匹配 repository ID、head repository ID、候选 SHA、workflow ID、固定 workflow 路径、`workflow_dispatch` 和验证配置。配置哈希是兼容键，不能独立赋予候选可信性。 | [回执过滤](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/candidate-verification.ts#L118-L142)、[ADR 0037](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0037-scope-routine-verification-and-gate-releases.md#L8-L22) |
| 请求验证前再次准入，dispatch ref 必须仍指向固定 SHA。 | [candidate-verification.ts，323–337 行](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/candidate-verification.ts#L323-L337) |
| 版本解析接受后缀，但发布 CLI 不接受 `--prerelease`，执行 `gh release create` 时也不传该选项。后缀不等于仓库工具已经实现预发布语义。本机 `gh 2.45.0` 的该选项默认 false，API 请求使用该布尔值。[CLI 一手实现](https://github.com/cli/cli/blob/v2.45.0/pkg/cmd/release/create/create.go#L179-L180)。 | [版本参数](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/release/publish.ts#L8-L17)、[发布命令](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/release/publish.ts#L44-L70) |
| 后端先在 owner 本机运行候选验证，验证成功后才打开生产 SSH。更换远端目录本身不豁免候选要求。 | [deploy-backend.sh，1–17 行](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/deploy-backend.sh#L1-L17)、[ADR 0037](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0037-scope-routine-verification-and-gate-releases.md#L14-L18) |

因此，正式候选检查需要继续完整保留。预发布如何建立自己的来源信任、固定 SHA 和验证回执，属于[prerelease 分支的候选验证、发布与正式晋升如何治理？](https://github.com/titanxxh/open-agricola/issues/1645)。

## GitHub Release 与 Pages 的实际边界

GitHub 官方说明，`release.published` 同时涵盖稳定发布和 prerelease。`workflow_run` 执行默认分支的后续工作流，而且可获得上游没有的权限。名称或上游成功不能代替候选与来源校验。[工作流事件文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release)、[workflow_run 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)。

仓库请求工作流只监听 `published`，没有 prerelease 分流。broker 固定要求当前 main 的 policy checkout，检查请求 run 身份与固定 SHA，并复用正式候选准入。随后向同一个 `github-pages` 环境发布。因此，按现有实现发布 prerelease 会进入同一请求链；未合入候选将被正式 gate 阻断，而已合格候选仍会指向正式 Pages 目标。[请求 workflow](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/.github/workflows/pages-release-request.yml#L1-L17)、[broker workflow](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/.github/workflows/deploy-pages-broker.yml#L35-L62)、[来源与回执检查](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/pages-deployment.ts#L47-L94)、[构建前 gate](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/pages-deployment.ts#L115-L145)。

GitHub Pages 每个 repository 最多一个项目站点。新增 GitHub Environment 不会创建第二个 Pages 站点。要保留独立预发布前端，需要决定另一托管目标，或明确设计同一站点内的内容组织和发布策略。[Pages 官方限制](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#types-of-github-pages-sites)。

GitHub Environment 可以限制部署来源和 secret 访问；它是部署权限边界，不是独立主机、数据库或静态站点。[Environment 官方文档](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。当前 broker 还显式检查 `github-pages` 只允许 main，不能直接把这个环境开放给预发布 ref。[现有检查](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/pages-deployment.ts#L86-L94)。

候选构建现已移除 `GH_TOKEN` 和 `GITHUB_TOKEN` 后运行子命令，凭据不随 checkout 持久化。新通道仍需决定候选执行与发布权限的边界，不能因“同仓分支”而省去该判断。[构建子进程](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/scripts/ci/pages-deployment.ts#L96-L102)、[checkout 配置](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/.github/workflows/deploy-pages-broker.yml#L22-L26)、[GitHub 权限指导](https://docs.github.com/en/actions/reference/security/secure-use#use-secrets-for-sensitive-information)。

## 当前远端配置的只读快照

2026-11-11 查询以下一手 API。下面仅记录与本问题有关的非敏感字段，没有读取 secrets，也没有修改设置。

| 查询 | 读回事实 |
| --- | --- |
| `gh api repos/titanxxh/open-agricola/pages` | `build_type=workflow`，`cname=open-agricola.titanxxh.com`，HTTPS enforced。 |
| `gh api repos/titanxxh/open-agricola/environments` | 本次回执只列出 `github-pages`，采用 custom branch policy。 |
| `gh api repos/titanxxh/open-agricola/environments/github-pages/deployment-branch-policies` | 仅 `name=main,type=branch`。 |
| `gh api repos/titanxxh/open-agricola/rules/branches/main` | 有 deletion、non_fast_forward、required_linear_history、pull_request 和 required_status_checks。 |
| `gh api repos/titanxxh/open-agricola/branches/prerelease` | HTTP 404，当前未查到该分支。 |

这些是查询时的配置事实，不证明历史保护、特权 bypass 策略或未来配置。具体 environment、分支和验证政策仍需用户决策，不能把平台“支持”写成仓库“已经配置”。

## 独立容器可以复用什么

| 部分 | 已有机制与缺口 |
| --- | --- |
| 前端连接目标 | `VITE_API_BASE` 和 `VITE_WS_BASE` 决定构建产物目标；当前没有按登录账号运行时切换后端的配置入口。需要候选配套前端。[client/config.ts](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/client/config.ts#L1-L5) |
| HTTP 与 WS 路由 | 房间定位在 `/api/rooms/locate`，RoomRoute 包含 `/nodes/<instanceId>/ws`；现有 ingress 从数据库实例目录选进程。独立环境须明确数据库目录与路由的归属，不能只给容器换名。[定位入口](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/index.ts#L499-L512)、[RoomRoute](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/game/room-directory.ts#L13-L19)、[ingress](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/ingress.ts#L56-L86) |
| Compose | app 镜像为 `open-agricola:backend`，生产固定两个 app 进程；Caddy 占用 host 的 80、443 和 8443，依赖网络固定为 `open-agricola-local_default`。复制 Compose 到另一目录不能自动消除端口、镜像与网络共享。[app 配置](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docker-compose.prod.yml#L18-L35)、[代理与网络](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docker-compose.prod.yml#L75-L98) |
| 数据库 | `DATABASE_URL` 和 `DATABASE_SCHEMA` 可选择目标；单例 `getDb()` 同时服务多类产品数据，没有独立账号连接参数。[server/db.ts](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/db.ts#L1-L16)、[资格查询](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/experimental-features.ts#L13-L28) |
| 对象存储 | endpoint、bucket、凭据和 `S3_PREFIX` 已可配置。前缀隔离存在，不代表共享凭据已被限制到该前缀。[S3 构造](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/storage/s3-store.ts#L27-L39) |
| 会话 | session Cookie 为 HttpOnly、Path=/，不设置 Domain。生产 SameSite 与 Secure 由 app/API origins 决定。跨主机入口是否复用登录，不能仅靠 Beta 表解决。[Cookie 属性](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/auth-cookies.ts#L23-L36)、[会话序列化](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/auth-cookies.ts#L70-L71) |

## 需要显式处理的 ADR 边界

- [ADR 0037](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0037-scope-routine-verification-and-gate-releases.md) 约束正式候选与完整验证。预发布需新增政策，不能将未合入 SHA 冒充正式候选，也不能沿用正式回执名称却降低其含义。
- [ADR 0035](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0035-github-pages-remains-the-frontend-host.md) 固定正式 Pages 前端和同站跨源 API、host-only 会话及登录恢复。它没有选择预发布的前端托管或登录模型。
- [ADR 0042](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0042-experimental-feature-availability.md#L12-L22) 的 Beta 是功能入口门控，受邀参与者不一定有资格，撤销不停止既有局。非生产默认全开。环境级准入必须明确覆盖这些差异，不能直接把已有 feature check 当作完整环境防线。
- [ADR 0022](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0022-distributed-room-recovery.md) 要求托管 Room durable recording、数据库所有权与按代维护升级。是否允许重置预发布局、怎样通知和恢复，仍是新通道的产品承诺。

## 尚未知与后续决策输入

本次没有登录生产主机，没有验证可用 CPU、内存、存储、外部 DNS、TLS 或反向代理当前运行配置。仓库配置不证明这些运行条件已经满足。没有创建产品 prerelease 分支、Environment、域名、容器或 Release，也没有触发候选验证。

[预发布游戏数据与运行资源隔离到什么边界？](https://github.com/titanxxh/open-agricola/issues/1642) 应明确哪些数据及凭据可共享。[账号、登录会话与 Beta 资格如何跨环境复用？](https://github.com/titanxxh/open-agricola/issues/1643) 应明确资格权威、会话交接与撤销传播。[预发布环境的 Beta 准入、退出与撤销如何生效？](https://github.com/titanxxh/open-agricola/issues/1644) 应明确受邀用户、观战和既有局的环境级政策。[prerelease 分支的候选验证、发布与正式晋升如何治理？](https://github.com/titanxxh/open-agricola/issues/1645) 应选择独立候选与晋升规则。[预发布前后端、独立容器与路由如何部署、升级和回滚？](https://github.com/titanxxh/open-agricola/issues/1646) 应选择托管、路由与恢复承诺。以上均没有在本研究中代替用户决定。

## 研究产物验证范围

仅增加这份 Markdown。提交前检查固定源码链接的文件存在及行号范围，运行 `git diff --check`，并检查没有产品源码或配置变化。研究无需启动应用或运行规则测试。推送后按准确 branch 与提交 SHA 查询 Actions；结果在研究票 resolution comment 中记录。研究分支的检查不构成任何预发布或正式发布验收。
