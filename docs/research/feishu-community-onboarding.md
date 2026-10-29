# 飞书免费玩家群与消息采集机器人的接入步骤

检查日期：2026-10-29。对应决策票：[飞书免费外部群与采集机器人：开通、进群及消息能力边界](https://github.com/titanxxh/open-agricola/issues/1456)。本文是官方资料调研，没有创建真实组织、群或机器人，没有使用真实凭据调用接口。Codex 认证与分析命令见 [Codex 订阅分析研究](feishu-codex-subscription-analysis.md)。

## 建议主线与能确认的范围

首版采用“免费组织 + 普通对话外部群 + 企业自建应用机器人 + 本机长连接采集”，先采集文本，再把整理好的消息快照交给本地 Codex。应用机器人可以订阅群消息；群设置里直接创建的 Webhook 自定义机器人主要用于推送，不能代替这条读取链路。[机器人能力比较](https://open.feishu.cn/document/client-docs/bot-v3/bot-overview)

公开资料支持这条接入路线，但不能据此宣称真实账号已可用。当前账号能否完成实名认证、是否得到全量群消息权限、历史和附件实际可读范围，都需要后面的真实验收。模型费用不属于飞书免费版权益，本文也不把飞书 AI/Aily 当作免费分析后端。

这里的“创建企业”是创建飞书组织空间；“飞书认证”是组织资质认证；“个人实名认证”是开通对外共享的另一种身份验证。三者不能互相代替。官方自建应用流程要求先成为企业用户，注册或加入组织即可，不要求先购买商业版。[自建应用流程](https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process)

## 第一步：创建免费组织和玩家外部群

以下界面步骤由用户操作，研究阶段不代为注册或邀请真人。

1. 安装并打开飞书中国版，用 `+86` 手机号注册，选择负责人角色，填写自己的姓名和组织名称 `Open Agricola`。官方注册说明把注册视为创建组织；如果已有自己管理的组织，可以复用。若目前只使用别人的组织，可从头像的“登录更多账号”进入新建账号流程。[注册账号](https://www.feishu.cn/hc/zh-CN/articles/360045688853-注册账号)、[登录更多账号](https://www.feishu.cn/hc/zh-CN/articles/259637325656-在飞书中登录更多账号)
2. 新建组织默认使用基础免费版。邀请组织成员的步骤可先跳过，社群玩家随后加入的是外部群，不是员工通讯录。[创建组织说明](https://www.feishu.cn/hc/zh-CN/articles/985882202335-第一步-创建企业与邀请成员)
3. 先添加一位组织外的飞书用户为联系人。在消息页头像旁点击“创建 → 创建群组”，群模式选择“对话”，群名填写“Open Agricola 玩家交流群”，从“外部联系人”中选择该联系人并创建。成员包含外部用户时，群自动成为外部群；检查群名旁出现“外部”标签。[创建群组](https://www.feishu.cn/hc/zh-CN/articles/360025113754-创建群组)、[群类型说明](https://www.feishu.cn/hc/zh-CN/articles/552185547397-消息群组类型说明)
4. 从群聊右上角“··· → 设置 → 分享群名片”进入“群链接”和“群二维码”，分别把有效期改成“永久”，再复制链接、保存二维码。默认有效期为 7 天，也可选 1 年。网站同时提供链接和图片；不要误用注册时的企业邀请二维码。未注册的玩家仍需下载、注册飞书后才能入群。[分享群组](https://www.feishu.cn/hc/zh-CN/articles/360025299393-分享群组)
5. 用组织外账号分别测试链接和二维码，确认进入的是玩家外部群，且没有要求加入 Open Agricola 组织。记录实际群容量和生效的分享权限，再公开入口。

容量需要提前核对：检查当天《创建群组》的基础免费版版本表列出认证前 50 人、认证后 500 人。这里不能推导“做个人实名认证就获得 500 人”：机器人对外共享与组织认证扩容是不同权益。若需要超过当前群上限，应先查组织实际权益，而不是把玩家全部邀请成组织成员。[群容量版本表](https://www.feishu.cn/hc/zh-CN/articles/360025113754-创建群组)

## 第二步：创建能读取消息的应用机器人

1. 用 Open Agricola 组织身份登录[飞书开发者后台](https://open.feishu.cn/app)，创建“企业自建应用”，例如命名为“Open Agricola 反馈收集”。进入“添加应用能力”，添加“机器人”。这是组织管理员审核的自建应用，不需要提交应用商店。[自建应用开发流程](https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process)
2. 在“凭证与基础信息”获取 `App ID` 和 `App Secret`，保存到本机采集服务的私有配置。后续运行由该应用建立连接；不让每位群成员提供个人令牌，也不把应用密钥交给分析模型。
3. 在“权限管理”配置下表所需的应用身份权限。首版只读，不因为示例教程勾选了全部权限就照搬。

| 用途 | 权限 | 首版建议 |
|---|---|---|
| 接收群内用户普通消息，包括未 @ 机器人的消息 | `im:message.group_msg` | 必需；只接收 @ 消息的权限不足以汇总日常群聊 |
| 获取历史消息、按消息 ID 查内容 | `im:message:readonly` | 为补拉开启，并与上一项一起使用 |
| 查询群信息，辅助核对 `chat_id` | `im:chat:read` | 可选；收到消息事件时已有 `chat_id` |
| 机器人向群发日报或回复 | `im:message:send_as_bot` | 只有用户选择发群时再开启；本地报告不需要 |
| 私聊机器人 | `im:message.p2p_msg:readonly` | 只有确认需要私聊入口时再开启 |

全量消息权限按官方定义覆盖用户消息；其他机器人消息需要不同权限，首版无需采集。获取历史群消息则同时需要接口只读权限和全量群消息权限。不要使用已下线的 `im:message.group_at_msg` 等旧权限或旧版消息 API。[接收消息权限](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive)、[获取会话历史消息](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list)、[外部群权限列表](https://open.feishu.cn/document/develop-robots/add-bot-to-external-group)

## 第三步：开启对外共享、订阅事件并发布

配置的先后关系如下，不能在后台仅保存权限后就当作已经生效。

1. 准备使用官方 SDK 的本机采集客户端，以应用凭据建立长连接。官方提供 Go、Python、Java、Node.js 示例。机器只需能访问公网，无需公网入站 IP、域名或内网穿透。[长连接步骤](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)
2. 在应用的“事件与回调 → 事件配置”中选择“使用长连接接收事件”并保存。保存时必须已有客户端在线。添加“消息与群组 → 接收消息 v2.0”，程序注册的事件类型是 `im.message.receive_v1`；界面版本名和事件标识不同，不要误订阅旧事件。[长连接设置](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)、[接收消息事件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive)
3. 进入“应用发布 → 版本管理与发布 → 创建版本”。在“对外共享”中启用“允许机器人被添加到外部群中使用”。首版只采集群聊时，不必同时启用外部私聊入口。[对外共享步骤](https://open.feishu.cn/document/develop-robots/add-bot-to-external-group)
4. 若共享开关不可用，按提示完成企业/团队认证，或使用文档明确支持的个人实名认证路径。个人实名仅在中国大陆地区支持，可按开发者后台生成的二维码在手机端完成人脸或银行卡认证；这一步必须由本人完成。官方组织认证说明目前写明认证暂不额外收费，但不能因此声称所有组织都符合团队认证资格。[个人实名和共享条件](https://open.feishu.cn/document/develop-robots/add-bot-to-external-group)、[组织认证适用对象与费用说明](https://www.feishu.cn/hc/zh-CN/articles/360034114413-飞书认证介绍)
5. 在版本“可用范围”中至少包含准备把机器人加进群的组织内操作者。仅应用所有者和管理员有发布入口；可用范围的禁用项也需要核对。不要为了让外部玩家入群，把组织可用范围改成未知的“所有外部用户”。[配置可用范围](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/availability)
6. 填版本号和说明，保存并申请线上发布。组织管理员在管理后台“工作台 → 应用审核”同意。自己既是开发者又是管理员时，由自己完成两边操作；不要假设默认免审。以后修改应用能力、权限或事件订阅，也需要按官方流程发布使配置生效。[发布与审核](https://open.feishu.cn/document/home/intro-to-custom-app-review)

这里的“发布应用”是飞书后台配置发布，不是发布 Open Agricola 游戏版本，也不是购买飞书商业版。建议采集与模型分析分开：事件处理只负责快速保存/入队并返回，不能在回调里等待 Codex。官方长连接要求处理函数在 3 秒内完成且不抛异常；超时会重试。[事件处理约束](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)

## 第四步：把机器人加到外部群并验证接收

1. 使用应用所属组织内、且在应用可用范围内的账号，进入玩家外部群。跨组织玩家不能代替这个操作者添加共享应用机器人；客户端需支持外部群机器人，官方最低版本为 V7.19。[外部群添加条件](https://open.feishu.cn/document/develop-robots/add-bot-to-external-group)
2. 群右上角“··· → 设置 → 群机器人 → 添加机器人”，搜索刚发布的应用机器人并添加。不要点击“自定义机器人”重新创建一个仅有 Webhook 地址的推送机器人。[群内添加步骤](https://www.feishu.cn/hc/zh-CN/articles/360024984973-在群组中使用机器人)
3. 由测试成员发一条普通文本和一条 @ 文本，确认本机都收到 `im.message.receive_v1`，记录 `message_id`、`chat_id`、发送时间、发送者 `open_id`、消息类型和文本。只看到 @ 文本通常意味着权限/发布状态不完整；只看到客户端“机器人已加入”不足以证明消息采集成功。[消息事件字段和权限](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive)
4. 用事件中的 `chat_id` 配置采集允许名单；程序拒绝保存其他群的数据。用源消息 `message_id` 去重，不依赖 `event_id` 作为聊天记录的唯一键。官方消息事件特别提醒可能重复推送。[消息去重说明](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/events/receive)

若完全收不到事件，按顺序检查组织身份、应用发布版本、机器人能力、对外共享、实际在群状态、全量权限、事件订阅、长连接在线情况及群的对外沟通限制。飞书后台能查询 API 和事件推送日志，但不要把包含真实聊天正文的日志公开贴到 Issue。[应用运维入口](https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process)

## 历史补拉与离线恢复

应用身份使用 `tenant_access_token`，不使用外部用户的 `user_access_token`。对外共享应用不能取得外部用户身份，历史接口也不支持这类应用以用户身份调用。[外部身份限制](https://open.feishu.cn/document/develop-robots/add-bot-to-external-group)、[历史接口限制](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list)

按下面接口形态进行有界补拉。以下只是文档中的参数范式，本次没有发送请求：

```text
GET /open-apis/im/v1/messages
  container_id_type=chat
  container_id=<已核对的 chat_id>
  start_time=<本次补拉起点，秒>
  end_time=<启动补拉时固定的终点，秒>
  sort_type=ByCreateTimeAsc
  page_size=50
  page_token=<下一页标记，首次省略>
```

- 机器人必须仍在群内。分页默认 20、最大 50；循环到 `has_more=false`，不要把一页当全量。分页途中保持排序一致。请求的时间是秒，返回消息时间是毫秒，需明确转换。[历史接口参数](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list)
- 普通对话群中的话题回复不会全部出现在 `chat` 容器结果里；需要发现 `thread_id` 后再用 `container_id_type=thread` 分页。该模式暂不支持按起止时间过滤。首版即使选普通对话群，也不能忽略玩家后来使用的话题回复。[话题补拉边界](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list)
- 关闭“新成员可查看历史消息”、消息撤回删除、群保密/防泄密设置等会限制实际读取。接口错误表包含话题不可见、消息已删除和保密模式不支持等情况。公开页面不能证明“机器人可读入群前所有消息”或“免费历史永久保存”，这些必须用目标账号和群设置验证。[历史接口错误表](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list)
- 事件机制是至少一次交付，失败最多重试 4 次，并非无限离线消息队列。多个长连接客户端是随机分发而非广播，因此不要让调试进程和正式采集进程同时竞争同一应用的连接。[事件重试机制](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview)、[连接分发方式](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)

方案建议：先建立持续采集，再补拉固定时间窗口，按 `message_id` 合并；重启时从上次完成的补拉窗口稍向前重叠，分页和落盘全部完成后再推进检查点。模型分析使用不可变快照，不直接读取仍在追加的日志。不能恢复的窗口标记“消息可能缺失”，不得输出“完整群聊总结”。这部分是采集器设计建议，不是飞书提供的完整性保证。

## 人工首次试验可以先用官方 CLI

飞书团队已开源 [`larksuite/cli`](https://github.com/larksuite/cli)，官方介绍的安装入口是 `npx @larksuite/cli@latest install`，可以对接 Codex 等 Agent，也支持查询消息历史、话题与资源。因此首次人工试验可以先用 CLI 读取已授权群的一小段历史，核对后导出给 Codex，而不必先实现常驻采集器。持续收集新消息仍按前面的 SDK 长连接路线设计。[官方 CLI 介绍](https://open.feishu.cn/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu)

本次没有安装或执行该 CLI。实施时先记录版本，通过 `lark-cli help`、具体命令的 `--help` 和 `schema` 确认历史读取命令、分页参数及应用身份选项；若快捷命令仅支持用户身份，应选择支持应用身份的 API 命令或 SDK，不能直接套用个人消息读取示例。官方历史 API 对已开启对外共享的应用以用户身份请求返回 `231204`；这里需要机器人所在应用的 `tenant_access_token`，不是运行 `auth login` 给外部用户补个人授权就能解决。[CLI 帮助与身份说明](https://open.feishu.cn/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu)、[历史接口身份限制](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/list)

## 免费额度与附件的实际边界

### 额度

飞书当前公开配额说明存在时间混杂：顶部仍写“2026 年 6 月限时 100 万次”，历史生效条款写每组织所有自建应用合计 10,000 次/月；到本次 10 月调研，不能把活动数当长期权益，也不能仅凭该页证明目标账号本月一定是 1 万。实施前由管理员在“费用中心 → 权益数据”读取当前总额和剩余额度，记录日期。[配额原文](https://open.feishu.cn/document/platform-notices/platform-updates-/custom-app-api-call-limit)

同一说明把认证授权和事件订阅等业务列为不计量项；消息历史查询、资源获取等需按 API 列表的“计入收费用量”核对。不能把每条事件都算成一次历史 API 调用，也不能认为接收事件免费就意味着补拉、下载或发消息无限制。额外的接口速率限制仍有效。额度耗尽返回 `429` 和 `99991403`，免费方案应停下或等待恢复，不自动升级。[不计量范围和超额行为](https://open.feishu.cn/document/platform-notices/platform-updates-/custom-app-api-call-limit)

保守容量估算可以先按 1 万次/月设计，采用实时事件、有限补拉、按需获取上下文与每日一批模型分析；这只是预算建议，验收仍以账号显示为准。

### 图片、语音和附件

消息事件可以带回类型与资源标识，事件到达不等于文件内容已到本机。[消息内容格式](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/im-v1/message/events/message_content)

官方“获取消息中的资源文件”接口要求机器人与消息在同一会话；错误表还保留 `234009`“暂不支持在外部群中进行本操作”，以及保密资源、历史不可见、不支持消息类型等错误。虽然共享应用页面允许若干资源和消息权限，单凭这些权限不能断言所有外部群附件都可下载，也不能凭一条错误码断言全部外部群资源都不支持。需在目标外部群分别测试普通图片、文件和截图消息。[资源下载接口](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message-resource/get)

首版只承诺文本链路。读取不到的截图或附件在报告里保留消息来源和“未读取附件”标记，不把空正文当作无需求，也不自动调用收费 OCR/语音服务。若用户后续需要媒体分析，再扩展权限和验收。

## 最小验收与需要人完成的步骤

| 检查 | 必须看到的证据 |
|---|---|
| 免费组织与群入口 | 后台版本/额度；组织外账号能通过永久链接、二维码加入玩家群 |
| 对外共享生效 | 应用已发布，操作者在可用范围内，机器人确实出现在外部群成员中 |
| 普通文本与 @ 文本 | 两种消息都落到本地，来源群、消息 ID 和时间正确 |
| 范围与重复 | 未授权群不落盘；重推同一消息不新增重复记录 |
| 重启与分页 | 采集进程离线后有界补拉恢复测试窗口；超过一页的消息全部覆盖 |
| 话题与不可见历史 | 话题回复单独补拉；不可见范围明确报告，未伪称完整 |
| 媒体 | 图片、文件实测结果单列；失败时保留缺失标记而非生成图片内容摘要 |
| 消息采集与 Codex 隔离 | 采集回调不等待模型；导出的只读消息快照可以独立交给分析步骤 |

用户必须亲自完成手机号验证、个人/组织认证、应用管理员审核，以及允许真实群的测试消息。研究阶段没有执行这些步骤。仍待目标账号核实：当前免费群容量和历史保留权益、个人实名后的共享开关、敏感权限审批结果、普通外部群文本事件、入群前历史可见性、附件接口及当月 API 实际配额。

这些实测结果不影响“官方存在免费基础接入路径”的研究结论，但会决定最终能承诺的规模和消息覆盖范围。不要把后台勾选成功或 SDK 显示连接成功替代端到端验收。
