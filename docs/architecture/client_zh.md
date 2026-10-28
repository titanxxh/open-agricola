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

- 生产启动在加载应用或创建 OAuth verifier 前，无凭据读取公开 `/api/app-location`。`app/canonical-app-location.ts` 将普通 query/fragment 链接保留到配置的同源 `/open-agricola/` 入口；旧源的在途 onboarding 重新开始注册，不跨源传递绑定票据或 verifier。本地偏好和草稿不会自动跨源迁移。
- 托管前端使用同源 HTTP，并按页面真实 scheme/host 推导 WS/WSS；discovery 和节点路径不放进网页子路径。`hosted-password-login.spec.ts` 用生产文件、真实密码登录、Cookie 保持、刷新和 routed WS 验证严格 WebKit 策略与 Chromium；引擎测试不能替代实体 Safari 验收。

- `services/oauth-onboarding.ts` 在当前标签页的 `sessionStorage` 保存浏览器 verifier 与回调票据，从浏览器历史移除票据 fragment，并在刷新、可修正的表单校验错误后保留凭证。`LoginPage` 在跳转授权前准备 challenge；HTTP 局域网等缺少 Web Crypto 的环境保留 Cookie 导航路径，并在持久缓存恢复的 `pageshow` 事件中重置导航状态；`OnboardingPage` 在成功或凭证终止错误时清理凭证，并提供重新注册入口。站点会话仍使用 HttpOnly Cookie。浏览器测试分别验证 ITP 下的账号创建与 CHIPS 会话能力；Linux WPE 不能替代实体 iPhone 的会话验收。
- `gameTransport.ts`（`WsGameTransport`）在服务层持有 WebSocket。它按标签页记录未确认的命令，隔离旧 socket 回调，重连期间暂停输入，查询回执，等待完整的过滤后快照，并只以原身份重试仍然有效的输入。
- `services/room-creation.ts` 使用新的已认证连接和独立的待确认命令记录创建房间。恢复时沿用原创建身份，收到持久回执和新房快照后才导航；来源重开失败时保留旧结果和完整的配置调整信息。大厅与两处完成入口共用这条链路。
- `card-meta.ts` 拉取 `GET /cards-manifest.json`；`rehydrate.ts` rehydrate 快照时不导入 `shared/actions` 或卡牌目录。
- `client/hooks/useGameSync.ts` 在每次 `stateUpdate` 时整体替换 `state`、`pending`、`interaction` 与 `scores`。没有乐观提交：点击发送命令，游戏 UI 只在快照到达后改变。本地临时态（hover、草稿、输入框）独立存在，新快照到达时清除无效的选择。
- 候场消息提供权威座位颜色与连接状态；`WaitingRoomPlayers` 显示所有座位及空位，断线玩家保留姓名和座位并标为离线。其选色器提供六种颜色，禁用其他玩家已占用的颜色，并等待服务端发布保存后的选择。
- 重连执行 `joinRoom` → `roomJoined(status, …)`：`waiting` 恢复等待页，只有 `playing` 才继续 `getState`；`newGame` 之后的 `roomWaiting` 广播会隐藏旧版图。
- 客户端按 `occurrenceId` 消费公开事件，用于临时通知、高亮与动画；首个快照初始化游标，不重放历史。Action Log 把 `publicEventArchive` 当作只读时间线读取。
- 玩家名通过 `client/utils/player-name.ts` 按生成名来源与座位号本地化；玩家提供的名字原样显示。
- `llm/generation/`：浏览器持有生成尝试、provider 工具协议与固定到一个 main SHA 的有界 GitHub 读取。LLM 凭据只发给配置的 provider。`server/workshop-references.ts` 用项目凭据提供已认证的仓库树 metadata，不接受调用方 URL 或模型凭据；浏览器匿名拉取固定版本的原文并校验 blob hash。`GET /api/workshop/sandbox-contract` 提供 prompt 所依据的已部署契约；参考资料不能扩大它。`POST /api/workshop/cards/validate-code` 把校验绑定到源码与沙盒身份，只有另行验证过的 provider / endpoint / model 组合才被接受。见 [Platform design](../PLATFORM_DESIGN.md) 与 [`docs/test/llm-card-gen.md`](../test/llm-card-gen.md)。

## 视图与本地沙盒

- `exchange-overlay-presentation.tsx` 与 `exchange-draft-presentation.ts` 承载普通兑换、喂养和供暖共用的交换中心。供暖复用配方行、顺序数量控件和重置路径，并展示燃料支付行与生病预览；`InteractionBar` 只保留确认入口。弹层根据底部操作栏的实测高度留出空间，过长的配方列表在面板内滚动，让确认按钮和随时响应入口均可操作。覆盖见 `heating-exchange.spec.ts`、`listener-lifecycle-room.spec.ts`、`issue-893-rules.spec.ts`。

- `interaction-focus.ts` 将本机 Interaction Player 的权威请求映射到显示目标。职业选择在接机确认后定位私有手牌，支付等后续步骤保留行动聚焦，完成后返回行动区。Session 交互适配器仅向响应者发布不透明的等待步骤 `requestKey`，候选刷新及 cursor 恢复均保留其身份，玩家手动浏览不会再次触发滚动。共享目标锚点与返回快捷入口覆盖手牌、供应区和农场选择。
- 农场选择、空间目标选择、动物整理及本机选中的 Moor 地形操作使用农场目标。格盘根据有效视口和固定操作栏调整尺寸，也支持扩展农场。围栏控件扩大命中范围，并以收窄端点区分相邻边。同一步的重复快照保留草稿，只移除撤回的合法目标。`fence-selection-quote.ts` 显示权威选择费用，在快照、请求或草稿改变后丢弃旧回复；费用查询不决定是否允许提交。验收见 `farm-interaction-focus.spec.ts` 及聚焦、农场草稿和费用组件测试。

- `board/ActionSpaceDescription.tsx` 根据权威 `baseDescriptionPreview` 渲染行动格图标，费用和数量始终取自该规则树。详细悬停说明与交互选项使用 `interaction/ActionDescription.tsx`。棋盘保留图形表达，不再另行维护规则表；组件和浏览器覆盖见 `ActionBoard.test.tsx` 与 `action-space-icons.spec.ts`。
- `client/app/GameContainerApi.tsx`（含 `useTransportSetup`）、`LobbyPage.tsx` 与 `PageRouter.tsx` 编排视图，并根据 `viewPlayerId` 与 `playerIndex` 推导可交互性。
- 轮抽与父母卡选择阶段在独立滚动的选卡区域上方保留 `GameHeader`。内嵌模式保留语言切换。测试见 `setup-navigation.spec.ts`。
- `RoomInvitePicker.tsx` 在输入两个字符后搜索用户名或显示名前缀，支持点击与键盘选择，等待输入法组字结束，并丢弃已取消请求的响应。已选玩家显示为带用户名、可移除的名字标签，账号 ID 只用于创建请求。服务端确认 Room 后从 URL 移除创建选项，所有准入决定仍由服务端执行。覆盖：`RoomInvitePicker.test.tsx`、`room-invitations.spec.ts`。
- `MyActiveGames.tsx` 通过参与者名字和颜色识别对局，显示本地时区的创建或开局时间，以及服务端给出的当前行动玩家。继续游戏使用 Room ID，但不展示该 ID。覆盖：`LobbyPage.test.tsx`、`room-invitations.spec.ts`、`lobby-active-games.spec.ts`。
- `app/solo/SoloHandOverlay.tsx` 按权威候选分组收集一次本地选择并原子提交。重复快照和语言切换保留可编辑勾选；刷新恢复候选并清空未确认勾选。Moor 准备和保留继续使用 `InteractionBar` 原生选择；`SpecialActionsPanel` 读取公开当前牌、弃牌及 `soloSupply` 投影。覆盖见 `standard-solo-ui.spec.ts` 与单人组件测试。
- 对局布局共用玩家总览与只读公开农场。窄屏把总览放在最前、默认展开的 Action Log 放在最后，详细计分按需打开。`ActionBoard.actionSpaceOutlets` 把原有行动格视图放入扩展面板，复用可用性与工人标记。布局覆盖见 `mobile-table-layout.spec.ts`、`mobile-game-layout.spec.ts` 与 `desktop-table-layout.spec.ts`。
- 不支持容器单位或 CSS 长度除法的浏览器通过 `useElementWidth` 与 `ResizeObserver` 测量卡牌和农场容器，提供卡牌缩放比例与农场宽度；支持这些特性的浏览器继续使用 CSS 容器尺寸。旧浏览器尺寸、横竖屏切换与农场输入由 `touch-card-play.spec.ts` 覆盖。
- `common/CardWithCopy.tsx` 负责触屏查看详情和绑定当前请求的出牌确认。`CardDetails.tsx` 使用模态对话框，内容独立滚动，关闭与打出按钮持续可见。`useCardPlayChoice` 防止手牌或供应区重复提交，跟随传输结果解除失败请求的提交锁；提交权限取自当前权威选项与本机座位。提交锁与详情权限使用 `useRequestActivation`：重复快照保留当前激活阶段，离开请求后即使恢复同一标识，也建立新的激活阶段；迟到结果仅影响所属阶段。职业多选保留整组确认。覆盖见 `PlayerCard.touch.test.tsx`、`touch-card-play.spec.ts` 与 `card-play-undo.spec.ts`。
- `improvement-selection.ts` 将当前可用请求选项与应答玩家手牌、主要改良供应区求交。发展请求有小发展候选时聚焦手牌，仅主要改良合法时展开并聚焦供应区，两者皆无候选时聚焦操作控件。`PlayerFarmPanel.improvementSupply` 将唯一供应区视图放在手牌旁；`GameContainerApi` 持有绑定请求标识的展开状态，重复快照及响应式手牌挂载位置变化都保留该状态。覆盖见 `GameContainerApi.presentation.test.tsx`、`MajorImprovements.test.tsx` 与 `improvement-focus.spec.ts`。
- `FarmBoard` 在格盘旁显示当前 Card Field 与牌上动物控件。`farm-board-projection.ts` 保留权威槽位 metadata；托盘与按时序排列的牌面共用草稿回调及动物区域 ID，包含借用的牌上区域。多个不透明选项继续使用既有目标选项器。统一农场聚焦区域包含格盘与托盘，短屏横屏时并排显示在固定操作栏上方。公开浏览不展示交互玩家草稿或可操作托盘。覆盖见 `farm-card-slots-session.test.ts`、`FarmBoard.test.tsx`、`GameContainerApi.presentation.test.tsx` 与 `farm-card-targets.spec.ts`。
- 默认试玩路径是后端 `POST /api/game/new-sandbox`。设置 `VITE_SANDBOX_EXECUTOR=browser` 时，工坊试玩在浏览器中运行：`LocalGameTransport` 实现 `GameTransport`，Worker 用本地校验过的自定义代码组装共享的 `GameCore`，`server/__tests__/local-sandbox-parity.test.ts` 把行为锁定到服务端执行器。十秒超时会从最后持久化的快照（含 `engineStackCursor`）重建 Worker，并告知 UI 已回滚。对局保存在一个 IndexedDB 槽中，schema 不匹配时删除。固定到 `exactVersionId` 的试玩仍使用后端沙盒。
- `AuthContext` 是站点登录会话（密码、GitHub 或 Google），不保存 Issue 写入授权；`LocaleContext` 切换语言。

### 交互展示不变量

- `interaction-presentation.ts` 优先使用后端明确声明的空间目标，Moor 选择没有目标时继续使用原生卡牌面板。
- 新请求需要本机输入时自动聚焦一次。重复快照和其他玩家的行动保留手动浏览位置。目标已完整可见时只突出提示，不额外滚动。支付及其他后续步骤保留聚焦，整段行动完成后才返回行动区。联机响应者可根据脱敏提示中公开的完成分类，将已跟随的行动返回行动区；展示输入目标仍要求本机座位权限和已确认的热座接机身份。
- 窄屏保留连续页面。操作栏优先显示当前任务和必要确认，并提供返回目标的快捷入口。操作目标和确认控件位于固定控件上方，短屏横屏同样适用。
- 已打出的职业与改良共用快照的 `playedCardChronology` 顺序，按从左到右、从上到下排列。新入场与重新入场的牌追加到末尾，牌上状态更新保留位置。父母卡保持独立区域。快照投影使用 History Window 裁剪前的完整有效历史，见[协议契约](contract_zh.md)。覆盖见 `played-card-chronology-session.test.ts` 与 `played-card-chronology.spec.ts`。
- 浏览器验收覆盖窄屏竖屏、短屏横屏、接机隐私、撤销、重连和过期卡牌详情。Chromium 触屏模拟与 WebKit 检查不能替代实体设备触摸验收。

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
- 上下文解析器在挂载、导航或生命周期变化事件发生时读取查询参数。WebSocket 静默更新房间 URL 后，切换语言不会重启活动对局。测试见 `GameContextRouter.test.tsx` 与 `setup-navigation.spec.ts`。
- 房间链接通过 WebSocket 加入，不指定客户端座位；服务端恢复账号已有座位，或让新玩家加入候场空位。保存暂停期间，所有在线座位看到同一状态，新命令控件被禁用。
- `ReplayShell` 校验 Replay header 与内容寻址的 Viewer manifest，并且只在选定视角后创建 `credentialless`、`sandbox="allow-scripts"` 的 iframe。历史 Viewer 从不调用需认证的 API；保留的证据通过 `postMessage` 传入。
- 完成的单人 Game Context 在历史 Viewer 外保留公开分数和私下校验本人资格的再开入口。即时 `ScoringPad` 注入同一再开组件；私有配置读取或 Viewer 失败均不隐藏公开结果。
- 损坏的 Segment 标记为不可用区间，并从下一个 checkpoint 继续；从不静默修复。
- Bug Report 在 GitHub OAuth 之前保存服务端草稿，取消授权后回到同一个 `submissionId`，提交后轮询状态；提交响应丢失时重新读取权威状态，因此报告不会重复创建。活动局的报告者锚定最新已提交的 Step；完成局的报告者必须是原参与者，锚定当前显示的 Step。
- Issue Submission Connection 独立于 `AuthContext`：报告页脚负责首次连接，设置页只显示状态和断开，连接失效时从不切换到 Hosted Issue Identity。

