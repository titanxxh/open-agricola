# How to Deploy Open Agricola

[English](HOW_TO_DEPLOY.md) | [中文](HOW_TO_DEPLOY_zh.md)

> 本文件是中文翻译镜像；[HOW_TO_DEPLOY.md](HOW_TO_DEPLOY.md) 是唯一权威版本。

本文档面向想要自行部署 Open Agricola 平台的开发者。

## 架构概览

```
┌──────────────────────────────┐      ┌───────────────────────────────┐
│  GitHub Pages（主站）          │      │  VPS（你的服务器）              │
│  index.html + JS/CSS         │─────▶│  Node.js 后端                  │
└──────────────┬───────────────┘      │    ├── HTTP API  /api/*       │
               │                      │    ├── WebSocket /ws          │
               ▼                      │    ├── Card art  /card-art/*  │
┌──────────────────────────────┐      │    └── SQLite    ./data/*.db  │
│  GitHub Pages（图片资源站）    │      └───────────────────────────────┘
│  open-agricola-assets        │
└──────────────────────────────┘
```

前端和后端完全分离——前端是纯静态文件（GitHub Pages），后端是一个 Docker 容器（VPS）。

### 托管成本与中国大陆访问（核验日期：2026-10-01）

当前实现应比较具有 **2 vCPU / 2 GiB 内存、持久磁盘、公网 IPv4 和常驻进程**的 Linux VPS。后端需要长期 WebSocket、SQLite、Replay 持久文件及 Node.js 原生依赖。单实例 Docker Compose 可以沿用架构，无需迁移数据库或改写房间状态管理。下文的容量探针是测量基线，不能保证所有厂商标称 CPU 和公网带宽的实际表现。

以下是官方公开价格，不是 owner 计费账号里的订单报价。月费年化表示支付十二个月；域名注册/续费、异机备份、适用税费和超额流量另算。购买前需检查库存、身份资格和结算价格。

| 候选 | 资源 | 当前服务器费用 | 续费与限制 |
|---|---|---|---|
| 复用已有大陆 VPS | 核实空闲 CPU、内存、磁盘与已有服务 | **新增租金 0 元** | 原有租金仍需支付；仍需满足备案及服务分类要求 |
| [腾讯大陆秒杀](https://cloud.tencent.com/act/pro/featured-202607) | 4 核 4 GB、40 GB SSD、峰值 3 Mbps、每月 300 GB 出站 | **首年 38 元** | 个人实名新用户、限量抢购；未承诺 38 元续费。公开刊例参考 780 元/年，实际续费以结算为准 |
| [阿里大陆 ECS 99](https://www.aliyun.com/activity/ecs/99program) | 2 核 2 GB、40 GB ESSD Entry、固定 3 Mbps、不限流量 | **99 元/年** | 符合条件的新老用户；活动至 **2029-03-31**，每付费年可优惠续费一次。已有优惠权益及变配影响资格，不是永久锁价 |
| [华为 Flexus L](https://www.huaweicloud.com/product/flexus-l.html) | 2 核 2 GB、40 GB、2 Mbps、100 GB/月 | 展示价 329.32 元/年 | 续费需核对结算；旧 38 元宣传未确认当前有效 |
| [腾讯国内站香港 Lighthouse](https://cloud.tencent.com.cn/announce/detail/2131) | 2 核 2 GB、40 GB SSD、峰值 20 Mbps、0.5 TB/月 | **38 元/月**，年化 456 元 | 官方刊例适用于新购和续费。[短周期活动](https://cloud.tencent.com/act/pro/lhsp2025)可能另有折扣，不假定以后继续优惠 |
| [GreenCloud 特价](https://greencloudvps.com/billing/store/budget-kvm-sale) | 美国 2 核 4 GB / 35 GB，或东京 Softbank 4 核 8 GB / 60 GB；含 IPv4 | **美国 25 美元/年；东京 45 美元/年** | 调研时官方商店显示有库存；续费金额未确认。该特价明确不退款。标称运营商和端口速度不是大陆线路验收 |
| [CloudCone 美国 VPS](https://cloudcone.com/vps/) | 4 核 2 GB、60 GB SSD、IPv4、7 TB/月 | 46 美元/年 | [创建页](https://app.cloudcone.com/vps/517/create?token=ssd-vps-2)可配置洛杉矶，当前续费计算与基价相同；未确认终身锁价。大陆访问未验收 |
| [RackNerd 特价](https://www.racknerd.com/specials/) | 广告 2 核 2 GB、35 GB SSD、IPv4、5 TB/月 | 广告价 35.99 美元/年 | 官方 FAQ 承诺同价续费，但本次购买链接未落到宣传的 VPS；仅列广告候选，不能视为已确认可下单库存 |
| [腾讯国际站东京/新加坡 Lighthouse](https://www.tencentcloud.com/document/product/1103/47794) | 2 核 2 GB、40 GB、峰值 20 Mbps、512 GB/月 | 4.20 美元/月，年化 50.40 美元 | [首购 10.08 美元/年宣传](https://www.tencentcloud.com/act/pro/lighthouse)未确认具体地域 SKU 或本账号资格；需满足[国际站身份规则](https://www.tencentcloud.com/document/product/378/10495) |
| [AWS Lightsail IPv4 Linux](https://aws.amazon.com/lightsail/pricing/) | 2 核 2 GB、60 GB | 12 美元/月，年化 144 美元 | 试用资格另算；不同地域流量额度及超额出站收费不同 |
| [Akamai/Linode 亚太](https://www.akamai.com/cloud/pricing/asia-pacific) | 1 核 2 GB，或 2 核 4 GB | 12 美元/月，或 24 美元/月 | 2 GB 套餐的 CPU 低于项目测量基线；已有机器可考虑复用 |
| [Oracle Always Free A1](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) | 当前额度相当于 2 OCPU / 12 GB ARM；启动盘和块存储共 200 GB | 额度内 0 美元 | 主地域可能缺货，闲置实例可能被回收；需构建 ARM 镜像并验证应用，不适合依赖它立即切换生产 |

其他方案对本项目没有足够成本优势：[阿里国际站](https://www.alibabacloud.com/en/product/swas/pricing) 2 核 2 GB 为 15 美元/月，且有[独立的国际账号要求](https://www.alibabacloud.com/help/en/account/step-1-register-an-alibaba-cloud-account)。[Hetzner 2026 年 6 月调价](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)后，新加坡 2 核 4 GB 为 30.99 美元/月，尚未加 IPv4 和税。[LightNode 香港页](https://go.lightnode.com/hong-kong-vps)广告与套餐卡报价不一致，不能将广告最低价视为已确认的购买报价。

免费 PaaS 与当前 VPS 部署不等价。[Render Free](https://render.com/docs/free)在 15 分钟没有入站 HTTP/WS 流量后休眠，重启、部署或休眠都会丢失本地文件，且不能挂持久盘。[Railway](https://railway.com/pricing) Hobby 最低月支出 5 美元，但内存、CPU、存储和流量按用量计费，并非固定价 2 GB VPS。[Fly.io](https://docs.fly.io/about/pricing/)另计机器、卷与地域出站费用。[Cloudflare Workers 文件系统](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/)是内存中的临时文件系统，承载本后端需要重做持久化和运行时适配。免费的 [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/)也不能保证大陆稳定访问；独立的 [China Network](https://developers.cloudflare.com/china-network/)需要 Enterprise、China 订阅及 ICP 备案号。

#### 复用博客域名承载境外后端

已有博客域名可以提供独立后端入口，例如 `agricola-api.example.com`。新增该名称的 `A` 记录指向境外 VPS IPv4，在服务器上为该域名配置有效 TLS 证书，再让前端使用对应的 HTTPS API 和 WSS 地址。无需再买一个注册域名，原域名仍需续费。[Cloudflare 子域名配置](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-subdomain/)。按接入商[地域规则](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)，香港/境外源站无需大陆 ICP 备案；仅看域名注册商所在地不能判断是否需要备案。

直连线路评估可先将该记录设为 **DNS only（仅 DNS）**：客户端直接连接 VPS，由 VPS 提供 TLS。启用 Cloudflare 代理则客户端会经过 Cloudflare，需要单独验证其线路。[代理行为](https://developers.cloudflare.com/dns/proxy-status/)。DNS 记录不能指定应用端口；现服务仍用 8443 时，测试 URL 保留 `:8443`。新部署应安排 443 的 HTTPS/WSS 入口。公网域名变化还需更新后端公开 URL、前端 API/WS 配置及适用的 OAuth/GitHub App 回调。

最便宜的首次评估是在现境外后端上增加新域名，**新增 VPS 和域名采购费用均为 0**，owner 随后确认手机在未开代理的中国移动蜂窝网络可以访问新域名的健康接口，账号登录尚未验证。2026-10-01 owner 的博客部署配置使用 `titanxxh.com` 与 `139.162.99.38`；用其配置账号 `xxh` SSH 检查，Nginx 正在运行，1 核，系统总内存约 961 MiB、available 610 MiB、磁盘空闲 15 GB。这低于游戏测量基线，共用需按较低负载验收。自有 `ali-kr` 有 2 核、约 1.6 GiB 内存、27 GB 空闲磁盘，443 已有服务，也可进入复用评估，但入口和大陆线路仍需验证。这些资源快照不能证明任一主机能承受游戏负载。

若新购，东京 45 美元/年特价值得先测试线路，再决定是否支付不退款的年费；香港 38 元/月可以缩短首次评估周期。更便宜的美国方案只有在最终域名和完整应用通过大陆网络测试后，才能视为满足要求。标称境外地域、运营商或低价都不能单独证明大陆可达。

2026-10-01，owner 已添加 `openagapi.titanxxh.com` 的 DNS-only A 记录，指向 `74.208.219.191`。已停止失效的 `socat-relay` 并取消开机自启；Caddy 同时开放宿主机 443 和 8443，并服务 DuckDNS 旧域名和新域名。应用容器没有重启。Let's Encrypt 已签发有效的新域名证书，已有大陆 VPS 对旧域名两个端口的健康检查也仍然通过。仓库 Compose 文件已同步增加 443 映射；后续执行 `deploy-backend.sh` 时，需要部署包含该修改的 ref 才能保留它。

22:05（UTC+8），[新域名 443](https://api.globalping.io/v1/measurements/2xpMwUX5AluN7qO8r00021Ekv) 和[新域名 8443](https://api.globalping.io/v1/measurements/2r63IBvYEEyo8tKEj00021Ekv) 在 **8 个大陆探针上全部返回 HTTP 200 且证书校验通过：移动 2 个（北京、广州）、电信 3 个（西安、东莞、广州）、联通 3 个（上海两个、深圳）**，另有一个新加坡对照。新域名 443 在移动节点耗时 0.63–0.97 秒，大陆全部节点耗时 0.62–1.85 秒。同批[旧域名 443 对照](https://api.globalping.io/v1/measurements/2FGZ9cDZH93ouNaCk00021Ekv) 中，两个移动节点均报 `ECONNRESET`，电信、联通、新加坡均成功。在相同 IP 和端口下，这支持故障与域名/SNI 有关，但不能据此确定由谁触发重置。

已有大陆 VPS 对登录接口发送空 POST，得到预期 HTTP 400 `missing_fields`；WebSocket Upgrade 得到 HTTP 101，随后因未提供会话而出现预期的认证超时。这些仅验证入口与协议链路，不能代表账号登录或已认证对局成功。本次没有发布新前端或切换 OAuth 回调。owner 随后确认手机在未开代理的中国移动蜂窝网络访问新域名健康接口，显示 `{"ok":true}`。仓库前端变量仍指向旧 DuckDNS API/WSS 地址；最新成功 Pages 发布与后端均为 v0.6.1（`d109b5ff288c7aff68c2abdb8c8cdade9fd74bcf`）。发布使用新地址的前端仍是独立的待办步骤，账号登录成功尚未验证。

#### 大陆线路实测（2026-10-01，UTC+8 20:26–20:33）

此前价格比较没有证明新购实例的大陆可达性。本轮使用 Globalping 远程探针，并非 owner 的手机。已保存规范化的[测量快照](performance/hosting-route-measurements-2026-10-01.json)，包含探针元数据、统计、TLS 状态及来源 ID。首批每个目标实际返回 **9 个大陆探针：移动、电信、联通各 3 个**，另加一个新加坡对照。实际大陆城市为北京、台山、桂林、广州、西安、深圳、上海；广州、上海各包含多个探针。补测指定宁波/镇江时没有可用 IPv4 探针，未计入结果。每个 ping 探针发送 10 个包；HTTPS 使用固定目标 IP，并传入测试域名作为 Host/SNI。

| 目标与原始测量 | 中国移动 | 中国电信 | 中国联通 | 范围 |
|---|---|---|---|---|
| [自有韩国 VPS ping](https://api.globalping.io/v1/measurements/2MyAvkqw48T1VAjHw00021EjK) | 探针平均 RTT 70–119 ms；ICMP 未回包 0–20% | 64–72 ms；未回包 0–10% | 41–74 ms；均回包 | 现有 IP，未部署游戏 |
| [GreenCloud 东京 Softbank ping](https://api.globalping.io/v1/measurements/2eLGvowagPSPEw3X100021EjK) | 59–94 ms；未回包 0–10% | 76–121 ms；未回包 10–40% | 91–120 ms；均回包 | 官方同地域/线路标签测试 IP `103.201.131.7` |
| [GreenCloud 芝加哥 DC2 ping](https://api.globalping.io/v1/measurements/2090DVhzOEJBDjZw000021EjK) | 253–269 ms | 233–272 ms | 276–363 ms | 官方 DC2 测试 IP `173.249.214.11`；时延高于本轮亚洲测点 |
| [CloudCone 洛杉矶 LG HTTPS 首轮](https://api.globalping.io/v1/measurements/2aDRYTTEtNFOSRCsb00021EjL) | 3/3 HTTP 200，但总耗时为 0.55、7.05、10.71 秒 | 3/3 HTTP 200 | 3/3 HTTP 200 | 仅 Looking Glass，未确认等同 46 美元/年 DC4 线路 |
| [RackNerd 洛杉矶 DC03 LG HTTPS](https://api.globalping.io/v1/measurements/2zPTi7l8YbkSEN61500021EjL) | 0/3 HTTP 成功；TCP/TLS 约 15 秒超时 | 3/3 HTTP 200 | 3/3 HTTP 200 | 仅 Looking Glass，固定 IP `107.174.51.158` |
| [现后端健康检查](https://api.globalping.io/v1/measurements/2xrR6xGIcjrDbOLsx00021EjL) | 0/3；`ECONNRESET` | 3/3 HTTP 200 | 3/3 HTTP 200 | 实际 `/api/health`，DuckDNS SNI、8443；未测密码和 WS 流程 |

[CloudCone 复测](https://api.globalping.io/v1/measurements/2O5jKtft1Y2xJT2dV00021EjP)选到昆明、台山、北京移动，仅台山成功，昆明和北京 TLS 握手约 15 秒超时。两轮新加坡对照均成功。因此应将这个洛杉矶候选从 owner 的移动访问优先列表移除，但不能推广为 CloudCone 所有地域或实例 IP 都有相同问题。

另做[韩国主机 HTTPS 对照](https://api.globalping.io/v1/measurements/2qGMvLVGPhfU3t9SZ00021EjP)：固定 IP:443，使用 `example.com` 对照域名，北京、桂林、广州移动及新加坡均收到 HTTP 404。返回证书属于 `google.com`，与对照域名不匹配（`ERR_TLS_CERT_ALTNAME_INVALID`），不能作为浏览器认可的 HTTPS 入口。这只证明这些路径到其现有入口/回落服务完成 TCP/TLS/HTTP；**404 不是游戏健康或登录成功**，该端口仍属于原有 Reality 服务。[博客 IP ping](https://api.globalping.io/v1/measurements/2CSg28gHpgEKydJvw00021EjL)在移动为 56–84 ms，电信 171–241 ms，联通 283–490 ms，也不是三网都低时延。

官方测点来源：[GreenCloud 机房表](https://greencloudvps.com/data-centers.php)、[CloudCone 洛杉矶 Looking Glass](https://lg-la.us.cloudc.one/)、[RackNerd 洛杉矶 DC03 Looking Glass](https://lg-lax03.racknerd.com/)。测试节点不能保证未来分配 IP 或宿主负载。10 个 ICMP 包不能证明长期丢包率，ICMP 未回包也不自动等于 TCP/应用丢包。探针运营商已知，但未必是蜂窝 4G/5G 接入。本轮没有完成最终自有域名密码登录、WSS 对局、带宽负载和多轮晚高峰验收。

没有找到对应腾讯香港 Lighthouse 普通/加速配置的官方公开测点，所以**未实测腾讯香港**。38 元/月基础套餐没有已经证明的大陆优化线路。可选的[优选流量包](https://cloud.tencent.com/document/product/1207/104332)需另购并开启，只加速面向大陆的 IPv4 出方向流量。[当前价格](https://cloud.tencent.com/document/product/1207/104334)为 10 GB 19.5 元、50 GB 94.9 元，分别有效六个月，并非每月自动刷新。例如每月另买 10 GB，会在基础租金上增加 19.5 元/月；实际游戏流量和加速效果仍未测量。

据此，优先验证自有韩国机上的自有域名游戏部署，再决定是否新购。东京 Softbank 是较低时延的网络候选，仍需 HTTPS/WSS 与负载验收，其电信 ICMP 表现也需继续检查。CloudCone 洛杉矶和 RackNerd 洛杉矶不列为本次移动需求的优先选择。腾讯香港仍是未测候选，不能当成已经验收的解决方案。

#### 大陆备案：先确认项目分类

本项目是在线多人桌游，不能默认普通个人网站备案足够。腾讯官方[游戏网站 FAQ](https://cloud.tencent.cn/document/product/243/19628)要求游戏类网站提供游戏版号，[网站信息规则](https://cloud.tencent.com/document/product/243/19644)限制个人备案涉及前置审批内容。这**不等于已经认定本开源项目的具体分类**。采购或安排大陆切换前，应让实际接入商按完整功能确认分类和可备案性，如实说明账号、多人房间、用户制卡和发布功能；免费和开源不能证明自动豁免。

若接入商认可拟提供的服务及备案主体：

1. 准备符合获批后缀、注册商和实名认证要求的域名。个人备案的域名持有人须与主体一致。借用 DuckDNS 子域不能证明拥有符合要求的注册域名。[阿里域名要求](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/prepare-and-check-the-domain-name)。
2. 先在接入商备案控制台检查现有服务器，不必直接新购。阿里当前清单要求大陆 ECS 包年包月累计购买时长**大于三个月**并有公网带宽；符合条件的年付套餐满足时长要求。SSH 可以确认地域和资源，不能确认付费时长或备案服务码。[服务器资格](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-server-access-information-check)。
3. 主机和域名分别计价。[阿里基础备案免费](https://help.aliyun.com/zh/icp-filing/product-overview/product-billing)，付费管家可选。域名首年活动价不能当作续费价。[域名价格](https://help.aliyun.com/zh/dws/product-overview/domain-name-fees)。
4. 填写身份、联系方式、域名和准确的服务信息，完成接入商核验与短信核验，再等待省管局审核。阿里说明**初审 1–2 个工作日，管局通常 1–20 个工作日**；补件、节假日另加时间。[进度与时限](https://help.aliyun.com/zh/icp-filing/the-progress-of-inquires-1)。
5. 通过后按接入商要求展示备案号、办理公安备案；腾讯指南要求服务开通后 30 日内办理公安备案。[备案指南](https://cloud.tencent.com/document/product/243/39038)。已有其他接入商 ICP 号，迁入阿里仍需[接入备案](https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview)。

大陆后端使用 8443 等非标准端口仍需备案；[只用公网 IP 的网站](https://cloud.tencent.cn/document/product/243/18910)也没有自动豁免。静态前端留在境外，不能消除大陆后端的接入要求。香港/境外主机无需大陆 ICP 备案，但这不保证大陆可达，也不代表已经判定其他服务义务。

#### 选型与切换前验证

**新增**服务器费用最低的是复用自有机器。在本次核验的新购大陆方案中，符合首购秒杀条件时腾讯首年最便宜，阿里活动期的低价续费更清楚。使用国内云账号、需要新购香港机器时，腾讯 38 元/月是实际候选，仍需线路测试。这些是已核验候选中的条件化推荐，不是全球绝对最低价声明。

Owner 在 2026-10-01 经 SSH 确认一台上海 `ecs.e-c1m1.large`：2 核，系统总内存约 1.6 GiB，空闲磁盘约 31 GB，无 swap，443 已有 VLESS Reality 监听。这证明它可以进入复用评估，不能证明账单、备案资格或游戏容量。共用主机需安排入口并验证负载；迁移后不能让现有备份与应用同机而失去独立副本。

同日现生产应用与 Caddy 空闲时约使用 200 MiB 和 25 MiB，持久应用卷约 120 MB。这些只是快照，不代表峰值内存、磁盘增长或并发上限。迁移需保留完整持久卷和加密密钥，使用新鲜的一致性备份，不能直接依赖较旧的异机快照。

当前 DuckDNS 入口还有部分中国移动路径的域名/SNI 相关重置证据：[原入口](https://api.globalping.io/v1/measurements/2NuU1pD7mHK38bS2C00021EiP)与[固定 IP 保留原 SNI](https://api.globalping.io/v1/measurements/2xMedIwsAbB0GasgW00021EiQ)均在五个大陆移动探针中的四个失败，而相同 IP/端口使用[对照 SNI](https://api.globalping.io/v1/measurements/2h7HlfkN6Wr8Y5O4A00021EiQ)收到服务端 TLS 警报。对照只能证明请求到达 TLS 服务，不能证明成功登录。新域名可能有帮助，但尚未验证；只换 VPS 并不是已经证明有效的修复。

生产切换前，用最终域名和有效 TLS 在移动、电信、联通验证密码登录、WSS 鉴权、开房、对局、重连及备份恢复。境外 [Lighthouse 跨境路径可能延迟、丢包](https://www.tencentcloud.com/document/product/1103/41264)，香港也一样。大陆部署还需检查出站依赖：本次上海主机能收到 GitHub/Resend 接口响应，Google API 和 Docker Hub 超时；这未验证真实 OAuth/邮件投递。必要时传输 owner 构建的镜像，并验证完整功能。

---

## 一、部署后端

后端部署分两种情况：
- **情况 A**：全新 VPS，只有公网 IP，没有域名
- **情况 B**：有域名 + 已有 HTTPS（Nginx + Let's Encrypt / Certbot）

两种情况都需要先完成基础步骤。

### 1. 基础步骤（两种情况通用）

#### 容量基准规格

单实例容量统一以 **2 vCPU / 2 GiB 内存**为测量锚点，真实命令与 Replay 写入复测见
[`docs/performance/replay-room-capacity.md`](performance/replay-room-capacity.md)。
该规格最多保留 **30 个普通 `waiting + playing` Room**；只有相同探针的新报告可以上调。

#### 安装 Docker

```bash
# 一键安装 Docker（Ubuntu/Debian/CentOS）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录 SSH 让 docker 组生效
```

#### 拉取代码

```bash
git clone https://github.com/YOUR_USER/open-agricola.git
cd open-agricola
git checkout main
```

#### 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`（后续步骤会覆盖部分值，先填通用的）：

```env
BACKEND_PORT=5175
NODE_ENV=production
PERSIST_ROOMS=sqlite
ALLOW_ANONYMOUS_WS=false
REPLAY_NEW_ROOMS_ENABLED=false
REPLAY_VIEWER_BUILD_ID=
REPLAY_VIEWER_ROOT=./data/replay-viewers
REPLAY_ASSET_ROOT=./data/replay-assets
REPLAY_REMOVAL_LEDGER_PATH=./data/replay-removals.jsonl
REPLAY_TRUST_PROXY=false
GAME_BUILD_ID=
# CORS_ORIGIN 等后续根据情况设置
```

后端直接暴露端口时保持 `REPLAY_TRUST_PROXY=false`。只有后端仅能经可信 Caddy/Nginx 到达，且代理会覆盖 `X-Forwarded-For` 时才设为 `true`。
仓库的 `docker-compose.prod.yml` 使用隔离的 Caddy 作为唯一入口，因此已固定为 `REPLAY_TRUST_PROXY=true`。

首次启用 Replay 时必须使用 `PERSIST_ROOMS=sqlite`。先生成并追加发布 Viewer Build：

```bash
REPLAY_VIEWER_ROOT="$PWD/data/replay-viewers" \
pnpm run build:replay-viewer
# stdout 最后一行是 REPLAY_VIEWER_BUILD_ID
```

命令只把 Viewer 代码、样式和卡牌 manifest 写入独立只读 Build，棋盘图、卡图和字体从固定的素材仓 commit 读取，不进入持久卷。发布仍生成逐文件 SHA-256 清单，以清单本身的 SHA-256 作为目录名，并在发布后重新校验完整目录；已存在的同 ID 目录不会覆盖。

`docker-compose.prod.yml` 使用 `app-data:/app/data` named volume。保持 `REPLAY_NEW_ROOMS_ENABLED=false` 启动一次后，把 Build 追加进去，再启用录制：

运行下方命令前，把上一步 stdout 最后一行填入 `.env` 的 `REPLAY_VIEWER_BUILD_ID`，并把 `git rev-parse HEAD` 的输出填入 `GAME_BUILD_ID`。

```bash
set -a
source .env
set +a
test -n "$REPLAY_VIEWER_BUILD_ID"
test -n "$GAME_BUILD_ID"
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app \
  mkdir -p "/app/data/replay-viewers/$REPLAY_VIEWER_BUILD_ID"
docker compose -f docker-compose.prod.yml cp \
  "data/replay-viewers/$REPLAY_VIEWER_BUILD_ID/." \
  "app:/app/data/replay-viewers/$REPLAY_VIEWER_BUILD_ID"
# 复制完成后，在 .env 改为 REPLAY_NEW_ROOMS_ENABLED=true
docker compose -f docker-compose.prod.yml up -d --force-recreate app
```

清单、内容 Hash 或入口校验失败时拒绝创建新 Room。开关、Build ID 和自定义卡运行时版本在 Room 创建时锁定；自定义卡图复制到 `REPLAY_ASSET_ROOT` 的内容寻址文件。已有 Replay Room 会继续按锁定值记录，开关关闭期间不会迁移旧进行局。

Bug Report 使用独立 GitHub App，只安装到 `titanxxh/open-agricola-issues`：

1. Repository permissions 只开启 `Issues: Read and write`，安装范围只选 issues-only 仓库。
2. Callback URL 设为 `<PUBLIC_API_BASE>/api/v1/issue-submission-connection/github/callback`。
3. Webhook URL 设为 `<PUBLIC_API_BASE>/api/v1/github-app/webhook`，配置独立 webhook secret，并订阅 GitHub App authorization 和 Issues 事件。
4. 在 `.env` 填写 App ID、Client ID/secret、单行 `\n` 转义的 private key、webhook secret、installation ID 和 issues-only repository ID。
5. 生成 32 字节随机加密密钥，使用 JSON key ring 配置 `BUG_REPORT_TOKEN_ENCRYPTION_KEYS`，并让 `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` 指向其中一个 key。
6. 保持 `BUG_REPORTS_ENABLED=false` 启动并完成迁移；验证 Hosted 与本人 GitHub 两条链路后再改为 `true`。关闭开关只隐藏新入口，不会丢弃既有草稿或交付队列。

启用后，`PUBLIC_APP_ORIGIN` 缺失或不是有效的 HTTP(S) 前端地址会让健康检查返回 `503`，并暂停 OAuth、新草稿和交付，避免创建缺少对局链接的 Issue。

```env
BUG_REPORTS_ENABLED=false
BUG_REPORT_GITHUB_APP_ID=
BUG_REPORT_GITHUB_CLIENT_ID=
BUG_REPORT_GITHUB_CLIENT_SECRET=
BUG_REPORT_GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
BUG_REPORT_GITHUB_WEBHOOK_SECRET=
BUG_REPORT_GITHUB_INSTALLATION_ID=
BUG_REPORT_GITHUB_REPOSITORY_ID=
BUG_REPORT_TOKEN_ENCRYPTION_KEYS={"v1":"<32-byte-base64-key>"}
BUG_REPORT_TOKEN_ACTIVE_KEY_ID=v1
```

#### 构建并启动

```bash
docker compose up -d --build
```

#### 验证

```bash
curl http://localhost:5175/api/health
# 应返回: {"ok":true}
```

查看日志：

```bash
docker compose logs -f app
```

---

### 情况 A：全新 VPS，只有公网 IP，没有域名

> 适用于：刚买的 VPS，没有域名，想用最简单的方式让后端跑起来。

#### 方案 A1：纯 HTTP（仅限测试，前端也需 HTTP）

最简单的方式。缺点：**GitHub Pages 是 HTTPS，无法直接连接 HTTP 后端**（浏览器会拦截混合内容）。所以前端也必须用 HTTP 方式部署（不用 GitHub Pages，用 VPS 自身提供静态文件）。

**步骤：**

1. 编辑 `.env`：

   ```env
   CORS_ORIGIN=*
   ```

2. 修改 `docker-compose.yml`，在 app 容器中挂载前端构建产物：

   ```bash
   # 本地构建前端（指向 VPS 公网 IP）
   VITE_API_BASE=http://YOUR_VPS_IP:5175 pnpm run build
   ```

3. 把 `dist/` 目录上传到 VPS，然后用简单 HTTP 服务器托管：

   ```bash
   # 在 VPS 上
   cd dist
   python3 -m http.server 8080 &
   ```

4. 访问 `http://YOUR_VPS_IP:8080`

5. WebSocket 地址：`ws://YOUR_VPS_IP:5175/ws`

> ⚠️ 此方案不安全（明文传输密码），仅用于本地测试或内网。

#### 方案 A2：Caddy 自签 / IP 直连 + 自动 HTTPS（推荐，需要域名）

如果你有域名（即使是免费的），Caddy 可以自动申请 Let's Encrypt 证书，零配置 HTTPS。

**获取免费域名（可选）：**

- [DuckDNS](https://www.duckdns.org/) — 免费子域名，如 `your-game.duckdns.org`
- [No-IP](https://www.noip.com/) — 免费 DDNS
- [FreeDNS](https://freedns.afraid.org/) — 免费子域名

**步骤：**

1. 把域名 DNS A 记录指向你的 VPS IP

2. 创建 `deploy/Caddyfile`：

   ```
   your-game.duckdns.org {
       reverse_proxy app:5175
   }
   ```

3. 创建 `docker-compose.prod.yml`（不覆盖原文件）：

   ```yaml
   services:
     app:
       build: .
       expose:
         - "5175"
       environment:
         - NODE_ENV=production
         - BACKEND_PORT=5175
         - BACKEND_HOST=0.0.0.0
         - PERSIST_ROOMS=sqlite
         - ALLOW_ANONYMOUS_WS=false
         - DB_PATH=./data/open-agricola.db
         - CARD_ART_DIR=./data/card-art
         - REPLAY_NEW_ROOMS_ENABLED=${REPLAY_NEW_ROOMS_ENABLED:-false}
         - REPLAY_VIEWER_BUILD_ID=${REPLAY_VIEWER_BUILD_ID:-}
         - REPLAY_VIEWER_ROOT=${REPLAY_VIEWER_ROOT:-./data/replay-viewers}
         - REPLAY_ASSET_ROOT=${REPLAY_ASSET_ROOT:-./data/replay-assets}
         - REPLAY_TRUST_PROXY=true
         - GAME_BUILD_ID=${GAME_BUILD_ID:-}
         - CORS_ORIGIN=https://YOUR_USER.github.io
       volumes:
         - app-data:/app/data
         - app-output:/app/output
       restart: unless-stopped

     caddy:
       image: caddy:alpine
       ports:
         - "80:80"
         - "443:443"
       volumes:
         - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
         - caddy-data:/data
       depends_on:
         - app
       restart: unless-stopped

   volumes:
     app-data:
     app-output:
     caddy-data:
   ```

4. 启动：

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

5. 验证：

   ```bash
   curl https://your-game.duckdns.org/api/health
   ```

6. 前端 `VITE_API_BASE` 设为 `https://your-game.duckdns.org`

> Caddy 会自动申请和续期 Let's Encrypt 证书，你无需手动管理。

---

### 情况 B：已有域名 + HTTPS（Nginx + Let's Encrypt）

> 适用于：VPS 上已经跑了 Nginx，已通过 Certbot 配了 HTTPS 证书。

这种情况最简单——Docker 只暴露 HTTP 端口，Nginx 做反向代理 + TLS 终止。

**步骤：**

1. 编辑 `.env`：

   ```env
   CORS_ORIGIN=https://YOUR_USER.github.io
   ```

2. 确保 `docker-compose.yml` 端口映射绑定到 `127.0.0.1`（仅本地可访问）：

   ```yaml
   ports:
     - "127.0.0.1:5175:5175"
   ```

3. 启动 Docker：

   ```bash
   docker compose up -d --build
   ```

4. 为后端 API 添加一个 Nginx server block 或 location。

   因为下面配置会覆盖 `X-Forwarded-For`，同时在后端 `.env` 设置 `REPLAY_TRUST_PROXY=true`。

   **方式一：子域名（推荐）**，如 `api.your-domain.com`

   先申请子域名证书：

   ```bash
   sudo certbot --nginx -d api.your-domain.com
   ```

   然后添加 Nginx 配置 `/etc/nginx/sites-available/open-agricola-api`：

   ```nginx
   server {
       listen 443 ssl;
       server_name api.your-domain.com;

       ssl_certificate     /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

       location / {
           proxy_pass http://127.0.0.1:5175;
           proxy_http_version 1.1;

           # WebSocket 支持（必须，否则多人游戏不工作）
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";

           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $remote_addr;
           proxy_set_header X-Forwarded-Proto $scheme;

           # WebSocket 超时设长一些
           proxy_read_timeout 86400s;
           proxy_send_timeout 86400s;
       }
   }

   server {
       listen 80;
       server_name api.your-domain.com;
       return 301 https://$host$request_uri;
   }
   ```

   **方式二：子路径**，如 `your-domain.com/agricola-api/`

   在现有 server block 里添加：

   ```nginx
   location /agricola-api/ {
       rewrite ^/agricola-api/(.*) /$1 break;
       proxy_pass http://127.0.0.1:5175;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_read_timeout 86400s;
       proxy_send_timeout 86400s;
   }
   ```

5. 启用配置并重载 Nginx：

   ```bash
   # 仅子域名方式需要
   sudo ln -s /etc/nginx/sites-available/open-agricola-api /etc/nginx/sites-enabled/

   sudo nginx -t          # 测试配置
   sudo systemctl reload nginx
   ```

6. 验证：

   ```bash
   curl https://api.your-domain.com/api/health
   ```

7. 前端 `VITE_API_BASE` 设为 `https://api.your-domain.com`（或 `https://your-domain.com/agricola-api`）

> **关键：Nginx 必须转发 WebSocket**。如果忘了 `Upgrade` / `Connection` 头，HTTP API 正常但多人游戏会断连。

---

## 二、部署前端（GitHub Pages）

### 前置条件

- GitHub 仓库 Settings → Pages → Source 选 **GitHub Actions**
- 仓库 Settings → Environments → `github-pages` → Deployment branches and tags：允许 `main` 和 tag 模式 `v*`（release 部署以 tag 为 ref 运行，缺 tag 规则会被拒绝部署）

### 配置

在 Settings → Secrets and variables → Actions → **Variables** 标签中添加：

| Variable | 值 | 示例 |
|----------|---|------|
| `VITE_API_BASE` | 后端完整 URL | `https://api.your-domain.com` 或 `http://VPS_IP:5175`（仅 HTTP 方案） |
| `VITE_WS_BASE` | WebSocket URL（可选，自动推导） | `wss://api.your-domain.com/ws` |
| `VITE_SANDBOX_EXECUTOR` | 工坊试玩沙盒执行器（可选） | `browser` = 试玩全程在浏览器本地运行（引擎 Worker + 本地编译，零服务器参与）；缺省 / 其他值 = 走服务端 `/api/game/new-sandbox` |

### 触发部署

发布 GitHub Release 后自动部署前端（`.github/workflows/deploy-pages.yml`，`on: release: published`）：

```bash
gh release create v0.3.0 --generate-notes
```

也可以在 GitHub UI 操作：Releases → Draft a new release → 新建 tag（`vX.Y.Z`）→ Generate release notes → Publish。后端不会由 release 自动部署。Actions 页面手动触发（workflow_dispatch）时部署 `main` 最新前端。

部署成功后访问：`https://YOUR_USER.github.io/open-agricola/`

### 手动构建（不用 GitHub Actions）

```bash
VITE_API_BASE=https://api.your-domain.com pnpm run build
pnpm dlx gh-pages -d dist
```

### 主站图片资源

`public-assets.ref` 固定图片仓的 Git commit，`public-assets.required.json` 声明主站需要的全部路径。构建和默认本地启动读取该 commit 的 GitHub tree；响应无效、tree 不完整或缺少必需路径时立即失败。测试配置只读取本地契约，不依赖网络。运行时从 `raw.githubusercontent.com/titanxxh/open-agricola-assets/<commit>/` 读取对应 commit 的图片，主站和不可变 Replay Viewer 使用同一固定来源，图片本身不再打进主站 Pages artifact。

本地修改图片时可全量切到一个资产仓 checkout：

```bash
PUBLIC_ASSET_LOCAL_DIR=../open-agricola-assets pnpm dev
```

启动前会检查全部必需文件；缺少任一文件即失败，不会混用或回退到远端。该覆盖仅用于本地开发服务器，CI 和生产构建不接受它。

更新图片时先在 `open-agricola-assets` 发布并验证 commit-addressed raw URL，再把主仓 `public-assets.ref` 更新为该 commit，并同步 `public-assets.required.json`；随后再走主仓的正常 Release。旧版本通过 Git 历史中的 commit 继续读取原图片，不需要在当前目录保留旧文件。

---

## 三、更新部署

### 后端

后端只在 owner 控制的本机部署。SSH 私钥保留在本机，`ACCOUNT_REGISTRATION_POLICY` 由服务器 `.env` 提供；两者都不写入 GitHub Actions：

```bash
./deploy-backend.sh root@your-game.duckdns.org v0.3.0 /root/open-agricola
```

`deploy-backend.sh` 在切换新版本前自动做完整备份：先 build 新镜像（旧版本继续服务），然后停止 app，把 `app-data` volume 全量打包为 `backups/pre-<ref>-<timestamp>.tgz`（含 SQLite、card art、Replay Viewer、Replay assets、删除 ledger），同时刷新 `backups/replay-removals.latest.jsonl` 并保存 `.env` 快照 `backups/env-pre-<ref>-<timestamp>`（600 权限）。归档生成后，目标镜像会在一次性可写副本上执行目标数据库迁移、删除 ledger 重放、SQLite `integrity_check`、所有活动 Room 反序列化、Replay metadata/Head/Segment、内容寻址 assets 和 Viewer 构建校验；配置在 `/app/data` 下的自定义 Replay 路径会映射到解包副本，原归档保持不变。通过后写入同名 `.manifest.json`，记录归档 SHA-256/大小、源/目标 Build、目标 ref、迁移前后数据库 schema、Replay schema 及校验计数。备份或语义校验失败会拉回旧版本 app 并使本地部署命令失败；app 停止后到新版本启动成功之间本地 SSH 被中断时同样自动拉回旧容器。脚本自动清理旧的 pre-deploy 备份及配对 manifest：保留最近 5 份，且按 ADR-0010 的备份副本上限删除超过 30 天的归档；手动备份（非 `pre-` 前缀）不受影响。备份归档、manifest 与 ledger 快照为 600 权限、`backups/` 目录为 700。停机窗口只覆盖打包、语义校验和启动新容器，不包含镜像构建。恢复流程见[数据备份](#数据备份)。

数据（SQLite 数据库、card art）存储在 Docker volume 中，重建容器不会丢失。

### 前端

发布 GitHub Release 后自动重新部署（见上文「触发部署」）。

---

## Auth OAuth

生产环境可启用密码注册（需要 Resend 邮箱验证）和 GitHub / Google OAuth；`ACCOUNT_REGISTRATION_POLICY` 统一控制注册入口。

OAuth 所需后端环境变量：

- `PUBLIC_APP_ORIGIN`：用户在浏览器中打开的前端地址；GitHub Pages 子路径部署要包含 base path，例如 `https://your-user.github.io/open-agricola/`。
- `PUBLIC_API_BASE`：用户浏览器可访问的后端 origin，例如 `https://api.your-domain.com`，用于 OAuth provider callback URL 和邮箱验证链接；生产环境必填。
- `CORS_ORIGIN`：前后端不同源时必须等于前端 origin。
- `ACCOUNT_GITHUB_OAUTH_CLIENT_ID` / `ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET`：账号登录/注册用 GitHub OAuth App 凭据。
- `ACCOUNT_GOOGLE_OAUTH_CLIENT_ID` / `ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET`：账号登录/注册用 Google OAuth Client 凭据。

OAuth callback URL 填后端 origin：

```text
https://<backend-origin>/api/auth/oauth/github/callback
https://<backend-origin>/api/auth/oauth/google/callback
```

生产环境不要设置：

- `ALLOW_ANONYMOUS_WS=true`
- `ENABLE_AUTH_TEST_HELPERS=1`

---

## 四、验证清单

部署完成后逐项验证：

- [ ] `curl https://your-backend/api/health` 返回 `{"ok":true}`
- [ ] 访问前端 URL，能看到登录页
- [ ] 首次部署时先用 `ACCOUNT_REGISTRATION_POLICY=open` 注册 `ADMIN_USERS` 中的第一个管理员账号
- [ ] 管理员能进入 Settings 生成邀请码后，将 `ACCOUNT_REGISTRATION_POLICY` 改为 `invite_only` 并重启后端
- [ ] 通过 GitHub 或 Google + 邀请码注册新用户
- [ ] 登录成功，进入大厅
- [ ] 创建房间，开始游戏
- [ ] WebSocket 连接正常（浏览器 Console 无 WS 错误）
- [ ] 双人模式：两个浏览器窗口加入同一房间
- [ ] 进行局与结束局原参与者都能打开三步 Bug Report，非参与者被拒绝
- [ ] 本人 GitHub 与 Hosted Identity 各创建一个 Issue，正文只含现象、Reporter ID 和对局锚点
- [ ] Settings 能断开 Issue Submission Connection，GitHub 撤销授权后连接状态失效
- [ ] Workshop：创建/浏览自定义卡牌
- [ ] Card art 上传和显示正常
- [ ] `docker compose down && docker compose up -d` 后数据仍在（SQLite 持久化）

---

## 五、环境变量参考

### 后端（Docker / .env）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BACKEND_PORT` | `5175` | HTTP/WS 监听端口 |
| `BACKEND_HOST` | `0.0.0.0` | 绑定地址 |
| `NODE_ENV` | — | 设为 `production` 启用生产模式 |
| `PERSIST_ROOMS` | `sqlite` | 房间持久化方式 (`sqlite` / `json`) |
| `ALLOW_ANONYMOUS_WS` | `true`(dev) / `false`(prod) | 是否允许匿名 WebSocket |
| `CORS_ORIGIN` | `*` | 允许的前端域名，生产环境必须设置 |
| `PUBLIC_APP_ORIGIN` | — | 前端公开地址；Pages 子路径部署要包含 `/open-agricola/` |
| `PUBLIC_API_BASE` | — | 后端公开 origin，用于 OAuth provider callback URL 和邮箱验证链接；生产环境必填 |
| `EMAIL_DELIVERY` | `log` | 邮件发送模式；生产用户名密码注册必须设为 `resend` |
| `RESEND_API_KEY` | — | Resend API key，只给后端容器 |
| `EMAIL_FROM` | — | 发信地址，例如 `Open Agricola <no-reply@mail.example.com>` |
| `EMAIL_REPLY_TO` | — | 可选回复地址 |
| `ACCOUNT_GITHUB_OAUTH_CLIENT_ID` | — | 账号 GitHub OAuth App client id |
| `ACCOUNT_GITHUB_OAUTH_CLIENT_SECRET` | — | 账号 GitHub OAuth App client secret |
| `ACCOUNT_GOOGLE_OAUTH_CLIENT_ID` | — | 账号 Google OAuth client id |
| `ACCOUNT_GOOGLE_OAUTH_CLIENT_SECRET` | — | 账号 Google OAuth client secret |
| `BUG_REPORTS_ENABLED` | `false` | 是否允许创建新的 Bug Report 草稿 |
| `BUG_REPORT_GITHUB_APP_ID` | — | issues-only GitHub App ID |
| `BUG_REPORT_GITHUB_CLIENT_ID` | — | GitHub App Client ID |
| `BUG_REPORT_GITHUB_CLIENT_SECRET` | — | GitHub App Client secret |
| `BUG_REPORT_GITHUB_PRIVATE_KEY` | — | GitHub App private key，使用单行 `\n` 转义 |
| `BUG_REPORT_GITHUB_WEBHOOK_SECRET` | — | GitHub App webhook secret |
| `BUG_REPORT_GITHUB_INSTALLATION_ID` | — | issues-only 仓库的 App installation ID |
| `BUG_REPORT_GITHUB_REPOSITORY_ID` | — | `titanxxh/open-agricola-issues` 数字 repository ID |
| `BUG_REPORT_TOKEN_ENCRYPTION_KEYS` | — | AES-256-GCM key ring JSON；每个值为 32 字节 base64 |
| `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` | — | 新令牌使用的 key ring key ID |
| `ENABLE_AUTH_TEST_HELPERS` | — | 仅本地/E2E 可设 `1`，生产禁止设置 |
| `DB_PATH` | `./data/open-agricola.db` | SQLite 文件路径 |
| `CARD_ART_DIR` | `./data/card-art` | 上传的卡牌图片存储路径 |
| `REPLAY_VIEWER_ROOT` | `./data/replay-viewers` | 不可变 Replay Viewer Build 目录 |
| `REPLAY_VIEWER_BUILD_ID` | — | 新 Room 锁定的不可变 Viewer Build ID |
| `REPLAY_ASSET_ROOT` | `./data/replay-assets` | 内容寻址的 Replay 自定义卡资源目录 |
| `REPLAY_REMOVAL_LEDGER_PATH` | `./data/replay-removals.jsonl` | SQLite 外、只追加的 Replay 删除 ledger；恢复旧备份时必须使用最新副本 |
| `REPLAY_NEW_ROOMS_ENABLED` | `false` | 是否为新 Room 启用 Replay 录制；启用前必须准备 Viewer Build |
| `REPLAY_TRUST_PROXY` | `false` | 仅当后端只能经会覆盖 `X-Forwarded-For` 的可信反向代理访问时设为 `true` |
| `GAME_BUILD_ID` | — | 当前后端 Git commit；自动部署脚本会填入 |
| `ADMIN_USERS` | — | 管理员用户名，逗号分隔 |
| `ACCOUNT_REGISTRATION_POLICY` | 必填 | 账号注册策略：首次部署用 `open` 创建第一个管理员，之后改为 `invite_only`；`disabled` 禁止新账号注册 |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | — | Workshop → PR 使用的 GitHub OAuth App 凭据 |
| `GITHUB_UPSTREAM_OWNER` / `GITHUB_UPSTREAM_REPO` | `titanxxh` / `open-agricola` | Workshop PR 目标仓库 |
| `WORKSHOP_PR_ENABLED` | `false` | 是否开放 Workshop → PR |
| `WORKSHOP_REVIEW_GITHUB_APP_ID` | — | Workshop Review GitHub App ID |
| `WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY` | — | App private key，使用单行 `\n` 转义 |
| `WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID` | — | App 在主仓库的 installation ID |
| `WORKSHOP_REVIEW_GITHUB_WEBHOOK_SECRET` | — | `/api/github/webhook` HMAC secret |
| `OFFSITE_BACKUP_TARGET` | — | 定时异机备份的 ssh 目标（如 `root@1.2.3.4`）；仅 `backup-offsite.sh` 读取，不进应用容器 |
| `OFFSITE_BACKUP_REMOTE_DIR` | `/root/open-agricola-backups` | 异机上的备份存放目录；仅 `backup-offsite.sh` 读取 |

### Resend 邮箱验证

1. 在 Resend 添加并验证发信域名。
2. 创建 Sending access API key。
3. 在后端 `.env` 中设置：

   ```bash
   EMAIL_DELIVERY=resend
   RESEND_API_KEY=re_xxx
   EMAIL_FROM="Open Agricola <no-reply@mail.example.com>"
   ```

4. 确认 `PUBLIC_API_BASE` 是用户可访问的后端 HTTPS 地址，`PUBLIC_APP_ORIGIN` 是前端地址。

### 前端（构建时注入）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE` | `''`（空=同源） | 后端 API 地址 |
| `VITE_WS_BASE` | 从 API_BASE 推导 | WebSocket 地址 |
| `PUBLIC_ASSET_LOCAL_DIR` | — | 仅本地开发：完整图片仓 checkout；设置后禁止远端混用或回退 |

---

## 六、常见问题

### WebSocket 连接失败

- 确认后端 HTTPS 配置正确（GitHub Pages 是 HTTPS，WS 必须用 `wss://`）
- 确认反向代理转发 WebSocket upgrade 头（Nginx 需要 `proxy_set_header Upgrade`）
- 检查 `VITE_WS_BASE` 是否正确设置
- Nginx `proxy_read_timeout` 太短会导致 WS 连接被切断，建议 `86400s`

### CORS 错误

- 检查 `.env` 中 `CORS_ORIGIN` 是否与前端域名完全匹配（含 `https://`，不含尾部 `/`）
- 如果使用自定义域名，确保 `CORS_ORIGIN` 与实际访问域名一致

### 混合内容被拦截（Mixed Content）

- 浏览器会阻止 HTTPS 页面加载 HTTP 资源
- 解决：后端必须配置 HTTPS（方案 A2 或情况 B）
- 临时方案：前端也用 HTTP 部署（方案 A1），但不安全

### 卡牌图片不显示

- 不影响游戏功能，仅影响显示
- 确认 `public-assets.ref` 指向已发布的素材仓 commit，且 `public-assets.required.json` 列出了所有需要的路径

### 数据备份

备份必须同时包含 SQLite、Viewer、Replay assets、card art 和 deletion ledger。`deploy-backend.sh` 会在每次切换新版本前生成同等内容的 `backups/pre-<ref>-<timestamp>.tgz`，并配对 `pre-<ref>-<timestamp>.manifest.json` 证明目标镜像已在一次性副本上完成迁移和恢复验证（见「三、更新部署」）。manifest 中的 `targetBuildId` 只证明该构建兼容，`archiveSha256` 和 `archiveSizeBytes` 绑定实际归档；换用其他构建恢复时必须重新运行 `scripts/validate-backup.ts`。下述手动命令用于部署之外的场景。以下命令假定 ledger 保持默认的 `/app/data/replay-removals.jsonl`；先停后端，避免备份跨越一次 Room Commit：

```bash
mkdir -p backups
OA_BACKUP_NAME="open-agricola-$(date -u +%Y%m%dT%H%M%SZ).tgz"
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$PWD/backups:/backup" app sh -c \
  "tar -C /app/data -czf /backup/$OA_BACKUP_NAME . && \
   if [ -f /app/data/replay-removals.jsonl ]; then \
     cp /app/data/replay-removals.jsonl /backup/replay-removals.latest.jsonl; \
   else \
     : > /backup/replay-removals.latest.jsonl; \
   fi"
docker compose -f docker-compose.prod.yml up -d app
```

手动归档只有通过当前目标镜像的只读恢复验证后才能作为已验证恢复点，并须保留配对 manifest：

```bash
OA_BACKUP_STEM="${OA_BACKUP_NAME%.tgz}"
OA_VALIDATE_DIR="$(mktemp -d)"
OA_BUILD_ID="$(git rev-parse HEAD)"
OA_BACKUP_SHA256="$(sha256sum "backups/$OA_BACKUP_NAME" | cut -d ' ' -f 1)"
OA_BACKUP_SIZE_BYTES="$(stat -c '%s' "backups/$OA_BACKUP_NAME")"
tar -C "$OA_VALIDATE_DIR" -xzf "backups/$OA_BACKUP_NAME"
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$OA_VALIDATE_DIR:/validation-data" \
  -e DB_PATH=/validation-data/open-agricola.db \
  -e BACKUP_STEM="$OA_BACKUP_STEM" \
  -e BACKUP_CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -e SOURCE_BUILD_ID="$OA_BUILD_ID" \
  -e TARGET_BUILD_ID="$OA_BUILD_ID" \
  -e TARGET_REF=manual \
  -e BACKUP_SHA256="$OA_BACKUP_SHA256" \
  -e BACKUP_SIZE_BYTES="$OA_BACKUP_SIZE_BYTES" \
  app node --import tsx scripts/validate-backup.ts \
  > "backups/$OA_BACKUP_STEM.manifest.json"
rm -rf -- "$OA_VALIDATE_DIR"
chmod 600 "backups/$OA_BACKUP_STEM.manifest.json"
```

`replay-removals.latest.jsonl` 是只追加的最新删除事实，必须与普通备份分开保留；每次 Replay 下架后立即执行 `./backup-offsite.sh ledger-only` 更新其异机副本（不停 app），不能随旧数据备份回滚。

#### 定时备份与异机副本

`backup-offsite.sh` 由生产机 cron 每日调用（UTC 20:00，北京时间 04:00），补齐两次 release 之间的数据保护并把备份同步到生产机之外：

1. 停 app 把 `app-data` volume 打包为 `backups/daily-<timestamp>.tgz` 并刷新 `backups/replay-removals.latest.jsonl`，随即重启 app——停机窗口只覆盖打包。备份与部署共享 `backups/.maintenance.lock`：部署进行中 cron 备份直接跳过，部署会等待进行中的备份结束。
2. app 恢复服务后，用当前运行镜像在一次性副本上执行与 pre-deploy 备份相同的恢复验证（`scripts/validate-backup.ts`），写入同名 `.manifest.json` 并保存 `.env` 快照（存在 `.env` 文件时）；验证失败删除本次产物并以非零退出（cron 日志可见），不影响线上服务，后续保留清理与异机同步照常执行。
3. 本地 `daily-*` 保留最近 7 份；本地所有归档（含 `pre-*` 与手动备份）一律最多 30 天（ADR-0010 上限，按分钟计算避免整天舍入），份数层面 `pre-*` 仍由 `deploy-backend.sh` 管理、手动备份留人工处理。
4. 把 `backups/`（含 `pre-*`、`daily-*`、手动备份、manifest、env 快照）rsync 到 `OFFSITE_BACKUP_TARGET` 的 `OFFSITE_BACKUP_REMOTE_DIR`；超过 30 天的本地归档不再推送。rsync 不带 `--delete`：远端保留策略独立于本地，本地误删不会传播到异机。
5. `replay-removals.latest.jsonl` 不走目录同步：只有本地副本是远端副本的超集（前缀关系成立）时才覆盖远端，防止回滚的 ledger 冲掉异机删除事实；前缀不成立时脚本以非零退出并保留远端副本。
6. 远端清理：`daily-*` 保留最近 30 份、`pre-*` 保留最近 10 份，且所有归档（含手动备份）一律最多 30 天（ADR-0010 备份副本上限）；`replay-removals.latest.jsonl` 永不自动清理。异机自身另装 `deploy/offsite-retention.sh` 的自治 cron 兜底 30 天上限——生产机丢失或失联时合规仍然成立。

首次在生产机启用：

```bash
# 1. host 依赖：生产机需要 rsync + cron + logrotate（Docker 不自带），异机需要 rsync
apt-get update && apt-get install -y rsync cron logrotate
systemctl is-active cron   # 必须输出 active
ssh root@<异机IP> 'command -v rsync || (apt-get update && apt-get install -y rsync)'

# 2. 生产机 → 异机的 ssh 信任（生产机上执行；已有 key 时跳过 ssh-keygen）
test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -N '' -f ~/.ssh/id_ed25519
ssh-copy-id root@<异机IP>

# 3. .env 配置备份目标
echo 'OFFSITE_BACKUP_TARGET=root@<异机IP>' >> /root/open-agricola/.env

# 4. 手动跑一次验证全链路
/root/open-agricola/backup-offsite.sh

# 5. 安装 cron 与日志轮转
cd /root/open-agricola
cp deploy/open-agricola-backup.cron /etc/cron.d/open-agricola-backup
chmod 644 /etc/cron.d/open-agricola-backup
cp deploy/open-agricola-backup.logrotate /etc/logrotate.d/open-agricola-backup

# 6. 异机安装自治 30 天清理（生产机失联时 ADR-0010 上限仍成立）
scp deploy/offsite-retention.sh root@<异机IP>:/root/offsite-retention.sh
ssh root@<异机IP> 'chmod +x /root/offsite-retention.sh'
scp deploy/open-agricola-offsite-retention.cron root@<异机IP>:/etc/cron.d/open-agricola-offsite-retention
ssh root@<异机IP> 'chmod 644 /etc/cron.d/open-agricola-offsite-retention && systemctl is-active cron'
```

脚本随 git 部署自动更新；cron 定义改动后需重新执行第 5 步。从异机恢复时，先把目标归档、配对 manifest、`env-<stem>` 快照和 `replay-removals.latest.jsonl` 拉回生产机 `backups/`：

```bash
rsync "root@<异机IP>:/root/open-agricola-backups/{<stem>.tgz,<stem>.manifest.json,env-<stem>,replay-removals.latest.jsonl}" backups/
cp "backups/env-<stem>" .env && chmod 600 .env   # 新机器缺 .env 时恢复运行配置
```

再按下述恢复流程执行。

恢复前准备目标归档、配对 manifest 和最新 ledger，并确认 manifest 的 `targetBuildId` 与准备启动的构建相同；否则先在归档副本上用目标镜像重新运行验证器。然后在后端停止期间替换数据。恢复命令会显式重放 ledger；服务启动也会再次幂等重放：

```bash
OA_RESTORE_ARCHIVE=open-agricola-YYYYMMDDTHHMMSSZ.tgz
OA_RESTORE_STEM="${OA_RESTORE_ARCHIVE%.tgz}"
OA_TARGET_BUILD_ID="$(git rev-parse HEAD)"
test -f "backups/$OA_RESTORE_ARCHIVE"
test -f "backups/$OA_RESTORE_STEM.manifest.json"
test -f backups/replay-removals.latest.jsonl
test "$(sha256sum "backups/$OA_RESTORE_ARCHIVE" | cut -d ' ' -f 1)" = \
  "$(jq -r .archiveSha256 "backups/$OA_RESTORE_STEM.manifest.json")"
test "$(stat -c '%s' "backups/$OA_RESTORE_ARCHIVE")" -eq \
  "$(jq -r .archiveSizeBytes "backups/$OA_RESTORE_STEM.manifest.json")"
test "$OA_TARGET_BUILD_ID" = \
  "$(jq -r .targetBuildId "backups/$OA_RESTORE_STEM.manifest.json")"
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -e OA_RESTORE_ARCHIVE="$OA_RESTORE_ARCHIVE" \
  -v "$PWD/backups:/backup:ro" app sh -c \
  'tar -tzf "/backup/$OA_RESTORE_ARCHIVE" >/dev/null &&
   find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} \; &&
   tar -C /app/data -xzf "/backup/$OA_RESTORE_ARCHIVE" &&
   cp /backup/replay-removals.latest.jsonl /app/data/replay-removals.jsonl &&
   node --import tsx scripts/replay-removal.ts apply-ledger'
docker compose -f docker-compose.prod.yml up -d app
```

恢复后逐个抽查 ledger 中的 Room ID：Game Context 只能返回 `removed` Tombstone，manifest/segment 不可读取；无其他 Replay 引用的资源 Hash 必须返回 404。

### Replay 下架

CLI 只接受精确 Room ID 和 `removed`、`moderation`、`legal` 三种原因。先停后端并 dry-run，确认输出的 Room 与资源 Hash 后再执行：

```bash
OA_ROOM_ID=replace-with-exact-room-id
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason moderation --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason moderation
mkdir -p backups
docker compose -f docker-compose.prod.yml cp \
  app:/app/data/replay-removals.jsonl backups/replay-removals.latest.jsonl
docker compose -f docker-compose.prod.yml up -d app
```

法律请求明确要求删除 Game Result Archive 时，仅可使用 `legal` 原因并追加 `--erase-result`；该模式不能和 `--asset-hash` 组合：

```bash
OA_ROOM_ID=replace-with-exact-room-id
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal --erase-result --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal --erase-result
mkdir -p backups
docker compose -f docker-compose.prod.yml cp \
  app:/app/data/replay-removals.jsonl backups/replay-removals.latest.jsonl
docker compose -f docker-compose.prod.yml up -d app
```

若违规对象是自定义卡图片本身，再传精确的 64 位内容 Hash；dry-run 会列出所有引用该资源、将一并 Tombstone 的 Room：

```bash
OA_ASSET_HASH=replace-with-64-character-sha256
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal \
  --asset-hash "$OA_ASSET_HASH" --dry-run
docker compose -f docker-compose.prod.yml run --rm --no-deps app \
  node --import tsx scripts/replay-removal.ts remove \
  --room-id "$OA_ROOM_ID" --reason legal \
  --asset-hash "$OA_ASSET_HASH"
mkdir -p backups
docker compose -f docker-compose.prod.yml cp \
  app:/app/data/replay-removals.jsonl backups/replay-removals.latest.jsonl
docker compose -f docker-compose.prod.yml up -d app
```

资产下架可使用 ledger 已证明引用关系的既有 Tombstone Room 作为入口。违规 Hash 会作为永久规则写入 ledger：旧备份恢复时自动下架新增引用，后续 Room 也不能重新归档同一内容。操作幂等；普通整局下架只删除不再被其他 Replay 引用的资源。成功后立即执行 `./backup-offsite.sh ledger-only` 异机备份最新 `replay-removals.jsonl`。

### Bug Report token 密钥轮换

1. 生成新的 32 字节随机 key，加入 `BUG_REPORT_TOKEN_ENCRYPTION_KEYS`，保留旧 key。
2. 把 `BUG_REPORT_TOKEN_ACTIVE_KEY_ID` 改为新 key id，重启后端；新连接和后续 token refresh 会使用新 key。
3. 旧 key 仍用于解密尚未刷新连接，不能提前删除。检查 `issue_submission_connections.key_id`，并等待旧 key 行数归零；仍有效的旧 `oauth_states.pkce_verifier_key_id` 也必须归零或过期。
4. 确认 Hosted 与本人 GitHub 提交都成功后，才从 key ring 删除旧 key 并再次重启。轮换期间不要修改已有 key id 对应的 key 内容。

### 本地开发（不需要 Docker）

```bash
pnpm install
./restart-local.sh
```

`VITE_API_BASE` 未设置时默认为空字符串（同源），开发模式下前端自动连接 `localhost:5175`。
