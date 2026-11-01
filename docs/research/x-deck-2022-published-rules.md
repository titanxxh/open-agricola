# X-Deck 2022 版出版规则研究

研究日期：2026-11-01。目标版本：Lookout Games 2022 年《Agricola 15》周年版（15 Years of Agricola: The Anniversary Box）。仓库基线：`2cf5c21be`。

本报告回答 [#1545](https://github.com/titanxxh/open-agricola/issues/1545) 的事实调查，属于地图 [#1544](https://github.com/titanxxh/open-agricola/issues/1544)。报告只记录出版来源能确认什么、不能确认什么，不采纳 Project Rule Interpretation，也不核对本仓库代码能力。逐张中文牌图转录归 [#1546](https://github.com/titanxxh/open-agricola/issues/1546)，本文不转录 BGA 快照牌图，也没有使用 BGA 快照的代码或定义文件。本文只在回答通则问题时引用少量牌面原文。

## 证据等级

由强到弱排列；“官方裁定”与“官方规则”同属出版社文字，按问题类型使用。

| 标记 | 含义 |
| --- | --- |
| **官方规则** | Lookout 2022 年出版的规则书、附录或出版社官网文字。 |
| **官方牌面** | 2022 版牌面原文。出版社官网图片标为“官方牌面（出版社图片）”；第三方拍摄的 2022 版实物照片标为“官方牌面（社区照片）”。内容是官方印刷品，来源和清晰度另行说明。 |
| **官方裁定** | 出版社 FAQ 或勘误。 |
| **社区线索** | BGG 论坛、评测、BGG 条目元数据、玩家转引的牌面文字等。设计者或出版社编辑在论坛上的个人回复也归此级：它们有参考价值，但不是出版社 FAQ 或勘误，本文不把它们升级为官方裁定。 |
| **旁证（2008）** | 2008 年原版 X-Deck 的规则单、产品页和牌面。原版按初版 Agricola 写成，2022 附录说明牌面已按修订版改写，因此原版只能在 2022 文本有歧义或缺失时作旁证。 |

“未提及”表示所查来源没有相关文字；“禁止”只在来源明文禁止时使用。本报告没有把任何“未提及”写成“禁止”。

## 来源与局限

| 来源 | 本文用途 | 局限 |
| --- | --- | --- |
| [英文附录第 11–12 页](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=11)（16 页 PDF，创建于 2022-05-12） | X-Deck 的组件、准备、触发规则、五类牌的处理方式、24 张牌的编号与英文名、逐卡澄清。已用 `pdftotext -layout` 提取，并渲染第 11–12 页人工核对排版和组件插图。 | 附录只列牌名和少数澄清，不印牌面效果。 |
| [英文附录第 2、3、7、10 页](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=3) | p.2 “Card Categories”八种类别图标；p.3 术语表中“使用行动格”和“从累积格取货”的定义；p.7 西、东采石场所属阶段；p.10 Through the Seasons 的组合说明和季节增减。 | 通用规则，不针对 X-Deck。 |
| [德文附录第 11–12 页](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=11)（创建于 2022-05-05） | 德文牌堆名、牌类名、牌名、组件名；与英文附录逐句对照。 | 触发句、行动格句和 X21 澄清与英文措辞不同，见下文。 |
| [英文规则书](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf)（12 页） | p.2 组件表“24 X deck cards”；p.3 职业人数标记；p.12 单人规则与平分规则。 | 不含 X-Deck 专门规则。 |
| [英文产品页与 FAQ](https://www.lookout-spiele.de/en/games/15yearsofagricolaanniversarybox.html)、[德文产品页与 FAQ](https://www.lookout-spiele.de/de/games/15jahreagricolajubilaeumsbox.html) | 发行年份、1–4 人、FAQ。英文 FAQ 四问，德文 FAQ 三问。 | 没有 X-Deck 专项问答。 |
| [Lookout X-Deck 英文产品页](https://www.lookout-spiele.de/en/games/agricola_xdeck.html)、[德文产品页](https://www.lookout-spiele.de/de/games/agricola_xdeck.html) | 原版 X-Deck 的人数、牌类、触发描述，以及新旧版混用的 FAQ。 | 页面描述的是原版，不是 2022 版。 |
| [原版德文规则单](https://www.lookout-spiele.de/upload/en_agricola_xdeck.html_AgricolaXDeck-Regeln-DE_V1.pdf)（Lookout X-Deck 产品页下载，1 页） | 2008 版规则全文，用于新旧版差异。 | 旁证（2008）。PDF 元数据是 2020 年导出，正文写明对应 Agricola（Lookout Games, 2007）。 |
| [英文盒背](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.jpg) | 牌堆在盒背上的英文名称和宣传语，盒子人数 1–4。 | 只给名称和宣传语。 |
| [官网“Event cards”图片](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png) | X20 Darling, I Shrunk ... 的英文牌面局部。 | 牌面左侧被另一张牌遮住，正文只可见约一半。 |
| [BGG 图 8137342](https://boardgamegeek.com/image/8137342)（2024，Agricola 15 图库，题为“The X Deck”） | 2022 版 X01、X06、X19 的完整英文牌面，清晰可读。 | 社区照片，只有三张。 |
| [BGG 条目 38733](https://boardgamegeek.com/boardgame/38733/agricola-x-deck)、[Agricola 15 条目 359999](https://boardgamegeek.com/boardgame/359999/agricola-15) | 原版出版信息、各语言版本、包含关系、论坛索引。通过 geekdo API 读取。 | 社区维护的元数据。 |
| [BGG 图 420914](https://boardgamegeek.com/image/420914)、[420922](https://boardgamegeek.com/image/420922)、[420923](https://boardgamegeek.com/image/420923) | 2008 英文版 24 张牌面扫描。 | 旁证（2008），社区扫描。 |
| [Hobby Japan 产品页](https://hobbyjapan.games/agricola_15th_ann/) | 日文版牌堆名、人数、发售时间。 | 只用于名称。 |
| BGG 论坛帖（逐条链接见下文） | 出版社编辑、设计者和玩家的回复。 | 社区线索。2008–2011 年的回复针对原版。 |

取得方式：Lookout 站点对 `curl` 返回 Akamai 403，本环境的 WebFetch 也拒绝该域名。三份 PDF 与两个产品页改由 Internet Archive 快照取得：英文附录快照 2025-08-24、德文附录快照 2025-08-12、英文规则书快照 2025-08-12、英文周年版产品页快照 2026-05-13、德文周年版产品页快照 2026-05-13、英文 X-Deck 产品页快照 2025-11-10、德文 X-Deck 产品页快照 2026-04-16、原版德文规则单快照 2024-08-07。三份 PDF 的创建日期、页数与 [Legen\*dairy Forest 研究](https://github.com/titanxxh/open-agricola/blob/af02f91ce4447482a352fde2f8b5cdd304ad6c6c/docs/research/legendairy-forest-2022-published-rules.md)记录的一致。SHA-256 前缀：英文附录 `b023bd853e03`，德文附录 `1ef24e9b54a6`，英文规则书 `9b9b1878289b`。

没有找到出版社发布的 2022 版 X-Deck 完整牌面扫描、逐卡 FAQ 或勘误。没有找到 2022 版的简体或繁体中文出版物信息。

## 结论速览

- 2022 版 X-Deck 共 **24 张**，分五类：3 张外星行动格（X01–X03）、3 张太空商人（X04–X06）、6 张外星物品（X07–X12）、11 张外星事件（X13–X23）、1 张外星职业（X24）。**X23 Crop Circles 在英文和德文附录中都列在外星事件下**，2008 版德文规则单同样如此。**官方规则**。
- 触发：英文附录写“Each time **after** you collect stone from the ‘Western Quarry’ accumulation space, you **must also** draw the top card of the X deck and reveal it to all players”，并明文排除东采石场。德文附录改用“nutzt”（使用）该累积格，并写“在收取了那里累积的石头之后”抽牌；德文术语表规定“使用行动格”总是指放人。零石、卡牌额外给的石头、经其他效果使用西采石场，英德两版都**未提及**。**官方规则**。
- 每次翻 1 张（“the top card”），在取石之后，向所有玩家公开。牌堆耗尽、洗回，X-Deck 一节都**未提及**；同页 Legen\*dairy Forest 一节写了部分事件洗回，X-Deck 一节没有这句。**官方规则**。
- 行动格放在版图旁，是“normal action spaces”，任何人按常规放置规则使用；X-Deck 一节没有 Legen\*dairy Forest 那句“替换现有行动格”。商人放在版图旁，直到有玩家满足要求并领取奖励。物品和职业放在抽牌者面前，“with your played cards”。事件立即结算，不能选择忽略，效果可能即时、在之后的轮次、在计分时或持续生效。**官方规则**。
- 是否算“打出次要发展 / 打出职业”、是否付费、事件牌结算后放到哪里、商人无人购买时如何处理、同一行动能否买多个商人，附录都**未提及**。
- X06 Merchants of Pluto 的 2022 英文牌面：“Place this card next to the game board. The first player to use the "Fencing" action space and pay an additional 2 stone gets this card.” 印 2 分。**官方牌面（社区照片）**。
- 附录逐卡澄清只有 X01、X18、X20、X21 四条。X21 的英德澄清不一致：英文写“its spaces count as "unused"”且家人露宿“until it is rebuilt”；德文写露宿到“你搬进新的木屋”为止，“若不翻修，废墟格在**计分时**视为未使用”。**官方规则**。
- 出版社 FAQ 只有一般兼容声明（Farmers of the Moor、5–6 人扩展），以及“事件这种牌类是 X-Deck 首创”的说明；没有 X-Deck 专项问答，也没有找到勘误。**官方裁定**。
- 官方名称：英文“X deck”（盒背与附录标题作“X Deck”），德文“X-Deck”，日文「Ｘデッキ」；没有找到 2022 版官方中文名。牌号为“X”加两位数字 X01–X24。

## 一、名称与术语

| 对象 | 名称 | 来源与等级 |
| --- | --- | --- |
| 英文牌堆名 | 附录标题“The X Deck: Xenobiology for Beginners”；正文“the X deck”；盒背“X Deck”；规则书组件表“24 X deck cards” | [英文附录 p.11](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=11)、[盒背](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.jpg)、[规则书 p.2](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=2)，**官方规则** |
| 德文牌堆名 | “Das X-Deck: Xenobiologie für Anfänger”；正文“X-Deck” | [德文附录 p.11](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=11)，**官方规则** |
| 日文牌堆名 | 「Ｘデッキ」；组件“Xデッキのカード 24枚” | [Hobby Japan 产品页](https://hobbyjapan.games/agricola_15th_ann/)，官方日文版（2023 年 2 月发售） |
| 中文 | **未找到 2022 版官方中文名称**。BGG 为 Agricola 15 列出“Simplified Chinese edition”和“Traditional Chinese edition”两个版本条目，只有出版社 Lookout Games，没有产品名或图片。唯一找到的中文名是原版的 2009 年 Swan Panasia 繁体中文版“農家樂：X-外星人入侵擴充”。 | [BGG 版本 80874](https://boardgamegeek.com/boardgameversion/80874)，**社区线索**（BGG 元数据）、旁证（原版） |
| 原版名称 | 德文规则单“X-Deck”“Alien-Deck”；Lookout 英文产品页“Alien Encounter Deck ( X Deck )”，标题“Agricola: X-Deck” | [原版德文规则单](https://www.lookout-spiele.de/upload/en_agricola_xdeck.html_AgricolaXDeck-Regeln-DE_V1.pdf)、[X-Deck 英文产品页](https://www.lookout-spiele.de/en/games/agricola_xdeck.html)，旁证（2008） |

牌类的官方叫法（英 / 德附录，**官方规则**）：

| 类 | 英文 | 德文 |
| --- | --- | --- |
| 行动格 | Alien Action Spaces | Alien-Aktionsfelder |
| 商人 | Merchants from Outer Space | Kaufleute aus dem Weltall |
| 物品 | Alien Artifacts（单数 alien artifact） | Alien-Anschaffungen（单数 Alien-Anschaffung） |
| 事件 | Alien Events（正文 event card） | Alien-Ereignisse（正文 Ereigniskarte） |
| 职业 | Alien Occupation | Alien-Ausbildung |

德文“Anschaffung”与修订版次要发展的德文名“Kleine Anschaffung”同词根。这只是命名事实，附录没有据此说明物品算不算次要发展。

翻牌的官方说法：英文“draw the top card of the X deck and reveal it to all players”；德文“die oberste Karte vom X-Deck ziehen und allen vorzeigen”。抽到某类牌时，英文写“When you draw an alien artifact / it”，德文写“Wenn du eine Alien-Anschaffung ziehst / sie ziehst”。**官方规则**。

牌号：附录用“X01”–“X24”；2022 牌面在标题栏左下角印“X01”“X06”“X19”等小字，牌面右侧另有一个印“X”的圆章。**官方规则 / 官方牌面（社区照片）**。

组件的官方叫法（英 / 德附录，**官方规则**）：3 fuel tanks / 3 Treibstoffmarken（X08 用）；1 pitchfork / 1 Mistgabel（X09 用）；13 spaze woozles / 13 Raumwusel（X12 用，英文组件表拼作“spaze”）；12 candy / 12 Bonbons（X17 用）；12 torched wood rooms / 12 abgebrannte Holzräume（X21 用）。

附录 p.2 的“Card Categories”定义了八种类别图标（Farm Planner、Actions Booster、Points Provider、Goods Provider、Food Provider、Crop Provider、Building Resource Provider、Livestock Provider），说明“Every card and major improvement in Agricola belongs to one of eight categories”。这是卡牌用途分类，与 X-Deck 的五种牌类无关。2022 牌面上同时印有类别图标和“X”圆章：X01 为麦穗（Crop Provider），X06 为 Points Provider，X19 为马蹄铁（Livestock Provider），X20 为井字（Farm Planner）。[英文附录 p.2](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=2)，**官方规则 / 官方牌面**。

## 二、构成

| 类 | 张数 | 编号 | 来源与等级 |
| --- | --- | --- | --- |
| 外星行动格 | 3 | X01–X03 | 英文附录 p.11、德文附录 p.11，**官方规则** |
| 太空商人 | 3 | X04–X06 | 英文附录 p.11、德文附录 p.12，**官方规则** |
| 外星物品 | 6 | X07–X12 | 英文附录 p.12、德文附录 p.12，**官方规则** |
| 外星事件 | 11 | X13–X23 | 同上 |
| 外星职业 | 1 | X24 | 同上（“There is one alien occupation in the X deck.”） |
| 合计 | 24 | | 附录组件表“24 cards”，规则书 p.2“24 X deck cards” |

**X23 的类别**：英文附录把 X23 Crop Circles 列在“Alien Events”标题下，德文附录列在“Alien-Ereignisse”下，2008 德文规则单也列在“Alien-Ereignisse”下。附录没有把它单列，也没有说明它的牌框。2008 英文版 X23 用一种独有的农场板块样式（横排文字框，印“Place this card on your Farm board in such a way that it covers 2 spaces”），与该版的行动格、事件牌框都不同（[BGG 图 420923](https://boardgamegeek.com/image/420923)，旁证（2008））。2022 英文 X23 牌面没有找到，牌框是否与 X01–X03 相同、有没有事件标记，交 #1546 记录。按附录，X23 属于事件。**官方规则**。

逐张英德名称（附录列表，**官方规则**）：

| 编号 | 类 | 英文名 | 德文名 |
| --- | --- | --- | --- |
| X01 | 行动格 | Extraterrestrial Excrement | Außerirdischer Dünger |
| X02 | 行动格 | Homemade Space Rocket | Selbstgebautes Raumschiff |
| X03 | 行动格 | Transmogrifier | Umwandler |
| X04 | 商人 | Merchants of Jupiter | Kaufleute vom Jupiter |
| X05 | 商人 | Merchants of Mars | Kaufleute vom Mars |
| X06 | 商人 | Merchants of Pluto | Kaufleute vom Pluto |
| X07 | 物品 | Ley Lines | Ley-Linien |
| X08 | 物品 | Strange Alien Energy | Alien-Treibstoff |
| X09 | 物品 | Alien Farmhand | Außerirdischer Knecht |
| X10 | 物品 | Replicator | Replikator |
| X11 | 物品 | The X File | Die X-Feile |
| X12 | 物品 | Furry Friends | Pelzige Freunde |
| X13 | 事件 | Space Diner at the End of the Galaxy | Kaschemme am Ende des Universums |
| X14 | 事件 | Earthlings Are Easy | Erdlinge sind einfach zu kriegen |
| X15 | 事件 | Tripods | Tripoden |
| X16 | 事件 | Beam Me Down, Welshie | Beam mich runter, Mac |
| X17 | 事件 | Candy Trail | Bonbon-Pfad |
| X18 | 事件 | I Am Your Father | Ich bin dein Papa |
| X19 | 事件 | Alien Abduction | Entführung durch Aliens |
| X20 | 事件 | Darling, I Shrunk ... | Schatzi, ich habe ... |
| X21 | 事件 | Mind the Jets! | Vorsicht, Düsen! |
| X22 | 事件 | Carbonite Cousin | Karbonit-Vetter |
| X23 | 事件 | Crop Circles | Kornkreise |
| X24 | 职业 | Rebel | Rebell |

## 三、准备、触发与翻牌

以下引文出自[英文附录 p.11](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=11)和[德文附录 p.11](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=11)，等级均为**官方规则**，另有标注者除外。

| 问题 | 来源能确认的内容 | 未提及或有歧义 |
| --- | --- | --- |
| 准备 | “Shuffle the X deck thoroughly and place it face down beside the game board.” 特殊标记放在牌堆旁备用。 | 没有开局公开、开局抽牌或按人数移除牌的规定。 |
| 外星人何时到来 | “The aliens arrive when the "Western Quarry" accumulation space is revealed *(in rounds 5-7)*.” 德文：“sobald das Anhäufungsfeld „Westlicher Steinbruch“ (in den Runden 5-7) ins Spiel kommt”。[附录 p.7](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=7)：Western Quarry 为阶段 2 累积格（每轮 +1 石），Eastern Quarry 为阶段 4 累积格。 | 单人局可自选行动格牌进场顺序（见第八节），西采石场的进场轮次因此可能不在第 5–7 轮，附录没有讨论。 |
| 英文触发句 | “Each time **after** you collect stone from the "Western Quarry" accumulation space, you **must also** draw the top card of the X deck and reveal it to all players.” | 英文句用“collect stone from”，没有用“use”。 |
| 德文触发句 | “Immer wenn ihr das Anhäufungsfeld „Westlicher Steinbruch“ nutzt, müsst ihr, nachdem ihr die Steine, die sich dort angehäuft haben, eingesammelt habt, die oberste Karte vom X-Deck ziehen und allen vorzeigen.”（每当你们使用“西采石场”累积格，在收取了那里累积的石头之后，必须抽 X-Deck 顶牌并向所有人展示。） | 德文以“使用该累积格”为条件，英文以“从该累积格取得石头”为条件，两版措辞不同。 |
| “使用行动格”的定义 | 英文术语表：“Using an action space always entails placing a person on that action space. Using the effect of an action space or taking an action does not necessarily entail placing a person (but it can).” 德文术语表同义：“Ein „Aktionsfeld zu nutzen“, bedeutet immer, dass eine Person auf das Aktionsfeld gesetzt wird.” [英文附录 p.3](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=3)、[德文附录 p.3](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=3)。 | 德文触发句按字面需要放人；英文触发句没有用这个术语。附录没有说明二者冲突时以哪版为准。 |
| 东采石场 | 英文：“This does **not** apply to the "Eastern Quarry" accumulation space.” 德文：“Das gilt nicht für das Anhäufungsfeld „Östlicher Steinbruch“.” 明文排除。 | 其他放有石头的累积格（例如卡牌放石头的格）**未提及**。 |
| 零石 | **未提及**。西采石场上可能没有石头：Through the Seasons 夏季每个石头累积格减 1 石（[附录 p.10](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=10)）。 | 英文“collect stone”和德文“die Steine … eingesammelt”都没有说取到 0 石时是否触发。 |
| 卡牌额外给的石头 | **未提及**。英文写从该累积格取得的石头；德文写“那里累积的石头”。 | 使用西采石场时卡牌从公共供应额外给石是否计入、只靠额外石头能否触发，没有说明。 |
| 经其他卡牌或效果使用西采石场、从中拿石头 | **未提及**。 | 英文按字面只看“从该格取得石头”，德文按术语表要求放人，见上两行。 |
| 只取部分石头 | 术语表：使用累积格时必须取走全部货物，“unless some card tells you otherwise”。[英文附录 p.3](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=3)。 | 卡牌允许只取部分时是否触发，**未提及**。 |
| 每次翻几张 | “draw the top card”，即 1 张。 | 一次行动多次从西采石场取石时如何计次，**未提及**。 |
| 翻牌时点 | 英文“Each time **after** you collect stone”；德文“nachdem … eingesammelt habt”。两版都在取石之后。 | 翻牌相对其他“取物后”卡牌效果的先后，以及事件在当前行动中途结算还是行动结束后结算，**未提及**。 |
| 公开范围 | “reveal it to all players” / “allen vorzeigen”。 | — |
| 牌堆耗尽 | **未提及**。 | 待裁定。 |
| 洗回 | X-Deck 一节**未提及**洗回。同页 Legen\*dairy Forest 一节写“Some events are shuffled back into the deck and may reappear later in the game.”，X-Deck 的事件说明没有这句。 | 是否有单张牌印洗回句，交 #1546 从牌面核对。 |

原版对照（旁证（2008））：原版德文规则单写“Immer wenn ein Spieler diese Aktion durchführt, nimmt er sich nicht nur die entsprechenden Steine, sondern zieht auch die oberste Karte des Alien-Decks.”（每当玩家执行这个行动，不仅拿取相应石头，还抽 Alien 牌堆顶牌），并排除阶段 IV（第 10–11 轮）的“1 Stein”。Lookout X-Deck 英文产品页写“Whenever a player takes this action, they also draw the top card from the Alien Encounter Deck ( X Deck )”，德文产品页写“Immer wenn ein Spieler diese Aktion wählt”（选择这个行动）。BGG 条目描述另有一句“Of course, you also take any Stone that is on the space.”（社区线索）。原版的触发条件是执行该行动，不是取到石头；2022 英文改为“after you collect stone”。

## 四、各类牌的去向

### 外星行动格（X01–X03）

- 英文附录：“These cards are placed face up beside the game board. They are normal action spaces and can be used by any person, according to the usual placement rules.” **官方规则**。
- 德文附录：“Diese Karten werden offen neben den Spielplan gelegt. Es sind normale Aktionsfelder, die mit einer Person nach den normalen Regeln genutzt werden können.”（可以按常规规则用一个人使用。）英文“by any person”与德文“mit einer Person”措辞不同。原版德文规则单写“von allen Spielern”（所有玩家均可）。**官方规则 / 旁证（2008）**。
- X01 的 2022 英文牌面印“This is an action space for all. When you use it, immediately add 1 grain and 1 vegetable from the general supply to each of your grain and vegetable fields, respectively.” [BGG 图 8137342](https://boardgamegeek.com/image/8137342)，**官方牌面（社区照片）**。
- X-Deck 一节**没有**替换现有行动格的说法。同页 Legen\*dairy Forest 一节的“except in one case, the drawn action space replaces an existing one”不适用于 X-Deck。**官方规则**。
- 抽到当轮能否使用、是否随轮次回合重置、与轮次格的关系，附录只写“normal action spaces”和“usual placement rules”，没有逐项说明，**未提及**。
- 原版设计者 Melissa Rogerson 2009 年在 BGG 回答：牌只有被抽到才出场，行动格或商人“place them with the other Action cards”（[BGG 帖 469667](https://boardgamegeek.com/thread/469667/article/4402288#4402288)），属**社区线索**且针对原版。

### 太空商人（X04–X06）

- 英文附录：“All these guys want is to trade with you. Put them beside the game board until a player is ready to give them what they want and reap the reward.” 德文同义：“Legt diese Karten neben den Spielplan, bis jemand ihnen das bringt, was sie wollen, und sich die Belohnung abholt.” **官方规则**。
- X06 的 2022 英文牌面：“Place this card next to the game board. The first player to use the "Fencing" action space and pay an additional 2 stone gets this card.” 牌面左侧印 2 分。[BGG 图 8137342](https://boardgamegeek.com/image/8137342)，**官方牌面（社区照片）**。
  - 收购窗口挂在“使用 Fencing 行动格”上；按术语表，“use”指放人。
  - 竞争规则是“The first player”。
  - 成交后玩家“gets this card”。
  - Farm Redevelopment 等其他建栅栏的行动格、或用卡牌建栅栏，牌面**未提及**。
- X04、X05 的 2022 英文牌面没有找到。2008 英文版：X04“The first player to build 1 Stable and pay 2 additional Reed receives this card”；X05“The first player to use the standard Family Growth action *(with space in their Home)* and pay 2 additional Food receives this card”；X04–X06 都注明“It is worth 2 Points at the end of the game”。[BGG 图 420914](https://boardgamegeek.com/image/420914)，旁证（2008）。原版德文规则单另注 X05 德文牌面漏印“还须支付 2 食物”。2022 措辞交 #1546。
- 同一行动能否买多个商人、额外支付与行动费用是否一起支付、无人购买的商人在终局如何处理、成交后的牌放在哪里（是否算已打出的牌），**未提及**。
- 计分：X06 牌面印 2 分。附录没有专门说明商人的计分方式。Silver Duck 评测把商人描述为“race to do the action and pay the resources for 2 easy points”（[BGG 帖 3015294](https://boardgamegeek.com/thread/3015294)，**社区线索**）。

### 外星物品（X07–X12）

- 英文附录：“These are wonderful gifts that the aliens bring for you. When you draw an alien artifact, place it face up in front of you, with your played cards.” 德文：“Wenn du eine Alien-Anschaffung ziehst, lege sie zu deinen anderen gespielten Karten.” **官方规则**。
- 归属：抽牌者。是否支付费用、是否算“打出次要发展”、是否触发“每当你打出次要发展”之类的效果、是否计入次要发展数量，**未提及**。
- 原版德文规则单写“lege sie zu deinen ausgespielten kleinen Anschaffungen”（与你已打出的次要发展放在一起）；2022 改为“with your played cards / zu deinen anderen gespielten Karten”，去掉了“次要发展”字样。2008 英文版 X07–X12 用六边形画框，类似次要发展版式（[BGG 图 420914](https://boardgamegeek.com/image/420914)、[420922](https://boardgamegeek.com/image/420922)）。旁证（2008）。
- 物品转给其他玩家：附录**未提及**。2008 英文版 X10 印“As soon as you have received the goods, pass this card to the player to your left.”（旁证（2008））；2022 措辞交 #1546。

### 外星事件（X13–X23）

- 英文附录：“These are a new type of card. When an event card is drawn, it is resolved immediately. Events may be good or bad; you may not choose to ignore an event. Some effects take place immediately, some in later rounds, some during scoring, and some continuously.” 德文：“… man kann sich nicht aussuchen, ob man die Karte spielt. Manche Effekte wirken sofort, manche später, manche bei der Wertung und manche dauerhaft.” **官方规则**。
- 结算后弃置还是留场：附录**未提及**事件牌的去处，只说效果可能延后、在计分时或持续生效。
- 原版设计者 Melissa Rogerson 2009 年回答：“if they are Events, resolve them or place them beside the board depending on the card text”（[BGG 帖 469667](https://boardgamegeek.com/thread/469667/article/4402288#4402288)），属**社区线索**且针对原版。
- 事件由谁结算：附录说“resolved immediately”，没有写由抽牌者结算；具体对象以各牌牌面为准，交 #1546。
- X19 的 2022 英文牌面：“You immediately get an additional 1 sheep, 1 wild boar, and 1 cattle. However, in the returning home phase of this round, you must return one of your people to your supply *(instead of your house)*.” [BGG 图 8137342](https://boardgamegeek.com/image/8137342)，**官方牌面（社区照片）**。2008 英文版写“You immediately lose the Family member who took this action, and he or she is never seen again. *(Of course you can replace your Family member by taking a Family Growth action.)*”（旁证（2008））。

### 外星职业（X24）

- 英文附录：“There is one alien occupation in the X deck. When you draw it, place it face up in front of you, with your played cards.” 德文：“lege sie zu deinen anderen gespielten Karten.” **官方规则**。
- 是否支付学费、是否算“打出职业”、是否触发“每当你打出职业”之类的效果，**未提及**。原版德文规则单写“lege sie zu deinen anderen ausgespielten Ausbildungskarten”（与你其他已打出的职业放在一起），旁证（2008）。
- 人数标记：[规则书 p.3](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=3) 规定职业左侧方框表示适用人数，“[1+] stands for 1-4 players, [3+] stands for 3-4 players, and [4] stands for 4 players”，不适用的牌放回盒中，语境是发手牌。X24 牌面印什么标记，交 #1546。**官方规则**。

## 五、附录印出的逐卡澄清

只有以下四张有正文澄清，另有五张牌对应组件。英文出自[英文附录 p.11–12](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=11)，德文出自[德文附录 p.11–12](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=11)，等级为**官方规则**。

| 牌 | 英文澄清 | 德文澄清 | 对照 |
| --- | --- | --- | --- |
| X01 Extraterrestrial Excrement | “Place the new crops on top of the existing piles. Do not place crops in empty fields with this. This effect applies to fields on both tiles and cards.” | “Legt die neuen Waren oben auf den jeweiligen Stapel. Leere Äcker bleiben hierbei leer. Dieser Effekt gilt sowohl für Äcker auf Plättchen als auch auf Karten.” | 同义；德文用“Waren”（货物）而不是作物。 |
| X18 I Am Your Father | “You cannot use this action if you have 5 people already.” | “Hast du bereits 5 Personen, kannst du diese Aktion nicht nutzen.” | 同义。X18 列在事件下，澄清却称“this action”。 |
| X20 Darling, I Shrunk ... | “Your animals still count for the usual number of points during scoring. The effects of this card are so strong, all animals that you acquire in the future are shrunk as well.” | “Die Tiere werden am Ende normal gewertet. Dieses Ereignis ist so stark, dass auch Tiere, die du danach neu dazu erhältst, sofort schrumpfen.” | 同义。 |
| X21 Mind the Jets! | “If your house is destroyed, its spaces count as "unused" and your family sleeps under the stars until it is rebuilt. *(Mark the preprinted wood rooms on your farmyard board as destroyed.)*” | “Wenn dein Haus abbrennt, schläft deine Familie fortan unter den Sternen, bis du in ein neues Holzhaus ziehst. Renovierst du nicht, zählen die Trümmerfelder bei der Wertung als ungenutzt. *(Markiere die vorgedruckten Holzräume als nicht vorhanden.)*”（直到你搬进新的木屋为止；若不翻修，废墟格在计分时视为未使用。） | **不一致**：英文的“unused”没有限定时点，德文只说计分时；英文“until it is rebuilt”，德文“直到搬进新木屋”并提到“翻修”；英文标记为“destroyed”，德文标记为“nicht vorhanden”（不存在）。 |

组件对应：X08（3 fuel tanks）、X09（1 pitchfork）、X12（13 spaze woozles）、X17（12 candy）、X21（12 torched wood rooms）。英文附录 p.12 在 X08、X09、X12、X17、X21 旁画了对应组件插图。

官网“Event cards”图片中的 X20 英文牌面局部可见“…shrunk your animals to …ir size. Your pastures …s can now hold twice … animals. *(Your house …* Unfortunately, your … provide only half … amount of food …*ded down)*.”（[官网图片](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png)，**官方牌面（出版社图片）**，左半被遮挡）。完整原文交 #1546。

## 六、官方 FAQ 与勘误

- [英文周年版 FAQ](https://www.lookout-spiele.de/en/games/15yearsofagricolaanniversarybox.html) 共四问：
  - XXL 盒能否收纳扩展：可以；
  - 能否与 Farmers of the Moor 一起玩：“Yes, you can.”，并说周年版基础游戏适用于任何标注“Revised Edition”的扩展和牌堆；
  - 是否兼容 5–6 人扩展：“Absolutely!”；
  - L 牌堆四张横版牌（LE01–LE04）怎么用：“We introduced this type of card with the X deck back in the day. You can randomly select an event card at the start of the game and turn it face up; it affects all players.”

  [德文 FAQ](https://www.lookout-spiele.de/de/games/15jahreagricolajubilaeumsbox.html) 只有后三问，内容一致（“Diese Art von Karten haben wir erstmal mit dem X-Deck eingeführt.”）。**官方裁定**。
- 没有 X-Deck 专项问答，没有找到 X-Deck 勘误。
- 周年版首印有 20 张印错的牌，随盒附替换牌。BGG 玩家列出的编号都在 A 牌堆（A145、A146、A148–A154 等）；Hanno Girke 说只有送往 SPIEL Essen 的 100 盒没附替换包。见 [BGG 帖 2994811](https://boardgamegeek.com/thread/2994811)、[BGG 帖 3036428](https://boardgamegeek.com/thread/3036428)，**社区线索**。没有资料显示 X-Deck 在其中。
- [X-Deck 产品页 FAQ](https://www.lookout-spiele.de/en/games/agricola_xdeck.html) 只针对原版：问原版能否配修订版，回答“Yes-ish”，提醒新旧版混用可能出问题，只建议“professionals”这样做。德文页回答“Nur bedingt”。这说明原版牌面不能直接代表 2022 规则。**官方裁定（针对原版）**。

社区线索（不是官方裁定）：

- X03：2022 年 12 月玩家转引 2022 英文 X03 全文，括号句为“(Food, building resources, and animals are all considered goods.)”。2022 版编辑 Grzegorz Kobiela 回复作物括号里漏写是“Just an oversight”。见 [BGG 帖 2990858](https://boardgamegeek.com/thread/2990858/article/41362637#41362637)。
- X10、X12：日本玩家指出日文官方版 X10、X12 与英德文意思不同。Geoff Burkman（Legen\*dairy Forest 设计者之一，不是 X-Deck 设计者）回复认为是日文误译：Replicator 按实际取得数量加倍；Furry Friends 只有没喂的才逃走。见 [BGG 帖 3027136](https://boardgamegeek.com/thread/3027136)。该帖转引了 X10、X12 的英文句子；发帖人说他先把英德文自行译成日文，再与日文版对照。转引句未经核实，牌面原文须由 #1546 另行确认。

## 七、与原版（2008）的差异

原版：2008 年 10 月随德国 *Spielbox* 杂志发行德文版，同年 Lookout 发行英文版、Stratelibri 发行意大利文版；2009 年有法文（Lookout / Ystari）、捷克文（MINDOK）、繁体中文（Swan Panasia）版；2010 年收入 *Agricola: The Goodies Expansion*。（[BGG 条目 38733](https://boardgamegeek.com/boardgame/38733/agricola-x-deck)，社区线索；2022 附录也写“originally published in 2008”，官方规则。）以下对照只作旁证。

| 项目 | 原版（2008） | 2022 |
| --- | --- | --- |
| 改写 | — | 附录：“The cards in this edition have been reworded to comply with the changes made in revised Agricola.” |
| 人数 | X-Deck 产品页 1–5 人。 | 周年版 1–4 人。 |
| 触发 | 执行阶段 II“1 Stein”行动时抽牌（“diese Aktion durchführt / takes this action”）；排除阶段 IV 的“1 Stein”。 | 英文改为取石之后抽牌，德文为使用西采石场、取石之后抽牌；明文排除东采石场；新增“reveal it to all players”。 |
| 牌堆名 | Alien-Deck / Alien Encounter Deck (X Deck) | X deck / X-Deck |
| 物品去处 | 放在已打出的次要发展旁 | 放在已打出的牌旁 |
| 职业去处 | 放在已打出的职业旁 | 放在已打出的牌旁 |
| 事件 | “manche bei Spielende”（有些在游戏结束时） | “some during scoring / bei der Wertung” |
| 组件 | 无专用标记，规则单建议用硬币或骰子代替 X12 Raumwusel、X17 Bonbons | 3 燃料罐、1 草叉、13 太空毛球、12 糖果、12 烧毁木房间 |
| 逐卡注释 | X01（作物堆定义）、X03（可立即把动物换成食物）、X05（德文牌面漏印 2 食物）、X12、X17（替代标记）、X18（“孩子”指第 3–5 名家庭成员；已有 5 人不能使用）、X20、X21（“若你的小屋烧毁，家人露宿到你翻修成新的木屋为止；若不翻修，废墟格在游戏结束时视为未使用”）、X22（可选择下一轮才出现的行动格） | 只保留 X01、X18、X20、X21 四条；X03、X05、X22 的注释消失；X18 只剩“已有 5 人不能使用” |
| 牌名 | X14 英文“Earth Girls Are Easy”、德文“Erdenmädels sind einfach zu kriegen” | X14 英文“Earthlings Are Easy”、德文“Erdlinge sind einfach zu kriegen” |
| 版式 | 全部绿底；行动格印“Action Space”；物品为六边形画框；X23 为独有的农场板块样式 | 按类别分色（X06 红框、X19 与 X20 蓝框、X01 行动格版式），右侧印“X”圆章与类别图标 |

来源：[原版德文规则单](https://www.lookout-spiele.de/upload/en_agricola_xdeck.html_AgricolaXDeck-Regeln-DE_V1.pdf)、[X-Deck 英文产品页](https://www.lookout-spiele.de/en/games/agricola_xdeck.html)、[BGG 图 420914](https://boardgamegeek.com/image/420914)、[420922](https://boardgamegeek.com/image/420922)、[420923](https://boardgamegeek.com/image/420923)。设计者 Melissa Rogerson 2008 年在 BGG 上传的“Official rules sheet to go with your X Deck”（[BGG 文件页 35951](https://boardgamegeek.com/filepage/35951/official-rules-sheet-to-go-with-your-x-deck)）需要登录下载，本次未读取。

原版牌面中与歧义候选相关的旁证（只作旁证，不代表 2022 措辞）：

- X08（2008 英文）：“Place three Guest markers on this card. At the start of the Returning Home phase of any Round, before players take back their Family members, you may move one marker from this card to take any unused action. *(You receive a total of 3 additional actions)*.” 印 -3 分。
- X14（2008 英文）：“Immediately carry out the Family Growth even without Room in your Home action.” 原版没有任何关于西采石场的句子。
- X21（2008 英文）：“Flying saucers visit each farm. Their jets accidentally burn down all Wooden rooms, harden all Clay rooms to Stone rooms and have no effect on Stone rooms. *(Any player who is left with no hut can "renovate" to a 2-room Wooden hut for 2 Wood and 1 Reed)*”

## 八、人数适用性与组合

| 组合 | 来源能确认的内容 | 未提及 |
| --- | --- | --- |
| 人数 | 周年版盒子与英、德、日产品页都标 1–4 人；原版产品页标 1–5 人。X-Deck 一节没有人数限制，也没有按人数移除牌的规定。 | X-Deck 在单人或 5–6 人局的特殊规则，**未提及**。 |
| 单人 | [规则书 p.12](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=12)：单人按 2 人规则逐回合进行；“If you like, you can choose your hand cards and even the order in which the action space cards enter play.” 单人局可自选行动格牌进场顺序，因此西采石场和外星人到来的轮次可以由玩家决定。**官方规则**。 | 涉及“左手边玩家”“其他玩家”的牌（例如 2008 版 X10 传给左手边、X16 替他人放人、X18 收养他人孩子）在单人局如何结算，**未提及**。 |
| Legen\*dairy Forest | 两副牌在同一附录的相邻两节，各有独立的准备与触发规则。Legen\*dairy Forest 一节称事件牌型“first introduced in the X deck”。 | 两副牌能否同局，**未提及**（没有允许，也没有禁止）。BGG 有玩家 2011 年 2 月上传的 G、X、L\*d 三副旧版牌同局照片（[BGG 图 921470](https://boardgamegeek.com/image/921470)），只是**社区线索**。 |
| LE01–LE04 | FAQ：LE 事件是开局随机选一张公开、影响所有玩家；“这类牌由 X-Deck 首创”。**官方裁定**。 | 与 X-Deck 同局，**未提及**。 |
| Farmers of the Moor | FAQ 称周年版可与 Moor 扩展同玩（一般兼容）。 | Moor 与 X-Deck 的逐卡关系（例如农场地形与 X23、X21、X07 的关系，马匹与 X19、X20），**未提及**。 |
| Through the Seasons | 附录 p.10：“You can play this variant with the base game alone or any combination of the base game and its various expansions, including Farmers of the Moor.” 附录称 X-Deck 为“a not-entirely-serious mini expansion”。春季每个石头累积格 +1 石，夏季 −1 石，因此夏季西采石场可能为 0 石。**官方规则**。 | “expansions”是否包括 X-Deck 这类迷你牌堆，以及零石时是否触发，**未提及**。 |
| Parent Cards、选牌与轮抽、Moor Balance Rules | 没有找到任何官方文字。附录的 Drafting 一节只针对手牌（职业与次要发展），X-Deck 牌不是手牌。 | **未提及**。 |
| 5–6 人扩展 | FAQ 一般兼容。 | 不在地图范围内，只记录。 |

## 九、尚未解决的问题

以下问题在所查官方来源中没有唯一答案，按地图分工交 [#1548](https://github.com/titanxxh/open-agricola/issues/1548) 裁定，或交 [#1546](https://github.com/titanxxh/open-agricola/issues/1546) 从牌面核对。凡采纳的答案若无唯一出版依据，须标为 Project Rule Interpretation。

| 领域 | 问题 | 去向 |
| --- | --- | --- |
| 触发口径 | 英文“after you collect stone from”与德文“nutzt”（按德文术语表须放人）不一致；零石（Through the Seasons 夏季可发生）是否触发；卡牌额外给的石头是否计入；经其他卡牌或效果使用西采石场或从中拿石头是否触发；卡牌允许只取部分石头时是否触发；同一行动多次取石如何计次。 | #1548 |
| 时点 | 翻牌与其他“取物后”效果的先后；事件在当前行动中途结算还是行动结束后结算。 | #1548 |
| 牌堆生命周期 | 牌堆耗尽；是否有牌洗回（通则未提及，单张牌面待核）；事件牌结算后的去处。 | 牌面交 #1546，规则交 #1548 |
| 行动格 | 抽到当轮能否使用；英文“by any person”与德文“mit einer Person”的差异是否有规则含义。 | #1548 |
| 商人 | X04、X05 的 2022 英文措辞；X06 只写“use the "Fencing" action space”，其他建栅栏途径是否算；同一行动能否同时买多个商人；无人购买的商人在终局如何处理；成交后的牌是否算已打出的牌。 | X04、X05 牌面交 #1546，其余交 #1548 |
| 物品与职业 | 是否付费；是否算打出次要发展或职业，是否触发相关效果、是否计入数量条件；X24 的人数标记在 1–2 人局如何处理（若牌面为 1+ 则无此问题）。 | 牌面交 #1546，规则交 #1548 |
| 事件 | 持续事件的牌留在哪里；事件效果的施加对象。 | 牌面交 #1546，规则交 #1548 |
| X21 | 英德附录澄清冲突：“unused”是一直适用还是只在计分时适用；重建条件是“rebuilt”还是“搬进新木屋 / 翻修”；“翻修”是占用翻新行动格还是只执行翻修动作。 | 英文牌面交 #1546 / #1547，规则交 #1548 |
| X23 | 附录归为事件；2022 牌框与事件标记有待从牌面记录。 | #1546 |
| 人数与组合 | 单人局中涉及其他玩家的牌；单人自选行动格顺序对外星人到来轮次的影响；与 Legen\*dairy Forest、LE01–LE04、Parent Cards、选牌与轮抽、Farmers of the Moor（含农场地形）、Moor Balance Rules、Through the Seasons 的组合。 | #1548 |

## 交接

本研究确认了 2022 版 X-Deck 的张数、五类构成（X23 属事件）、英德名称、组件、准备、触发规则、各类牌抽到后的去处与四条逐卡澄清，并找到 X01、X06、X19 三张完整 2022 英文牌面与 X20 的出版社图片局部。英德附录在触发句、行动格句和 X21 澄清上措辞不同；附录未提及的事项都列在第九节，没有写成禁止。后续决策不应把原版（2008）牌面与规则、BGG 论坛回复、评测或第三方实现当作 2022 官方裁定。
