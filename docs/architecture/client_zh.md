# client/ — 前端

[English](client.md) | [中文](client_zh.md)

> 本文件是中文翻译镜像；[client.md](client.md) 是唯一权威版本。

客户端渲染权威快照、收集输入并管理本地 UI 临时态。它从不裁定规则。

## 客户端 bundle

| Bundle | 入口 | 路径 | 约束 |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | 使用 WebSocket。从 `shared/*` 只导入 `contract`、`domain` 与 `i18n`；卡牌展示使用以 manifest 为后端的 `card-meta` 加 `custom-card-metadata`。 |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | 懒加载的工坊沙盒 UI；规则经后端沙盒路径执行。 |
| `local-sandbox-worker` | `client/local-sandbox/worker.ts` | `client/local-sandbox/` | 工坊试玩的浏览器引擎 Worker；只有其 Worker 侧文件可以导入完整的 `shared/*`，主 bundle 中的 `local-transport`、`persistence` 与 `workshop-launch` 只用类型导入 shared。 |
| `replay-viewer` | `replay-viewer/src/main.tsx` | `replay-viewer/` | 无登录、cookie、WebSocket 或命令；只读取公开 Replay JSON，使用归档时编译的展示过滤。 |

- 精确的入口与文件授权记录在 `scripts/architecture-policy.mjs`；没有目录级的豁免。ESLint `architecture/imports` 与 `pnpm run check:browser-boundaries` 把它们作为 CI 错误执行。
- `scripts/check-bundle-size.ts` 把主 bundle 预算定为原始 550 KB、gzip 170 KB，作为单独的构建后检查。

## 服务与同步状态

- `gameTransport.ts`（`WsGameTransport`）在服务层持有 WebSocket。它按标签页记录未确认的命令，隔离旧 socket 回调，重连期间暂停输入，查询回执，等待完整的过滤后快照，并只以原身份重试仍然有效的输入。
- `card-meta.ts` 拉取 `GET /cards-manifest.json`；`rehydrate.ts` rehydrate 快照时不导入 `shared/actions` 或卡牌目录。
- `client/hooks/useGameSync.ts` 在每次 `stateUpdate` 时整体替换 `state`、`pending`、`interaction` 与 `scores`。没有乐观提交：点击发送命令，游戏 UI 只在快照到达后改变。本地临时态（hover、草稿、输入框）独立存在，新快照到达时清除无效的选择。
- 候场消息提供权威座位颜色与连接状态；`WaitingRoomPlayers` 显示所有座位及空位，断线玩家保留姓名和座位并标为离线。其选色器提供六种颜色，禁用其他玩家已占用的颜色，并等待服务端发布保存后的选择。
- 重连执行 `joinRoom` → `roomJoined(status, …)`：`waiting` 恢复等待页，只有 `playing` 才继续 `getState`；`newGame` 之后的 `roomWaiting` 广播会隐藏旧版图。
- 客户端按 `occurrenceId` 消费公开事件，用于临时通知、高亮与动画；首个快照初始化游标，不重放历史。Action Log 把 `publicEventArchive` 当作只读时间线读取。
- 玩家名通过 `client/utils/player-name.ts` 按生成名来源与座位号本地化；玩家提供的名字原样显示。
- `llm/generation/`：浏览器持有生成尝试、provider 工具协议与固定到一个 main SHA 的有界 GitHub 读取。LLM 凭据只发给配置的 provider。`server/workshop-references.ts` 用项目凭据提供已认证的仓库树 metadata，不接受调用方 URL 或模型凭据；浏览器匿名拉取固定版本的原文并校验 blob hash。`GET /api/workshop/sandbox-contract` 提供 prompt 所依据的已部署契约；参考资料不能扩大它。`POST /api/workshop/cards/validate-code` 把校验绑定到源码与沙盒身份，只有另行验证过的 provider / endpoint / model 组合才被接受。见 [Platform design](../PLATFORM_DESIGN.md) 与 [`docs/test/llm-card-gen.md`](../test/llm-card-gen.md)。

## 视图与本地沙盒

- `interaction-focus.ts` 将本机 Interaction Player 的权威请求映射到显示目标。职业选择在接机确认后定位私有手牌，支付等后续步骤保留行动聚焦，完成后返回行动区。Session 交互适配器仅向响应者发布不透明的等待步骤 `requestKey`，候选刷新及 cursor 恢复均保留其身份，玩家手动浏览不会再次触发滚动。共享目标锚点与返回快捷入口供后续农场和发展选择复用。

- `board/ActionSpaceDescription.tsx` 根据权威 `baseDescriptionPreview` 渲染行动格图标，费用和数量始终取自该规则树。详细悬停说明与交互选项使用 `interaction/ActionDescription.tsx`。棋盘保留图形表达，不再另行维护规则表；组件和浏览器覆盖见 `ActionBoard.test.tsx` 与 `action-space-icons.spec.ts`。
- `client/app/GameContainerApi.tsx`（含 `useTransportSetup`）、`LobbyPage.tsx` 与 `PageRouter.tsx` 编排视图，并根据 `viewPlayerId` 与 `playerIndex` 推导可交互性。
- 对局布局共用玩家总览与只读公开农场。窄屏把总览放在最前、默认展开的 Action Log 放在最后，详细计分按需打开。`ActionBoard.actionSpaceOutlets` 把原有行动格视图放入扩展面板，复用可用性与工人标记。布局覆盖见 `mobile-table-layout.spec.ts`、`mobile-game-layout.spec.ts` 与 `desktop-table-layout.spec.ts`。
- `common/CardWithCopy.tsx` 负责触屏查看详情和绑定当前请求的出牌确认。`CardDetails.tsx` 使用模态对话框，内容独立滚动，关闭与打出按钮持续可见。`useCardPlayChoice` 防止手牌或供应区重复提交，跟随传输结果解除失败请求的提交锁；提交权限取自当前权威选项与本机座位。职业多选保留整组确认。覆盖见 `PlayerCard.touch.test.tsx` 与 `touch-card-play.spec.ts`。
- `improvement-selection.ts` 将当前可用请求选项与应答玩家手牌、主要改良供应区求交。发展请求有小发展候选时聚焦手牌，仅主要改良合法时展开并聚焦供应区，两者皆无候选时聚焦操作控件。`PlayerFarmPanel.improvementSupply` 将唯一供应区视图放在手牌旁；手动展开状态绑定请求标识，重复快照保留该状态。覆盖见 `GameContainerApi.presentation.test.tsx`、`MajorImprovements.test.tsx` 与 `improvement-focus.spec.ts`。
- 默认试玩路径是后端 `POST /api/game/new-sandbox`。设置 `VITE_SANDBOX_EXECUTOR=browser` 时，工坊试玩在浏览器中运行：`LocalGameTransport` 实现 `GameTransport`，Worker 用本地校验过的自定义代码组装共享的 `GameCore`，`server/__tests__/local-sandbox-parity.test.ts` 把行为锁定到服务端执行器。十秒超时会从最后持久化的快照（含 `engineStackCursor`）重建 Worker，并告知 UI 已回滚。对局保存在一个 IndexedDB 槽中，schema 不匹配时删除。固定到 `exactVersionId` 的试玩仍使用后端沙盒。
- `AuthContext` 是站点登录会话（密码、GitHub 或 Google），不保存 Issue 写入授权；`LocaleContext` 切换语言。

### 已确认的交互设计，尚未实现

以下要求已在 UI 设计讨论中确认，描述目标行为，不代表已经实现。

- Interaction Focus 跟随本机交互玩家的权威请求，并遵守现有接机隐私边界。选择职业时定位职业手牌，选择小改良时定位小改良手牌。
- 建房、围栏、建畜栏、犁田、播种、位置选择和动物整理聚焦农场操作区域。目标取决于当前需要的输入，不根据行动格名称推测。操作同时允许卡牌田或牌上动物槽位时，在农场旁提供对应控件，共用权威目标与本地草稿。卡牌本体保持原有时间位置。
- 主要改良供应区在发展手牌旁展开，仍是权威供应区的同一份视图。大小改良均可选时先定位小改良手牌，并提供明确的主要改良入口；仅有合法主要改良时直接展开并定位供应区；仅限小改良的请求不提供主要改良购买入口。
- 触摸设备上点牌打开详情，通过明确的打出按钮提交选择。关闭详情后保留玩家在手牌中的位置。
- 聚焦跟随支付及其他后续请求，整段行动完成后才返回行动区。新请求需要本机输入时自动聚焦一次，重复快照不打断手动浏览，其他玩家的行动不移动本机视口。桌面目标已完整可见时只突出提示，不额外滚动。
- 已打出的职业卡与各类改良按 Played Card Chronology 从早到晚混排，新入场牌追加到末尾，按从左到右、从上到下阅读。离场牌移除，重新打出或通过升级、交换新取得的牌按本次入场时间追加。触发能力或更新牌上状态不改变位置。撤销恢复此前顺序，重连保持当前顺序。父母卡保留独立区域。
- 时序在快照展示投影边界使用完整、当前有效的权威历史生成，先于 History Window 裁剪。客户端不从分类卡牌数组或收到快照的时间猜测顺序。
- 窄屏保留连续页面，固定控件不能遮住操作目标或必要控件。围栏边扩大触摸命中范围，清楚显示选中边、已选数量及权威费用。卡牌详情适配短屏，操作栏优先显示当前任务，并提供返回操作目标的快捷入口。

验收覆盖混合出牌顺序、离场重入、升级、交换、撤销，以及事件超出 History Window 后重连。交互覆盖连续出牌、后续支付、农场与卡牌目标及重复快照。移动端在窄屏竖屏和短屏横屏检查目标确实位于固定控件上方的可见区、围栏触摸目标，以及详情关闭后的滚动位置保留；触摸行为需做真机验收。

## Game Context、Replay Viewer 与 Bug Report

```text
GameContextRouter
  ├─ active → AuthProvider → 现有 PageRouter / GameContainerApi + 可选只读 Anchor 抽屉
  ├─ completed → ReplayShell → credentialless Replay Viewer iframe
  ├─ expired + retained Anchor → credentialless 历史 Viewer 单帧证据
  ├─ expired → Expired Game Context 页面
  └─ removed → Replay Tombstone 页面
```

- `game-room-url.ts` 生成的普通对局链接只需 `room`；连接方式和座位来自 Room 与登录账号。开发链接保留显式座位控制。
- `?room=<roomId>` 在卡牌 manifest 与登录门之前解析；未登录的活动上下文保留完整的 `returnTo`，非活动上下文不加载认证依赖。
- 房间链接通过 WebSocket 加入，不指定客户端座位；服务端恢复账号已有座位，或让新玩家加入候场空位。保存暂停期间，所有在线座位看到同一状态，新命令控件被禁用。
- `ReplayShell` 校验 Replay header 与内容寻址的 Viewer manifest，并且只在选定视角后创建 `credentialless`、`sandbox="allow-scripts"` 的 iframe。历史 Viewer 从不调用需认证的 API；保留的证据通过 `postMessage` 传入。
- 损坏的 Segment 标记为不可用区间，并从下一个 checkpoint 继续；从不静默修复。
- Bug Report 在 GitHub OAuth 之前保存服务端草稿，取消授权后回到同一个 `submissionId`，提交后轮询状态；提交响应丢失时重新读取权威状态，因此报告不会重复创建。活动局的报告者锚定最新已提交的 Step；完成局的报告者必须是原参与者，锚定当前显示的 Step。
- Issue Submission Connection 独立于 `AuthContext`：报告页脚负责首次连接，设置页只显示状态和断开，连接失效时从不切换到 Hosted Issue Identity。

