# client/ — 前端

[English](client.md) | [中文](client_zh.md)

> 本文件是中文翻译镜像；[client.md](client.md) 是唯一权威版本。

客户端渲染权威快照、收集输入并管理本地 UI 临时态。它从不裁定规则。


`SiteCommunityLinks` 在各页面顶部统一展示 GitHub 链接、微信入口和飞书入口。原生模态弹窗管理焦点，每次打开重新加载运行时图片；嵌入对局不展示站点入口。“更新内容”入口在 `/api/whats-new` 返回说明后出现，比本浏览器上次打开的版本更新时显示未读红点。测试见 `wechat-community.spec.ts` 和 `whats-new.spec.ts`。


- 实时旁观沿用普通 Room 链接，通过 `roomSpectated` 确认身份。`WsStatus` 明确记录 viewer，旁观者没有本人玩家或游戏操作控件。`PublicOpeningProgress` 只展示公开开局进度。结束提示保留最后棋盘，适用时提供回放入口，重开不会带走旁观者。覆盖：`live-spectating.spec.ts`、`gameTransport-reconnect.test.ts`；见 ADR 0040。

## 客户端 bundle

收获需求由服务端 `harvestRequirements` 提供。界面测试：`harvest-requirements.spec.ts`。

| Bundle | 入口 | 路径 | 约束 |
|---|---|---|---|
| `client-app` | `client/main.tsx` | `client/{app,components,services,hooks,contexts,utils}/` | 使用 WebSocket。从 `shared/*` 只导入 `contract`、`domain` 与 `i18n`；卡牌展示使用以 manifest 为后端的 `card-meta` 加 `custom-card-metadata`。 |
| `client-sandbox` | `client/sandbox/index.tsx` | `client/sandbox/` | 懒加载的工坊沙盒 UI；试玩在浏览器 `local-sandbox-worker` 中执行。 |
| `workshop-game` | `client/workshop-game/main.ts` | `client/workshop-game/` | 独立对局 iframe；加载语言、卡牌元数据、Auth 或传输层前，只接纳同源顶层工坊的直接子窗口。 |
| `local-sandbox-worker` | `client/local-sandbox/worker.ts` | `client/local-sandbox/` | 工坊试玩的浏览器引擎 Worker；只有其 Worker 侧文件可以导入完整的 `shared/*`，主 bundle 中的 `local-transport`、`persistence` 与 `workshop-launch` 只用类型导入 shared。 |
| `replay-viewer` | `replay-viewer/src/main.tsx` | `replay-viewer/` | 无登录、cookie、WebSocket 或命令；只读取公开 Replay JSON，使用归档时编译的展示过滤。 |

- 精确的入口与文件授权记录在 `scripts/architecture-policy.mjs`；没有目录级的豁免。ESLint `architecture/imports` 与 `pnpm run check:browser-boundaries` 把它们作为 CI 错误执行。
- `scripts/check-bundle-size.ts` 把主 bundle 预算定为原始 1024 KB、gzip 236 KB，工坊 chunk 定为原始 400 KB，作为单独的构建后检查。

## 服务与同步状态

主入口并行加载 App、PageRouter 和所选语言。公开 Game Context 路由位于账号初始化之外。`AuthProvider`、登录和账号恢复不等待 `CardMetadataBoundary`；该边界保护公开百科和已登录应用的同步卡牌查询。测试：`application-loading.spec.ts`、`application-bootstrap.test.ts`、`hosted-password-login.spec.ts`。

`scripts/browser-data.ts` 为主应用与新 Replay 构建提供卡牌身份。加载器在使用前验证以 SHA-256 命名的元数据和语言包。缓存错误或哈希不符时允许一次新请求。构建内嵌语言清单；开发环境元数据会重新验证。品牌素材使用 Vite 内容文件名。测试：card-meta、language-pack、browser-data 及 `BrandMark.test.tsx`。

正式 Pages 的 `/sw.js` 校验公共素材、缓存带哈希的应用壳、提供断网回房重试、读取 IndexedDB 中的离线百科并转交通知点击。`InboxProvider` 在消息通过鉴权并显示后标为已读。[Worker 运维](../HOW_TO_DEPLOY_zh.md#暂停单项-service-worker-功能)

`workshop-game/bootstrap.ts` 只接纳应用 base 下 `workshop-game.html` 的固定 HTTP／浏览器沙盒参数。父窗口必须是同源、顶层且带 `page=workshop` 的主页面；直接打开、嵌套、跨源及意外模式均保持静态。准入后 `initialize.tsx` 只挂载 Locale、Auth 和 `GameContainerApi`；未登录时提供独立打开应用的链接，不渲染账号路由。自托管主 HTML 保留 `frame-ancestors 'none'`，只有独立对局 HTML 允许 `'self'`；Pages 同样执行 JavaScript 准入检查。覆盖：`bootstrap.test.ts`、`workshop-game-entry.spec.ts`、`frontend-hosting.test.ts`。

服务器沙盒保留固定的 `player=p1` 路由。浏览器沙盒省略 `player`，沿用拥有本地配置的登录账号；只有启用开发认证快捷方式的构建中，显式携带 `player=p1&devMode=1` 的工坊父页面才会向子页面传递 `player=p1`。准入检查要求子页面参数与父页面的身份模式一致，不接受任意玩家覆盖。

`application-bootstrap.ts` 在语言/Auth/连接初始化前要求顶层窗口；嵌入页只显示独立打开根地址的链接。`browser-protocol.ts` 在 session 准入前，让 API 与 prerelease runtime bootstrap 共用协议 header 和刷新状态。HTTP 426/`reload_required` 停止后续请求并显示刷新界面；503 保持可重试。WS 使用匹配协议；素材、无凭据 Viewer 和模型请求保持各自运输方式。测试：`application-bootstrap.test.ts`、`browser-api.test.ts`、`App.prerelease-reload.test.tsx`。

- 生产启动保留前端 origin。GitHub Pages 提供 `https://open-agricola.titanxxh.com/`，HTTP 与 WS 使用单独配置的 API origin。两个 HTTPS 子域同站，账号会话继续使用仅属于 API host 的 HttpOnly Cookie。本地偏好和草稿不会自动跨源迁移。见 ADR 0035。
- `build:pages-frontend` 生成根路径生产构建，显式配置 API/WS origin 并写入构建元数据；可选的 `build:hosted-frontend` 保留同源自托管。`hosted-password-login.spec.ts` 在两个 HTTPS 同站子域提供实际 Pages 构建，验证严格 WebKit 与 Chromium 下的登录、浏览器重开和 routed Room 恢复。引擎测试不能替代实体 Safari 验收。

- `services/oauth-onboarding.ts` 在当前标签页的 `sessionStorage` 保存浏览器 verifier 与回调票据，从浏览器历史移除票据 fragment，并在刷新、可修正的表单校验错误后保留凭证。`LoginPage` 在跳转授权前准备 challenge；HTTP 局域网等缺少 Web Crypto 的环境保留 Cookie 导航路径，并在持久缓存恢复的 `pageshow` 事件中重置导航状态；`OnboardingPage` 在成功或凭证终止错误时清理凭证，并提供重新注册入口。站点会话仍使用 HttpOnly Cookie。浏览器测试分别验证 ITP 下的账号创建与 CHIPS 会话能力；Linux WPE 不能替代实体 iPhone 的会话验收。
- `gameTransport.ts`（`WsGameTransport`）在服务层持有 WebSocket。它按标签页记录未确认的命令，隔离旧 socket 回调，重连期间暂停输入，查询回执，等待完整的过滤后快照，并只以原身份重试仍然有效的输入。
- `services/room-creation.ts` 使用新的已认证连接和独立的待确认命令记录创建房间。恢复时沿用原创建身份，收到持久回执和新房快照后才导航；来源重开失败时保留旧结果和完整的配置调整信息。大厅与两处完成入口共用这条链路。
- `card-meta.ts` 加载构建固定身份的卡牌元数据，包含已移植的旧版卡，其卡面显示带 `C` 前缀的编号（[cards](cards_zh.md)）；标准 `public/cards-manifest.json` 仍保留为生成的工具产物。`rehydrate.ts` rehydrate 快照时不导入 `shared/actions` 或卡牌目录。
- `card-encyclopedia.ts` 在首次使用时加载并校验百科文件的哈希，从不在启动时加载；加载失败时下次调用重试（[cards](cards_zh.md)）。
- `client/hooks/useGameSync.ts` 在每次 `stateUpdate` 时整体替换 `state`、`pending`、`interaction` 与 `scores`。没有乐观提交：点击发送命令，游戏 UI 只在快照到达后改变。本地临时态（hover、草稿、输入框）独立存在，新快照到达时清除无效的选择。
- 候场消息提供权威座位颜色与连接状态；`WaitingRoomPlayers` 显示所有座位及空位，断线玩家保留姓名和座位并标为离线。其选色器提供六种颜色，禁用其他玩家已占用的颜色，并等待服务端发布保存后的选择。
- 重连执行 `joinRoom` → `roomJoined(status, …)`：`waiting` 恢复等待页，只有 `playing` 才继续 `getState`；`newGame` 之后的 `roomWaiting` 广播会隐藏旧版图。
- 客户端按 `occurrenceId` 消费公开事件，用于临时通知、高亮与动画；首个快照初始化游标，不重放历史。Action Log 把 `publicEventArchive` 当作只读时间线读取。
- 玩家名通过 `client/utils/player-name.ts` 按生成名来源与座位号本地化；玩家提供的名字原样显示。
- `llm/registry.ts` 是设置界面直接读取的 provider 列表、名称与密钥提示来源。翻译使用通用文本流，provider 只为图片生成提供覆盖实现。
- `llm/generation/`：浏览器持有生成尝试、provider 工具协议与固定到一个 main SHA 的有界 GitHub 读取。LLM 凭据只发给配置的 provider。`server/workshop-references.ts` 用项目凭据提供已认证的仓库树 metadata，不接受调用方 URL 或模型凭据；浏览器匿名拉取固定版本的原文并校验 blob hash。`GET /api/workshop/sandbox-contract` 标识一次尝试及其校验所绑定的部署源码，不列出能力清单。`POST /api/workshop/cards/validate-code` 把校验绑定到源码与沙盒身份，现有 provider/model 选择不再受硬编码准入限制。四个工具负责查资料、读资料、写产物和浏览器测试，由模型决定修复；采用需要匹配的静态校验与浏览器测试报告。`local-sandbox/card-tests.ts` 管理 opaque iframe、新 Worker 及实际独立 Worker 产物的字节 hash，引擎导入仍只允许在精确 Worker 入口内。见 [Platform design](../PLATFORM_DESIGN.md) 与 [`docs/test/llm-card-gen.md`](../test/llm-card-gen.md)。

## 视图与本地沙盒

### 牌面行动引用

目标身份与静态预览的归属见 [ADR 0038](../adr/0038-printed-action-references-use-explicit-targets.md)。

卡牌描述与补充规则区分行动格、沼泽特殊行动的引用，以及普通规则动作和卡名。引用使用下划线替代斜体，打开静态行动预览。预览按适用人数展示印刷内容与当前语言说明，不包含实时累积资源、人员占用或可用性。没有对局上下文时展示相关版本；引用多个目标时一起展示这些目标。

所有完整卡面共用此行为，包括手牌、已打出牌、放大详情、轮抽、图鉴和回放。日志、按钮中单独出现的名称不在本次范围内。鼠标悬停、键盘聚焦与触屏轻点打开预览，点外部关闭；操作引用不得选择或打出所在卡牌。

多个目标与人数版本在同一个可滚动浮层中分项展示，并标明名称与适用人数。尚未揭示的轮次行动格仅展示公开的印刷内容，不透露本局揭示顺序。图片缺失时仍展示名称、人数和当前语言规则。无效引用目标由官方内容构建检查拦截，工坊预览向作者报错。

引用目标按英文原文含义确定，独立于译文名称。普通规则动作不会因为与行动格同名而成为行动格引用。BGA 的 `__文字__` 标记表达强调，仅凭该标记不能确定引用目标。官方文字明确记录引用目标；工坊作者可使用同一机制，未标记文字保留现有展示。 `CardDescriptionText` 启用 `ResourceText` 的引用交互，普通资源文字只显示引用名称。`ActionTextReference` 使用原生 popover；位于弹窗中时，浮层也挂在该弹窗内。`GameContainerApi` 与 `ReplayBoard` 提供人数上下文。`scripts/build-action-references.ts` 在目录构建时投影印刷规则并校验官方引用目标；`client/services/action-references.ts` 在首次查看时加载该静态文件。测试见 `card-action-references.spec.ts`、`ActionTextReference.test.tsx` 与 `build-action-references.test.ts`。

### 现有视图

- 交换中心共用普通兑换、喂养、供暖和待安置动物烹饪的配方控件。配方滚动区域根据 `InteractionBar` 高度保持确认可达。待安置动物烹饪提交草稿，恢复重整时保留有效分配。 `exchange-overlay-presentation.tsx` 与 `exchange-draft-presentation.ts` 还负责燃料和生病的预览。覆盖见 `heating-exchange.spec.ts`、`listener-lifecycle-room.spec.ts`、`issue-893-rules.spec.ts`。 [ADR 0048](../adr/0048-cook-reserve-animals-during-reorganization.md)

- `interaction-presentation.ts` 为批量 trade/cancel 请求选择兑换面板，包括只剩取消的请求。草稿遵循该计划；其他选择和明确声明的零分在恢复后保持可见。覆盖见 `exchange-choice-routing.spec.ts`。

- `interaction-focus.ts` 将本机 Interaction Player 的权威请求映射到显示目标。职业选择在接机确认后定位私有手牌，支付等后续步骤保留行动聚焦，完成后返回行动区。Session 交互适配器仅向响应者发布不透明的等待步骤 `requestKey`，候选刷新及 cursor 恢复均保留其身份，玩家手动浏览不会再次触发滚动。共享目标锚点与返回快捷入口覆盖手牌、供应区和农场选择。
- `SectionNav` 仅滚动到已经渲染的分区锚点，不改变 Farm View Player、私有信息可见性或 Interaction Focus。其实测高度为页面底部留白，并与固定操作栏一起计入农场缩放及交互滚动的可用视口。窄屏时按钮换行而非横向滚动，并让出报告问题按钮自行发布的占位宽度。覆盖见 `section-navigation.spec.ts` 和 section-nav 组件测试。
- 农场选择、空间目标选择、动物整理及本机选中的 Moor 地形操作使用农场目标。格盘根据有效视口和固定控件调整尺寸，也支持扩展农场。围栏控件扩大命中范围，并以收窄端点区分相邻边。同一步的重复快照保留草稿，只移除撤回的合法目标。`fence-selection-quote.ts` 显示权威选择费用，在快照、请求或草稿改变后丢弃旧回复；费用查询不决定是否允许提交。验收见 `farm-interaction-focus.spec.ts` 及聚焦、农场草稿和费用组件测试。

- `ActionSpaceDescription.tsx` 渲染 `baseDescriptionPreview`，`ActionDescription.tsx` 渲染悬停说明和选项。食客标记显示所属玩家和来源卡，回合格显示预定的食客。派遣沿用放置高亮并显示来源卡。`ReplayBoard` 共用标记、数量和基于存档的行动日志，含撤销记录。测试见 `classic-guest.spec.ts` 与 `ReplayBoard.test.tsx`。
- `client/app/GameContainerApi.tsx`（含 `useTransportSetup`）、`LobbyPage.tsx` 与 `PageRouter.tsx` 编排视图，并根据 `viewPlayerId` 与 `playerIndex` 推导可交互性。
- `FarmBoardView.visiblePlayerIds` 决定可读手牌，独立于控制权限和 Interaction Player。手牌提交（含职业多选）只允许当前显示且拥有权限的响应座位。热座只使用已确认接机者。重复快照保留浏览和本地勾选。覆盖见 `GameContainerApi.hotseat.test.tsx`、`FarmBoard.test.tsx` 和 `hotseat-public-farms.spec.ts`。
- `DraftOverlay` 与 `PublicOpeningProgress` 共用个人数量及选牌中／等牌／完成状态。本地勾选绑定显示时的选择机会，其他人提交不清除勾选，换包才清除。实时 envelope 的座位在线信息独立于轮抽状态；离开大厅后仍消费加入和断开事件。热座从最后一次手选者之后轮转，跳过无牌座位并保留私密接机确认。覆盖：`DraftOverlay.render.test.tsx`、`gameTransport-reconnect.test.ts`、`draft-opening-order.spec.ts`。
- 轮抽与父母卡选择阶段在独立滚动的选卡区域上方保留 `GameHeader`。内嵌模式保留语言切换。测试见 `setup-navigation.spec.ts`。
- 协商结束与再来一局（`GameEndControls`）在轮抽、父母卡选择、单人手牌、热座交接和普通对局中都放在 `GameHeader` 的菜单里。有待处理提议时，菜单按钮显示标记并打开菜单。覆盖见 `game-end.spec.ts`。
- `RoomInvitePicker.tsx` 在输入两个字符后搜索用户名或显示名前缀，支持点击与键盘选择，等待输入法组字结束，并丢弃已取消请求的响应。已选玩家显示为带用户名、可移除的名字标签，账号 ID 只用于创建请求。服务端确认 Room 后从 URL 移除创建选项，所有准入决定仍由服务端执行。覆盖：`RoomInvitePicker.test.tsx`、`room-invitations.spec.ts`。
- `MyActiveGames.tsx` 通过参与者名字和颜色识别对局，显示扩展图标、游戏回合或开局阶段、本地时区的创建或开局时间，以及服务端给出的等待玩家。当前有牌可选的轮抽玩家沿用普通游戏当前行动玩家的颜色标记描边。继续游戏使用 Room ID，但不展示该 ID。覆盖：`LobbyPage.test.tsx`、`room-invitations.spec.ts`、`lobby-active-games.spec.ts`、`draft-opening-order.spec.ts`。
- 构建开关控制大厅和工坊的卡牌版本选择。旧版牌组的张数按清单和当前人数计算。房间标签使用服务端投影的卡牌版本。
- `app/use-turn-tab-title.ts` 提醒大厅 Waiting Seat。普通进行中只提醒自有的待回应者：等待中的 Interaction Player，否则是工作轮转玩家。轮抽、父母选择和热座保持原样。顶栏、标签、农场标记和总览使用同一待回应者，不改轮转或 takeAction。大厅座位仍是栈顶帧主人。覆盖：`responding-player-markers.test.tsx`、`lobby-active-games.spec.ts`、`ws-dual-player.spec.ts`、`lobby-my-rooms.test.ts`。
- `app/solo/SoloHandOverlay.tsx` 按权威候选分组收集一次本地选择并原子提交。重复快照和语言切换保留可编辑勾选；刷新恢复候选并清空未确认勾选。Moor 准备和保留继续使用 `InteractionBar` 原生选择；`SpecialActionsPanel` 读取公开当前牌、弃牌及 `soloSupply` 投影。覆盖见 `standard-solo-ui.spec.ts` 与单人组件测试。
- 对局布局共用玩家总览与只读公开农场。两处食客计数均读取 `playerPanelSummary.guests.pending`。窄屏把总览放在最前、默认展开的 Action Log 放在最后，详细计分按需打开。`ActionBoard.actionSpaceOutlets` 把原有行动格视图放入扩展面板，复用可用性与工人标记。布局覆盖见 `mobile-table-layout.spec.ts`、`mobile-game-layout.spec.ts` 与 `desktop-table-layout.spec.ts`。
- 不支持容器单位或 CSS 长度除法的浏览器通过 `useElementWidth` 与 `ResizeObserver` 测量卡牌和农场容器，提供卡牌缩放比例与农场宽度；支持这些特性的浏览器继续使用 CSS 容器尺寸。旧浏览器尺寸、横竖屏切换与农场输入由 `touch-card-play.spec.ts` 覆盖。
- `common/CardWithCopy.tsx` 负责触屏查看详情和绑定当前请求的出牌确认。`CardDetails.tsx` 使用模态对话框，内容独立滚动，关闭与打出按钮持续可见。`useCardPlayChoice` 防止手牌或供应区重复提交，跟随传输结果解除失败请求的提交锁；提交权限取自当前权威选项与本机座位。提交锁与详情权限使用 `useRequestActivation`：重复快照保留当前激活阶段，离开请求后即使恢复同一标识，也建立新的激活阶段；迟到结果仅影响所属阶段。职业多选保留整组确认。覆盖见 `PlayerCard.touch.test.tsx`、`touch-card-play.spec.ts` 与 `card-play-undo.spec.ts`。
- `improvement-selection.ts` 将当前可用请求选项与应答玩家手牌、主要改良供应区求交。发展请求有小发展候选时聚焦手牌，仅主要改良合法时展开并聚焦供应区，两者皆无候选时聚焦操作控件。`PlayerFarmPanel.improvementSupply` 将唯一供应区视图放在手牌旁；`GameContainerApi` 持有绑定请求标识的展开状态，重复快照及响应式手牌挂载位置变化都保留该状态。覆盖见 `GameContainerApi.presentation.test.tsx`、`MajorImprovements.test.tsx` 与 `improvement-focus.spec.ts`。
- `FarmBoard` 在格盘旁显示当前 Card Field 与牌上动物控件。`farm-board-projection.ts` 保留权威槽位 metadata；托盘与按时序排列的牌面共用草稿回调及动物区域 ID，包含借用的牌上区域。多个不透明选项继续使用既有目标选项器。统一农场聚焦区域包含格盘与托盘，短屏横屏时并排显示在固定操作栏上方。公开浏览不展示交互玩家草稿或可操作托盘。覆盖见 `farm-card-slots-session.test.ts`、`FarmBoard.test.tsx`、`GameContainerApi.presentation.test.tsx` 与 `farm-card-targets.spec.ts`。
- 工坊试玩只在浏览器中运行（ADR 0052）：`LocalGameTransport` 在禁止联网的 opaque iframe 内的 Worker 中运行 `GameCore`（`opaque-worker.ts`），IndexedDB 持久化留在页面一侧。每次启动都有 `instanceId`；游戏 iframe 向工坊发送 `LOCAL_SANDBOX_STATUS`，试玩确认绑定到这次启动。十秒超时会从最后一份快照恢复，且该超时会持续报告。启动成功后保存首份快照；启动被拒时保留原有存档；schema 不匹配时清除存档。覆盖见 `workshop-launch.test.ts`、`local-sandbox.spec.ts`。
- `AuthContext` 是站点登录会话（密码、GitHub 或 Google），不保存 Issue 写入授权；`LocaleContext` 切换语言。

### 预发布入口

`PrereleaseBoundary` 守住 Context/私有资料，`AuthContext` 订阅同一已验证身份，不再独立复取。已发布语言 pin 和横幅在重新加载时仍展示环境/构建及正式返回入口；受限页保留站内导航，不提供账号管理。HTTP/WS/worker 绑定标签的构建/代次和绝对期限；替换 Cookie 不能恢复旧标签。复核串行执行，单调 lease 包含请求耗时。退出在网络完成前终止准入。已确认的认证/访问/交接/运行时代次拒绝要求新文档；迟到回复不能恢复它。暂停允许复核。回调先清除 fragment；重试只在内存保留同一绑定兑换。

`app/PrereleaseEntry.tsx` 是大厅/设置页头图标行的 Beta 徽标，使用 Beta 资格和实时权威状态。只以 `noopener noreferrer` 打开配置的 HTTPS 入口；缺少配置则不可用。窗口聚焦复核丢弃早于拒绝的响应。

`PrereleaseHandoffPage` 和 `services/prerelease.ts` 清除绑定 fragment，校验配置的目标/正式根，只请求一个短期 code。仅固定回调接收 fragment；不持久化凭据/verifier，不跟随调用者回调，错误返回正式根。浏览器仅验证时间戳格式/目标；兑换过期由正式权威时钟裁决。

覆盖：`PrereleaseEntry.test.tsx`、`PrereleaseHandoffPage.test.tsx`、`services/__tests__/prerelease.test.ts`（时钟偏差/错误响应）及 HTTPS `hosted-password-login.spec.ts`。

### 卡牌百科

- **公开路由。** `PageRouter` 在等待登录状态和登录拦截之前，通过懒加载的 `EncyclopediaPage` chunk 提供 `?page=encyclopedia[&entry=<key>]`。普通页面不加载它的 chunk、数据或卡图。复制的链接只带 `page` 与 `entry`，不带房间、座位、手牌或对局参数。浏览状态按标签页保存，任一页面刷新后重新开始；`client/main.tsx` 在首次渲染前清除它。覆盖见 `encyclopedia*.spec.ts`；`encyclopedia-pages.spec.ts` 针对静态 Pages 产物运行。
- **局内面板。** `GameHeader` 打开模态的 `InGameEncyclopedia`。它从不写 URL，也不发送游戏命令；本地草稿留在容器中，按普通快照规则处理。`encyclopedia-attention.ts` 对每个新输入窗口只提醒一次，重连页重新挂载面板后同样如此。热座接机身份变化会关闭面板，交接页不提供入口。覆盖见 `GameContainerApi.encyclopedia.test.tsx` 与 `encyclopedia-in-game.spec.ts`。
- **牌面。** `EncyclopediaFace` 用游戏自身的组件和 `shared/projections/` 绘制目录中的每种牌面，任一卡图失败时改用 `EncyclopediaTextFace`。某语言仍显示英文的文字，在出现的每处都加标注。扫描卡里职业、次要改良和主要改良沿用 `PlayerCard`，其余印刷版式各自用单独的框体模板（[扫描卡牌面](scan-cards.md)，仅英文）。覆盖见 `encyclopedia-faces.spec.ts` 与 `client/app/encyclopedia/__tests__/`。

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

- `game-room-url.ts` 生成的普通对局链接只需 `room`；连接方式和座位来自 Room 与登录账号。仅显式开发房间或上下文链接保留座位控制；普通建房跟随登录账号获分配的座位。
- `?room=<roomId>` 在卡牌 manifest 与登录门之前解析；未登录的活动上下文保留完整的 `returnTo`，非活动上下文不加载认证依赖。
- 上下文解析器在挂载、导航或生命周期变化事件发生时读取查询参数。WebSocket 静默更新房间 URL 后，切换语言不会重启活动对局。测试见 `GameContextRouter.test.tsx` 与 `setup-navigation.spec.ts`。
- 房间链接通过 WebSocket 加入，不指定客户端座位；服务端恢复账号已有座位，或让新玩家加入候场空位。保存暂停期间，所有在线座位看到同一状态，新命令控件被禁用。
- `ReplayShell` 校验 Replay header 与内容寻址的 Viewer manifest，并且只在选定视角后创建 `credentialless`、`sandbox="allow-scripts"` 的 iframe。策略版本查询参数绕过使用旧 CSP 缓存的入口 HTML。历史 Viewer 从不调用需认证的 API；保留的证据通过 `postMessage` 传入。
- 完成的单人 Game Context 在历史 Viewer 外保留公开分数和私下校验本人资格的再开入口。即时 `ScoringPad` 注入同一再开组件；私有配置读取或 Viewer 失败均不隐藏公开结果。完成的多人局不提供按原配置再开。`CompletedContext` 在摘要与 `ReplayShell` 之间分配同一个视口，让重开操作下方的回放控件保持可达。
- 损坏的 Segment 标记为不可用区间，并从下一个 checkpoint 继续；从不静默修复。
- Bug Report 在 GitHub OAuth 之前保存服务端草稿，取消授权后回到同一个 `submissionId`，提交后轮询状态；提交响应丢失时重新读取权威状态，因此报告不会重复创建。活动局的报告者锚定最新已提交的 Step；完成局的报告者必须是原参与者，锚定当前显示的 Step。
- Bug Report 诊断由 `services/bug-report-diagnostics.ts` 识别浏览器和设备，并在标签页存储中保留当前 Room 最近一小时最多五次 WebSocket 关闭记录。`WsGameTransport` 只记录当前连接的关闭，排除主动销毁。创建、编辑草稿及最终确认作者时附带最新的有界诊断快照；刷新后仍可读取，不包含原始 User-Agent。测试见 `bug-report-diagnostics.test.ts` 和 `bug-report.spec.ts`。
- Issue Submission Connection 独立于 `AuthContext`：报告页脚负责首次连接，设置页只显示状态和断开，连接失效时从不切换到 Hosted Issue Identity。
- 大厅和对局菜单的 `InboxButton` 读取鉴权持久反馈。模态框保留 Room interaction，只将打开的消息标记已读；焦点及消息变化刷新已加载页范围和未读状态。切换账号重新挂载，credentialless Replay Viewer 不挂载。结论保留修订历史及待补充信息的条目、账号指引。上线消息展示不可改写的首次核验，单独投影后续核验及相关报告。`BugReportFeedbackSettings`、`BugReportFixSettings` 登记结论、显式重复及完整合入修复，展示上线进度但不接受部署证明。共用解析器 `services/bug-report-feedback.ts`；测试：`bug-report-feedback.test.ts` 和 `bug-report-{feedback,fix-links,release-feedback}.spec.ts`。

## Beta 资格与客户端传输

`AuthContext` 消费服务端账号状态 `betaAccess` 和 `isAdmin`，密码登录或重置密码后重读 `/api/auth/me`。设置页展示当前资格及管理员 `BetaAccessSettings` 授予控件。账号搜索包含未验证邮箱的账号，排除待删除账号。撤销后预发布访问在 30 秒内停止，已保存的对局及其他状态继续保留。测试：`BetaAccessSettings.test.tsx`、`SettingsPage.test.tsx`、`beta-access-admin.spec.ts`。

`WsGameTransport` 在每个新 socket 声明能力，`HttpGameTransport` 发送请求 header。要求刷新时沿用可读 reload 界面，并在停止重试前结算未完成的持久 receipt。认证和 journal 的命令身份保持独立。见[客户端能力](contract.md#client-capabilities)。
