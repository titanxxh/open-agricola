# Legen*dairy Forest 2022 版出版规则研究

研究日期：2026-10-31。目标版本：Lookout Games 2022 年《Agricola 15》周年版（Agricola 15 / 15 Years of Agricola）。仓库基线：`d1570f66c`。

本报告回答 [#1527](https://github.com/titanxxh/open-agricola/issues/1527) 的事实调查，并按 [#1535](https://github.com/titanxxh/open-agricola/issues/1535) 补入 26 张中文贴条实物牌图的转录与对照，按 [#1536](https://github.com/titanxxh/open-agricola/issues/1536) 补入 08、19、22 的英文实物牌原文，属于地图 [#1526](https://github.com/titanxxh/open-agricola/issues/1526)。报告只记录出版来源能确认什么、不能确认什么，不采纳 Project Rule Interpretation，也不核对本仓库代码能力。为避免与 `forest` 行动格（3 木累积格）和 Farmers of the Moor 的农场森林地形混淆，本文称本扩展时一律用全称 Legen*dairy Forest。

## 证据等级

由强到弱排列；“官方裁定”与“官方规则”同属出版社文字，按问题类型使用。

| 标记 | 含义 |
| --- | --- |
| **官方规则** | Lookout 2022 年出版的规则书、附录或出版社官网文字。 |
| **官方牌面** | 2022 版牌面原文。出版社官网图片直接标为“官方牌面（出版社图片）”；第三方拍摄的 2022 版实物照片标为“官方牌面（社区照片）”，用户提供的实物照片标为“官方牌面（用户实物照片）”，内容都是官方印刷品，但来源和清晰度另行说明。日文版由 Hobby Japan 出版，日文牌面是 2022 版的官方译本，不是英文原文。 |
| **官方裁定** | 出版社 FAQ 或勘误。 |
| **中文贴条实物牌图** | 本机 BGA 参考快照中的 26 张牌图（下称“中文牌图”，见第七节）。版式、牌号、图标、人数标记和分值与 2022 英文实物牌一致（已用 01–03、09、15、16、25、26 对照），文字区是中文译文，译者与出版方不明。强于旁证（2010）和日文残片，但仍是译文，弱于英文官方牌面；与日文官方译本同为译文，两者冲突时不能单独定案。 |
| **社区线索** | BGG 论坛、评测、BGG 条目元数据等。包括设计者或出版社编辑的个人论坛回复：它们是有价值的线索，但不是出版社 FAQ 或勘误，本文不把它们升级为官方裁定。 |
| **旁证（2010）** | 2010 原版 24 张牌和规则单的内容。原版已按修订版规则改写，只能在 2022 文本有歧义或缺失时作旁证。 |

“未提及”表示所查来源没有相关文字；“禁止”只在来源明文禁止时使用。本报告没有把任何“未提及”写成“禁止”。

## 来源与局限

| 来源 | 本文用途 | 局限 |
| --- | --- | --- |
| [英文附录第 12–13 页](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=12)（16 页 PDF，创建于 2022-05-12） | 组件、准备、触发规则、五类牌的处理方式、26 张牌的编号与英文名、逐卡澄清。已用 `pdftotext -layout` 提取并渲染第 12–13 页人工核对排版和图标。 | 附录只列牌名和部分澄清，不印完整牌面效果。 |
| [英文附录第 2 页](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=2) | “Card Categories”：八种类别图标的含义，用于识读牌面右侧小圆图标。 | 只说明类别，不改变牌面效果。 |
| [德文附录第 12–13 页](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=12)（创建于 2022-05-05） | 德文牌堆名、牌名、组件名；与英文附录对照。 | 与英文附录有几处措辞差异，见下文。 |
| [英文规则书](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf)（12 页） | 第 2 页组件表（“26 [树形图标] deck cards”）、职业人数标记、累积格、单人规则、牌面图标含义、“Basic Wish for Children”进场轮次。 | 基础规则只定义被修改的基础术语，不回答本扩展的逐卡组合。 |
| [英文产品页与 FAQ](https://www.lookout-spiele.de/en/games/15yearsofagricolaanniversarybox.html) | 发行年份、1–4 人、FAQ 四问。 | FAQ 没有任何 Legen*dairy Forest 专项问答。用 `curl` 访问被 CDN 拒绝，正文经 WebFetch 读取。 |
| [英文官网卡牌拼图](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png)、[德文官网卡牌拼图](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_GalleryImage_3.png) | 09 号牌的完整英文、德文牌面。已下载原图裁切核对。 | 拼图中只有一张本扩展的牌。 |
| [英文盒背](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.jpg)、[德文盒背（BGG 图 6928314）](https://boardgamegeek.com/image/6928314) | 牌堆在盒背上的正式名称。 | 只给名称和宣传语。 |
| [2010 原产品页](https://www.lookout-spiele.de/en/games/agricola_legendary.html) | 2010 版 24 张、1–5 人；FAQ 关于新旧版混用。 | 只适用 2010 版。 |
| [BGG 条目 83697](https://boardgamegeek.com/boardgame/83697/agricola-the-legendairy-forest-deck)、[Agricola 15 条目 359999](https://boardgamegeek.com/boardgame/359999/agricola-15) | 版本、包含关系、两张促销卡的 BGG 条目、图库与论坛索引。通过 geekdo API 读取。 | 社区维护的元数据。 |
| [BGG 图 8137340](https://boardgamegeek.com/image/8137340)（2024，Agricola 15 图库） | 2022 版 15、16、26 号英文牌面，清晰可读，三张牌的正面完整入镜。 | 社区照片，只有三张。 |
| [BGG 图 7254823](https://boardgamegeek.com/image/7254823)，出自 [Silver Duck 评测](https://boardgamegeek.com/blogpost/142069/agricola-15-agricola-x-and-legendairy-forest-deck)（2023） | 2022 版 25、01、02、03 号英文牌面。 | 原图只有 567×211 像素，放大后可读但不保证每个字符；评测正文本身只是社区线索。 |
| [日文开箱博客](https://boardgame-replay.com/archives/unboxing-agricola15-230614.html)（2023）、[Hobby Japan 产品页](https://hobbyjapan.games/agricola_15th_ann/) | 日文版 13、14、22 号完整牌面和其余牌的残片；日文牌堆名。 | 社区照片，多数牌被相互遮挡；日文是译本。 |
| 用户提供的 2022 英文实物牌照片（2026-10-31，本机 `/home/xxh/legendairy-forest-2022-photos/`） | 08、19、22 号完整英文牌面，正面完整入镜，全部文字可读。 | 本机照片，不是公开链接，不提交仓库；只有三张。 |
| [BGG 图 841493](https://boardgamegeek.com/image/841493)、[2010 规则单正面](https://boardgamegeek.com/image/849711)与[背面](https://boardgamegeek.com/image/849713) | 2010 版 24 张英文牌面和规则单全文。 | 只作旁证（2010）。 |
| BGG 论坛帖（逐条链接见下文） | 设计者、出版社编辑和玩家的回复。 | 社区线索。2010 年代的回复针对旧版牌面。 |
| 本机 BGA 参考快照 `/home/xxh/bga-agricola/.worktree/agricolag-snapshot-20261027`（commit `289b951b`）的 `img/narrative/FE01_Narrative.png`–`FE26_Narrative.png` | 26 张中文牌图，逐张转录于第七节。每张约 385×588 像素，裁切放大后全部文字可读。 | 本机快照，不是公开链接；牌图来源与版权不明，本仓库只转录文字，不复制图片。`FE18_illustration-v2.png`、`FE19_illustration-v2.png` 是插画，不是牌面；`XE*` 属 X-Deck，不在范围内。 |
| 同快照 `modules/php/Helpers/NarrativeDefinitions.php` | 每张牌的中文 `desc`、类型、洗回与分值字段，只作对照。 | 文件头注释写明来源为“user workbook and Lookout 15-year appendix”，不是牌图；与牌图不一致处见第八节。快照中的实现代码（`NarrativeDecks.php` 等）是第三方规则取舍，本文不评价，也不当作官方裁定。 |

没有找到出版社发布的 2022 版完整牌面扫描、逐卡 FAQ 或勘误。没有找到简体或繁体中文出版物；中文牌图的译者与出版方不明。

## 结论速览

- 2022 版牌堆共 **26 张**：11 张事件、4 张职业、5 张次要发展、1 张主要发展、5 张行动格。比 2010 版 24 张多出 25 号 Chuck the Wood Chuck 和 26 号 Peruvian Inquisition，二者原是 2010 和 2012 年的促销卡。**官方规则**，[英文附录 p.12–13](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=12)、[规则书 p.2](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=2)。
- 触发：每次从**任意累积格**取得**至少 3 木**，必须同时抽牌堆顶 1 张并向所有玩家公开；非木累积格上因其他效果（例如卡牌）放了至少 3 木也适用；同时取得的其他货物不影响。**官方规则**。
- 职业、次要发展、主要发展被抽到时，“放在你面前，与已打出的牌放在一起”；附录没有提到支付费用、职业学费或是否算作“打出”。26 张中文牌图都没有费用栏，16 号与 22 号（次要发展）的英文实物牌也没有。**官方规则 / 官方牌面 / 中文贴条实物牌图**。
- 中文牌图补齐了 26 张的 2022 完整文本，其中 04–08、10–12、17–21、23、24 这 15 张此前没有 2022 完整牌面。与 08、09、15、16、19、22、26 的英文全文及 01–03、25 的低清英文逐句对照，意思一致；与 13、14 的日文全文一致。22 号日文版的“連続”（连续）在英文原文中没有对应词。
- 牌面解答了以下问题：18 号替换第 5–7 轮进场的“希望增加家庭成员”，即规则书的 Basic Wish for Children；行动格牌中只有 18 号写替换；19 号烧毁的格与 20 号放了妖精的格都“视为已使用”；20 号并列最多者都得 5 分；23 号的窥牌能力；04 号是正式的“无需空房间的家庭增长”，不算新生儿，下一次收成供养后归还，且不洗回；12 号洗回。
- 08、19、22 已由用户实物照片确认英文原文，与中文牌图逐句一致。三张的待定问题来自英文原文本身：08 没写并列指哪一方、“you”指谁；19 没写抽次要发展的来源、烧格与被移除职业由谁选择；22 没有“连续”，日文版的“連続”是译本增补。均交 #1528，见第八节。**官方牌面（用户实物照片）**。
- 出版社 FAQ 只有一般兼容声明（Farmers of the Moor、5–6 人扩展），没有本扩展的逐卡裁定，也没有找到勘误。**官方裁定**。

## 一、名称与术语

| 对象 | 名称 | 来源与等级 |
| --- | --- | --- |
| 英文牌堆名 | **The Legen\*dairy Forest Deck** | 2022 英文盒背，**官方规则**（出版物） |
| 英文附录标题与简称 | “The Legen-dairy [树形图标] Deck”；正文简称“the [树形图标] deck” | 英文附录 p.12–13，**官方规则** |
| 规则书组件表 | “26 [树形图标] deck cards” | 英文规则书 p.2，**官方规则** |
| 德文牌堆名 | **Das legendäre Tannenbäumchen-Deck**；附录写作“Das legendäre [树形图标]-Deck”，正文“[树形图标]-Deck” | 德文盒背、德文附录 p.12，**官方规则** |
| 日文牌堆名 | 「レジェン\*デイリー フォレストデッキ」 | Hobby Japan 产品页，官方日文版（2023 年 2 月发售） |
| 西班牙文牌堆名 | “Mazo El bosque legend-agrario” | 西班牙文版盒背照片 [BGG 图 9342763](https://boardgamegeek.com/image/9342763)，官方印刷品的社区照片 |
| 俄文 | 盒背组件表写“26 карт легендарной колоды” | [BGG 图 9376617](https://boardgamegeek.com/image/9376617)，社区照片 |
| 中文 | **未找到官方中文名称**。中文牌图只有逐张牌名，没有牌堆名；23 号正文用“[树形图标]牌库”指本牌堆。 | BGG 为 Agricola 15 列出“Simplified Chinese edition”和“Traditional Chinese edition”两个版本条目，但没有产品名、出版社以外的信息或图片。社区视频与资讯只用“农场主15周年纪念版”指整盒，没有牌堆译名。 |
| 2010 版名称 | 规则单“The legen\*dairy [树形图标]-Deck”；2010 产品页标题“Legen\*dary-Deck”、描述“Legen\*dairy Forest Deck”；德文“Tannenbäumchendeck” | 旁证（2010） |

牌的编号：2022 牌面左上角（行动格牌在左下角）为树形图标加两位数字（例如“[树形图标] 09”），附录同样用树形图标加 01–26，没有字母前缀。**官方规则 / 官方牌面 / 中文贴条实物牌图**。

牌类型的官方叫法（英 / 德附录）：Events / Ereignisse；Occupations / Ausbildungen；Minor Improvements / Kleine Anschaffungen；Major Improvement / Große Anschaffung；Action Spaces / Aktionsfelder。

牌面上的类型标记（据中文牌图；事件、次要发展、职业、主要发展的版式与英文照片一致，行动格没有英文照片可比）：事件在牌号下方印“!”；次要发展为六边形画框、无“!”；职业为圆形画框、拱形标题，左侧印人数方框；主要发展为红色边框；行动格为整幅绿色画面加羊皮纸文字框，牌号竖排在文字框左下。除行动格外，牌面右侧都有树形圆章；所有 26 张都有一个小圆章，是附录 p.2 定义的类别图标（行动格印在文字框右下）：井字＝Farm Planner、人形＝Actions Booster、圆中方块＝Points Provider、篮子＝Goods Provider、刀叉＝Food Provider、麦穗＝Crop Provider、铲形＝Building Resource Provider、马蹄铁＝Livestock Provider。**官方规则 / 中文贴条实物牌图**。

组件的官方叫法（英 / 德附录）：12 torched farmyard spaces / 12 abgebrannte Hoffelder（19 号用）；7 “one fairy” markers / 7 Marken „1 Fee“ 与 14 “two fairies” markers / 14 Marken „2 Feen“（20 号用）；3 scry counters / 3 Hellsichtmarken（23 号用）；8 llama markers / 8 Lamamarken（26 号用）。中文牌图分别称“烧毁”的农场格子、“妖精”、“占卜标志”、“羊驼”。

## 二、通则

以下引文出自[英文附录 p.12–13](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=12)，等级均为**官方规则**，另有标注者除外。

| 问题 | 来源能确认的内容 | 未提及或有歧义 |
| --- | --- | --- |
| 准备 | 洗匀整副牌，面朝下放在版图旁；特殊标记放在牌堆旁备用。 | 2022 附录没有开局公开、开局抽牌或按人数移除牌的规定。 |
| 触发条件 | “Each time you collect **at least 3 wood** from any accumulation space, you **must also** draw the top card of the deck and reveal it to all players.” 恰好 3 木满足“at least 3”。 | “collect”只在累积格语境下定义。 |
| 非木累积格上的木 | “This also applies to non-wood accumulation spaces that contain at least 3 wood from another effect (e.g., via a card).” | 只说格子上“含有”至少 3 木；没有说明格上木头少于 3、但卡牌另给木头凑满 3 的情况。 |
| 同时取得其他货物 | “It does not matter whether you get other goods from the accumulation space beside wood.” | — |
| 卡牌额外奖励的木 | **未提及**。规则文字只覆盖从累积格取得的木。25 号 Chuck the Wood Chuck 从公共供应额外给 1 木、15 号 The Noble Knight 在 Fishing 额外给 2 木，是否计入 3 木没有说明。2010 年设计者 Geoff Burkman 在论坛回答“只有行动格累积的 3 木才触发，次要发展给的不算”（[BGG 帖 660800](https://boardgamegeek.com/thread/660800)），属**社区线索**且针对 2010 版。 | 待 #1528 裁定。 |
| 农场森林地形等非累积格来源的木 | 规则文字限定“accumulation space”，Farmers of the Moor 农场森林取木不在该文字范围内。 | 附录没有专门讨论，属**未提及**，不是明文禁止。 |
| 每次翻几张 | “draw the top card”，即 1 张。 | 一次行动从多个累积格各取至少 3 木、或同一累积格被多次取用时如何计次，**未提及**。 |
| 翻牌时点 | “must also draw”。X 牌堆同页写的是“Each time **after** you collect stone”，本扩展没有“after”。 | 抽牌相对取物、相对其他取物反应（卡牌 listener）的先后，**未提及**。 |
| 公开范围 | 向所有玩家公开（reveal it to all players）。 | — |
| 事件结算 | “When an event card is drawn, it is resolved immediately. Events may be good or bad; you may not choose to ignore an event.” | — |
| 洗回 | “Some events are shuffled back into the deck and may reappear later in the game.” 中文牌图上印有“将本卡牌洗回牌库。”的是 06、07、08、10、12 五张事件；23 号次要发展在占卜标志用完时洗回（见下行）。**中文贴条实物牌图**。2010 版另有 04 号洗回，2022 中文牌图和日文残片都没有该句。 | 洗回是整副重洗还是插入，2022 来源**未提及**；2010 年设计者论坛回复为整副重洗（[BGG 帖 660800](https://boardgamegeek.com/thread/660800)，**社区线索**）。 |
| 牌堆耗尽 | **未提及**。 | 待裁定。 |
| 窥牌 | 23 号 The Witch（中文牌图）：立即归还 1 木到公共供应堆，在牌上放 3 个占卜标志；任何时候可移除 1 个标志，查看本牌库顶 3 张并以任意顺序放回；标志用完时将此牌洗回牌库。**中文贴条实物牌图**。附录列出 3 个 scry counters。 | 抽到时没有木材怎么办，**未提及**。 |
| 出牌者 | 附录对职业与发展写“When you draw ..., place it face up in front of you”，即归抽牌玩家。 | — |

## 三、自动获得的职业与发展

| 问题 | 来源能确认的内容 | 未提及 |
| --- | --- | --- |
| 获得方式 | 职业：“When you draw an occupation, place it face up in front of you, with your played cards.” 次要发展：“These are things you found in the forest. When you draw a minor improvement, place it face up in front of you, with your played cards.” 主要发展同样处理。**官方规则**。 | 是否支付建造费用或职业学费，**未提及**。26 张中文牌图都没有费用栏，16 号英文照片整张入镜也没有费用栏。**中文贴条实物牌图 / 官方牌面（社区照片）**。 |
| 是否触发普通出牌相关效果 | — | 是否算“打出职业 / 建造发展”、是否触发“每当你打出职业”之类的效果、是否占用发展或职业数量限制，**未提及**。 |
| 计分 | 牌面印有分数的照常计分：16 号印 1 分，03 号印 -3 分（英文照片与中文牌图一致）。18、20 号行动格给“奖励分数”。 | 是否计入其他“按职业 / 发展数量计分”的效果，**未提及**。 |
| 人数标记 | 2022 职业印有人数标记：13 Revenant 为蓝色 **3+**（中文牌图、日文版照片），14 Werewolf、15 The Noble Knight、25 Chuck the Wood Chuck 为紫色 1+（中文牌图；15 另有英文照片，14 另有日文照片）。其他类型的牌没有人数标记。[规则书 p.3](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=3) 说明 [1+] 指 1–4 人、[3+] 指 3–4 人，不符合人数的牌放回盒中，语境是发手牌。 | 本扩展的 3+ 职业在 1–2 人局是否移出牌堆，**未提及**。 |
| 主要发展图标 | 16 号左下角有锅形图标。[规则书 p.10](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=10) 说明凡能把动物和蔬菜换成食物的牌在左下角有此图标；规则书另说明持有带此图标的发展可把从累积格取得的动物直接换成食物。**官方规则**。16 号英文与中文牌面只有兑换图标，没有“任何时候”之类的时机文字。 | 兑换时机、该牌是否计入主要发展相关的数量条件、其他玩家能否另行获得，**未提及**。 |

## 四、公共行动格

- “These cards are placed face up beside the game board; except in one case, the drawn action space replaces an existing one. They are normal action spaces and can be used by any person, according to the usual placement rules.” 英文附录，**官方规则**。
- 德文附录同一段没有“除一个例外外替换现有行动格”这一句，只说放在版图旁、按常规规则使用。英德文本在这里不一致。**官方规则**。
- 中文牌图上只有 18 号写“它替代……行动格”；17、19、20、21 号只写“本卡牌是一个所有玩家均可使用的行动格”，没有替换任何行动格。2010 版牌面也只有 Warrior Princess 写替换。牌面、德文附录与 2010 一致：只有 18 号替换现有行动格。英文附录的字面读法（除一个例外外都替换）与牌面冲突，且没有指出替换对象。**中文贴条实物牌图 / 官方规则 / 旁证（2010）**。
- 18 号的替换对象：中文牌图写“它替代在第5轮至第7轮进场的‘希望增加家庭成员’行动格”。[规则书 p.7](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=7) 写明第 5、6 或 7 轮进场的是阶段 2 的“Basic Wish for Children”，“Urgent Wish for Children”在第 12 或 13 轮进场。因此替换的是 Basic Wish for Children。附录澄清：“If the ‘Wish for Children’ action space is not in play when this card is revealed, it will never come into play.” 2010 版牌面同样写第 5–7 轮出现的“Family Growth”或“Family Growth + Minor Improvement”。**中文贴条实物牌图 / 官方规则**。
- 被替换时已有人员如何处理：2022 版编辑 Grzegorz Kobiela 在 BGG 回答“Any people already on the space are unaffected.”（[BGG 帖 3149754](https://boardgamegeek.com/thread/3149754)，2023），属**社区线索**。
- 资源、累积物在替换时如何处理、行动格与轮次牌的编号关系、行动格牌的占格能否在当轮使用，**未提及**。

## 五、附属组件与特殊机制涉及的牌

“已确认的 2022 内容”一栏写已核实的 2022 版内容；中文牌图全文见第七节。

| 类别 | 涉及的牌（2022 编号） | 已确认的 2022 内容 | 主要空白 |
| --- | --- | --- | --- |
| 借用他人人员 | 10 A Midsummer Night's Dream | 中文牌图：本轮回家阶段每位玩家把自己 1 个家庭成员给左手边的玩家；下一轮该玩家必须按规则放置它，行动格的好处归该家庭成员的持有者；该轮回家阶段归还给“正确的持有者”。洗回。附录澄清：“You decide when to place the other player's person.” 2010 版同义（left neighbour；owner gets the effect）。 | “持有者”在牌中指所有者（与“正确的持有者”和 2010 一致）。借用人员占用借用者的哪个回合、单人局如何处理，未提及。 |
| 额外、临时或移除人员 | 03 The Unicorn, Pt. 2；04 Feral Child；11 French Castle；13 Revenant；17 Land of Milk and Honey；18 Warrior Princess；19 Dragon's Lair；24 Camelot | 03：抽到时立即执行一次“无需空房间的家庭增长”，即使无法执行，-3 分仍保留（英文低清与中文一致）。04（中文）：立即执行一次“无需空房间的家庭增长”，本轮即可放置，不算新生儿，下一次收成的供养步骤后归还到供应堆；附录：已有 5 人时无事发生，也不必归还。11（中文）：得 3 食物 3 石，跳过下一个回合，“不会失去该回合，只是延后”。13（中文、日文）：此牌为 1 名家庭成员提供房间；从下一轮起最后一名家庭成员须等其他玩家全部放完才能放，并可依次使用 2 个不同行动格。17、18、19（中文）：回家阶段把你的 1 名家庭成员归还到供应堆（而不是回房屋）。24（中文）：为 1 名家庭成员、1 羊、1 野猪、1 牛、1 马和 1 羊驼提供空间；附录：可同时容纳 1 人和至多 5 种不同动物。 | 11 号延后到何时；17–19 号归还的是“你的一名家庭成员”而 2010 是使用此格的人员；13、24 号提供的空间是否计作房间；被移除人员能否经家庭增长重获（牌面只写归还到供应堆）。 |
| 新动物：羊驼 | 26 Peruvian Inquisition（8 个 llama markers） | 牌面全文（清晰照片，中文一致）：立即归还你所有的羊，获得同等数量羊驼；羊驼是新动物，照常繁殖；计分时**所有玩家**按 0/1–3/4–5/6–7/8+ 只计 -1/1/2/3/4 分。24 号 Camelot 可容纳 1 只羊驼；16 号可把羊驼换成 2 食物。 | 羊驼的饲养容量、宠物、交易与转换规则只有“breed as normal”。8 个标记是否是上限未提及。 |
| 新动物：妖精 | 20 Fairy Ring（7 个“一仙女”、14 个“两仙女”标记） | 中文牌图：行动格；立即放 2 个妖精，每轮准备阶段加 1 个；使用者取得牌上所有妖精；每个未使用的农场格子至多安置 2 个妖精，随后该格**视为已使用**；妖精的繁殖“和动物类似”；终局拥有最多妖精的**所有玩家**各得 5 点奖励分数。16 号可把妖精（蝴蝶图标）换成 2 食物。 | 妖精能否放在农场格以外、放不下时如何处理、“类似”动物繁殖的具体条件、无人拥有妖精时是否算并列，未提及。2011 年论坛对“是否 used”的分歧（[BGG 帖 603689](https://boardgamegeek.com/thread/603689)）已由牌面解答。 |
| 虚拟动物：独角兽 | 02 The Unicorn, Pt. 1 | 牌面（英文低清、中文一致）：游戏结束计分时和每次收成的繁殖步骤中，独角兽视为任意一种动物（用于繁殖和计分）。附录澄清：不占农场空间；是变形者，每个繁殖阶段和计分时都可重新选择；不能换成食物。 | 德文附录写“in jeder Ernte”（每次收获）而非“breeding phase”。能否选羊驼、马或妖精未提及。 |
| 其他与动物相关 | 05 The Hermit；07 The Boar King；14 Werewolf；16 The Fire Bog Flame Spurts Oven | 05（中文）：立即把所有羊归还公共供应堆，从公共供应堆取同等数量木材；附录：不能为响应此牌把羊换成食物。07（中文）：立即翻倍你的野猪；没有野猪则必须归还田里所有蔬菜；两者都没有可立即犁 1 块田；洗回。14（日文、中文）：每轮回家阶段前选自己 1 只动物归还公共供应堆，没有动物则选他人 1 只；该动物持有者随即可使用 1 个未被占据行动格的效果；附录：被选对手不能借此把动物换成食物；无人有动物则无事发生。16（清晰照片、中文）：羊 / 野猪 / 牛 / 马 / 羊驼 / 妖精 → 2 食物，印 1 分。 | 07 号翻倍后放不下的处理未提及（2010 为“野猪立即繁殖”）。 |
| 农场烧毁或封锁 | 19 Dragon's Lair（12 个 torched farmyard spaces）；20 Fairy Ring；24 Camelot | 19（英文实物照片，中文一致，英文全文见第八节）：行动格；使用时可执行下列任意数量的行动，每项任意次数：[羊]→龙烧毁你 3 个农场格子，这些格子**视为已使用**，且不能再以任何其他方式被使用（羊图标下画 3 个深色格标记）；[野猪]→抽取 2 张次要发展；[牛]→3 石；[马]→4 个火焰图标；[灰色人形]→将一名对手的一张职业从游戏中移除，并在回家阶段把你的 1 名家庭成员归还到供应堆。图标前没有数字；`desc` 写作“1羊→”等。 | 抽取次要发展的来源与去向、由谁选择烧毁哪些格（是否限未使用格、不足 3 格时）、由谁选择被移除的职业、火焰图标的含义，牌面均未写，见第八节。2023 年有玩家问“给牛得到的火焰符号是什么”，Hanno Girke 答为 Farmers of the Moor 的取暖物（[BGG 帖 3167678](https://boardgamegeek.com/thread/3167678)，**社区线索**）；中文牌图上牛换 3 石、马换火焰，提问与牌面不符。 |
| 特殊栅栏计费 | 22 Fences of Unusual Size | 英文实物照片：“Each time you build fences, you must pay only 1 wood for any number of fences that you build in one straight line.” 中文与英文一致；日文版写一条直线上**连续**的栅栏只需 1 木。附录：例如新建 3×3 牧场只需 4 木。 | 英文原文没有“连续”，也没写同一直线上不相连的几段如何计费，见第八节；“一条直线”是否可跨越已有栅栏，2010 年有玩家提问但没有得到设计者回答（[BGG 帖 583781](https://boardgamegeek.com/thread/583781)）；与其他栅栏减费、Through the Seasons 春季免费栅栏的叠加，**未提及**。 |

## 六、逐张牌面

“2022 牌面”一列：**英文全文**＝已读到完整 2022 英文牌面；**英文低清**＝2022 英文照片可读但分辨率低；**日文全文**＝日文版完整牌面；**中文**＝中文贴条实物牌图（26 张都有，见第七节）。2010 名称与 2022 不同时在旁证列注明。

| 编号 | 英文名（2022） | 中文牌图标题 | 德文名（2022） | 类型 | 2022 牌面 | 2022 要点 | 2010 旁证要点 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | The Lady of the Lake, Pt. 1 | 湖中仙女(第一部) | Die Dame vom See, Teil 1 | 事件 | 英文低清＋中文 | 立即犁至多 3 块田。 | 原名 The Lady of the Sea, Pt. 1；耕至多 3 个未使用格。 |
| 02 | The Unicorn, Pt. 1 | 独角兽(第一部) | Das Einhorn, Teil 1 | 次要发展 | 英文低清＋中文 | 见第五节。 | 原名 Meeting a Unicorn, Pt. 1。 |
| 03 | The Unicorn, Pt. 2 | 独角兽(第二部) | Das Einhorn, Teil 2 | 次要发展 | 英文低清＋中文 | -3 分；见第五节。 | 原名 Meeting a Unicorn, Pt. 2；“You have Family Growth without space in your home”。 |
| 04 | Feral Child | 野孩 | Das wilde Kind | 事件 | 中文 | 正式家庭增长、不算新生儿、收成供养后归还；不洗回。 | guest marker 至下一次收获，喂养后消失；洗回。 |
| 05 | The Hermit | 隐士 | Der Einsiedler | 事件 | 中文 | 羊全部归还，换同等数量木材。 | 交出所有羊，得等量木。 |
| 06 | The Lady of the Lake, Pt. 2 | 湖中仙女(第二部) | Die Dame vom See, Teil 2 | 事件 | 中文 | 拿起始玩家标记并保持到他人被宣称为国王；从此“广场”只提供 1 次“次要发展”行动；洗回。 | 获得起始玩家标记，直到其他人被宣布为王；起始玩家行动失去起始玩家效果；洗回。 |
| 07 | The Boar King | 野猪王 | Der König der Schweine | 事件 | 中文 | 野猪翻倍；否则归还田里所有蔬菜；都没有可犁 1 块田；洗回。 | 有野猪则野猪立即繁殖；否则毁掉已种蔬菜；两者都无则耕 1 个未使用格；洗回。 |
| 08 | Men in Tights | 绿林好汉 | Männer in Strumpfhosen | 事件 | **英文全文**（用户实物照片）＋中文 | “Immediately do the following for each type of building resource: The player who has the most of a resource must give one of that resource to the player with the least of it. In case of a tie, you must distribute the resources evenly or they are all forfeit to the "Men in Tights" player.” 洗回。分配细节有歧义，见第八节。 | 每种建材最多者失 1，最少者得 1；最少者平局时须平分，否则全归抽牌者；洗回。 |
| 09 | Noblesse Oblige | 贵族义务 | Adel verpflichtet | 事件 | **英文全文**（出版社图片，英德两版）＋中文 | “Immediately double the amount of grain in your supply. If you have no grain, instead double the number of vegetables in your supply. If you have neither grain nor vegetables, you immediately get 1 grain and 1 vegetable.” | 同义，旧措辞。 |
| 10 | A Midsummer Night's Dream | 仲夏夜之梦 | Ein Mittsommernachtstraum | 事件 | 中文 | 见第五节；洗回。 | 见第五节；洗回。 |
| 11 | French Castle | 法国城堡 | Burg der Franzosen | 事件 | 中文 | 3 食物 3 石；跳过下一个回合，但只是延后，不失去。 | 得 3 石 3 食物，失去下一次放人机会；设计者与 Hanno Girke 论坛回答为在顺序中被跳过（[BGG 帖 732720](https://boardgamegeek.com/thread/732720)，社区线索）。 |
| 12 | All Your Wood Are Belong to Us | 诸位的木头我们全部收下了 | All dein Holz sind gehören uns | 事件 | 中文 | 供应堆所有木材归还公共供应堆；田里已播种的谷物和蔬菜翻倍；洗回。 | 弃所有木，田里谷物和蔬菜数量加倍；洗回。 |
| 13 | Revenant | 亡魂 | Wiedergänger | 职业（3+） | 日文全文＋中文 | 见第五节。附录：始终把一人留在此牌上作提醒。 | 回家阶段把该成员放在此牌上，不再需要房间；每轮等其他人都放完，再用它执行 2 个行动。 |
| 14 | Werewolf | 狼人 | Werwolf | 职业（1+） | 日文全文＋中文 | 见第五节。 | “At end of turn”牺牲 1 只动物，获得 1 个额外行动；无动物则毁 1 名对手 1 只动物，对手获得该行动。 |
| 15 | The Noble Knight | 贵族骑士 | Der edle Ritter | 职业（1+） | **英文全文**＋中文 | “Each time you use the "Fishing" accumulation space, you get an additional 2 wood.” 附录：即使只捕到鲑鱼也得木。 | 同义。 |
| 16 | The Fire Bog Flame Spurts Oven | 火沼烈焰喷射烤炉 | Der Sumpfflammen-Eruptionsofen | 主要发展 | **英文全文**＋中文 | 见第五节；无费用栏，印 1 分。 | 按动物种类给不同食物的兑换表。 |
| 17 | Land of Milk and Honey | 丰饶之地 | Schlaraffenland | 行动格 | 中文 | 得 10 食物，回家阶段归还 1 名家庭成员到供应堆；不替换行动格。 | 使用后该人员移出游戏（之后可通过家庭成长重获），得 10 食物；不能用 guest marker。 |
| 18 | Warrior Princess | 战斗公主 | Kämpferische Prinzessin | 行动格（替换） | 中文 | 替换第 5–7 轮的“希望增加家庭成员”；得 5 点奖励分数，回家阶段归还 1 名家庭成员。 | 新行动：把使用的人员移出游戏，得 5 分；不能用 guest marker。 |
| 19 | Dragon's Lair | 龙之巢穴 | Drachenfeld | 行动格 | **英文全文**（用户实物照片）＋中文 | 见第五节；英文全文见第八节。 | 见第五节；规则单称一次来访可献上多只动物或多名成员（非 guest）。 |
| 20 | Fairy Ring | 妖精戒指 | Feenring | 行动格 | 中文 | 见第五节。 | 立即放 2 仙女，每轮开始加 1，使用者全部取走，每个未使用农场格可放 2 仙女，仙女像动物一样繁殖，终局仙女最多者得 5 分。 |
| 21 | The Road Not Taken | 未选之路 | Der Weg, den ich nicht nahm | 行动格 | 中文 | 把人放在牌的一边（画面一边画芦苇和石头，另一边画黏土）；回家阶段获得仍在累积格上的所有对应建造资源。英文附录：选芦苇＋石头一侧时两者都得。德文附录：得到相应累积格上的全部芦苇和全部石头。 | 把人放在牌的一侧，回合结束时收取版图行动格上残留的该类资源。 |
| 22 | Fences of Unusual Size | 特大栅栏 | Zäune von unnatürlicher Länge | 次要发展 | **英文全文**（用户实物照片）＋日文全文＋中文 | 见第五节；无费用栏；日文“連続”为译本增补，见第八节。 | 原名“FOUS Fences of Unusual Size”，同义。 |
| 23 | The Witch | 女巫 | Die Hexe | 次要发展 | 中文 | 见第二节“窥牌”。 | 原名 Meeting a witch；给老妇 1 木，放 3 个计数器，每移除 1 个可看牌堆顶 3 张并排序，最后一个移除时洗回。 |
| 24 | Camelot | 卡米洛 | Camelot | 次要发展 | 中文 | 见第五节。 | 2010 规则单：相当于 1 间额外房间加至多 5 个无围栏马厩，但计分时都不算。 |
| 25 | Chuck the Wood Chuck（附录拼作“Chuck the Woodchuck”） | 伐木工查克 | Horst, der Holzhacker | 职业（1+） | 英文低清＋中文 | “Each time you get wood as the only good from an action, you get 1 additional wood from the general supply.” | 2010 年促销卡（BGG 86457）。 |
| 26 | Peruvian Inquisition | 秘鲁宗教裁判所 | Die peruanische Inquisition | 事件 | **英文全文**＋中文 | 见第五节；不洗回。 | 2012 年促销卡（BGG 132590）。 |

逐卡来源：01–03、25 出自 [BGG 图 7254823](https://boardgamegeek.com/image/7254823)；09 出自[英文官网图片](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png)和[德文官网图片](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_GalleryImage_3.png)；15、16、26 出自 [BGG 图 8137340](https://boardgamegeek.com/image/8137340)；08、19、22 的英文出自用户实物照片（本机，未公开）；13、14、22 的日文全文与其他日文残片出自[日文开箱博客](https://boardgame-replay.com/archives/unboxing-agricola15-230614.html)；中文出自 BGA 参考快照 `289b951b` 的 `img/narrative/FE01–FE26_Narrative.png`；德文名与附录澄清出自[德文附录](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=13)；2010 旁证出自 [BGG 图 841493](https://boardgamegeek.com/image/841493) 和 [2010 规则单](https://boardgamegeek.com/image/849713)。25、26 已收入 2022 版由出版社编辑 Grzegorz Kobiela 在 [BGG 帖 3008181](https://boardgamegeek.com/thread/3008181) 确认（社区线索），并与附录编号一致（官方规则）。

## 七、中文牌图转录

来源：BGA 参考快照 `289b951b` 的 `img/narrative/FE01_Narrative.png`–`FE26_Narrative.png`，等级为**中文贴条实物牌图**。逐字照录牌面文字；标点宽度按图形近似录入；方括号内是对图标的描述，不是牌面文字。每张的属性行依次为：牌号位置、类型标记、人数标记、费用、分值、洗回句、类别图标。除 17–21 号行动格外，各牌都印有树形圆章，下文不再重复；26 张都没有费用栏。

**01 湖中仙女(第一部)**：左上“[树] 01”；事件（“!”）；无人数标记；无费用；无分值；无洗回句；类别 Farm Planner（井字）。  
风味：*在一片空地中央，你看到一个湖。湖中仙女给了你一把剑，你决定把它当犁头用。*  
正文：立即犁至多3块田。

**02 独角兽(第一部)**：左上“[树] 02”；次要发展（六边形画框）；无人数标记；无费用；无分值；无洗回句；类别 Livestock Provider（马蹄铁）。  
风味：*你遇见的独角兽赐给你一个愿望，而你能想到的只有牲畜。*  
正文：在游戏结束计分时和每次收成的繁殖步骤中，独角兽视为任意一种动物(用于繁殖和计分)。

**03 独角兽(第二部)**：左上“[树] 03”；次要发展；无人数标记；无费用；左侧圆形分值 **-3**；无洗回句；类别 Actions Booster（人形）。  
风味：*你想起了一个关于角的神秘力量的古老传说，并决定去获得它。即使杀死独角兽意味着会带来厄运。*  
正文：当你抽出本卡牌时，立即执行一个“无需空房间的家庭增长”行动。(即使你不能执行该行动，本卡牌上的负分依然保留。)

**04 野孩**：左上“[树] 04”；事件（“!”）；无人数标记；无费用；无分值；无洗回句；类别 Actions Booster。  
风味：*森林变成了丛林，而你看到在一头黑豹和一头唱着歌的棕熊旁有个野孩子。*  
正文：立即执行一个“无需空房间的家庭增长”行动。从本轮开始你就可以放置该新的家庭成员。其不算作新生儿。在下一次收成的供养步骤后，将该家庭成员归还到供应堆中。

**05 隐士**：左上“[树] 05”；事件（“!”）；无人数标记；无费用；无分值；无洗回句；类别 Building Resource Provider（铲形）。  
风味：*我有木头要换羊。*  
正文：立即将你所有的羊都给隐士(即将它们归还到公共供应堆中)并获得相同数量的木材(从公共供应堆拿取)。  
注：第一个右括号与“并”字粘连，印刷形似“丬并”，按上下文读作“)并”。

**06 湖中仙女(第二部)**：左上“[树] 06”；事件（“!”）；无人数标记；无费用；无分值；**有洗回句**；类别 Actions Booster。  
风味：*在一片空地中央，你看到一个湖。湖中仙女给了你一把剑并宣称你是这片空地的国王。*  
正文：拿取起始玩家标记，且直到有其他玩家被仙女宣称为国王为止，你保持起始玩家不变。从现在起，“广场”行动格仅提供一个“次要发展”行动。  
洗回：**将本卡牌洗回牌库。**

**07 野猪王**：左上“[树] 07”；事件（“!”）；无人数标记；无费用；无分值；**有洗回句**；类别 Livestock Provider。  
风味：*在你回家的路上，丛林之王跟着你。*  
正文：立即翻倍你拥有的野猪数量。如果你没有野猪，你必须改为归还你农田上的所有蔬菜。如果你既没有野猪又没有已播种的蔬菜，你可以立即犁1块田。  
洗回：**将本卡牌洗回牌库。**

**08 绿林好汉**：左上“[树] 08”（数字字形左右颠倒，看似镜像；按牌序和画面读作 08）；事件（“!”）；无人数标记；无费用；无分值；**有洗回句**；类别 Building Resource Provider。  
风味：*突然，从灌木丛里窜出一些人，全都一身绿。*  
正文：立即对每种建造资源进行如下操作：拥有最多该资源的玩家必须将1个该资源给予拥有该资源最少的一位玩家。如果平局，你必须平均分配资源，否则它们都会被“绿林好汉”玩家没收。  
洗回：**将本卡牌洗回牌库。**

**09 贵族义务**：左上“[树] 09”；事件（“!”）；无人数标记；无费用；无分值；无洗回句；类别 Crop Provider（麦穗）。  
风味：*你遇到了美丽的少女玛莉安，并同意帮助她为穷人提供食物。*  
正文：立即翻倍你供应堆中的谷物数量。如果你没有谷物，改为翻倍你供应堆中的蔬菜数量。如果你既没有谷物又没有蔬菜，你立即获得1个谷物和1个蔬菜。

**10 仲夏夜之梦**：左上“[树] 10”；事件（“!”）；无人数标记；无费用；无分值；**有洗回句**；类别 Actions Booster。  
风味：*奥布朗和提泰妮娅在领舞。你加入进去，并迷迷糊糊地醒来，发现你在不认识的地方。*  
正文：在本轮的回家阶段中，每位玩家将自己的1个家庭成员给予左手边的玩家。在下一轮中，该玩家必须遵照规则放置该家庭成员，但所选行动格的好处由该家庭成员的持有者获得。在该轮的回家阶段中，将所有这些家庭成员归还给正确的持有者。  
洗回：**将本卡牌洗回牌库。**

**11 法国城堡**：左上“[树] 11”；事件（“!”）；无人数标记；无费用；无分值；无洗回句；类别 Goods Provider（篮子）。  
风味：*我要朝你的方向放个屁！*  
正文：你获得3个食物和3个石材，但你被暂时监禁，因此必须跳过你的下一个回合。(你不会失去该回合；你只是将该回合延后。)

**12 诸位的木头我们全部收下了**：左上“[树] 12”；事件（“!”，旁边画一只白蚁）；无人数标记；无费用；无分值；**有洗回句**；类别 Crop Provider。  
风味：*你刚砍的木材里都是白蚁。它们看到你仓库里有更多木材非常高兴。但你听说锯末对你的作物有好处。*  
正文：将你供应堆中的所有木材归还到公共供应堆。翻倍你农田中已播种的谷物和蔬菜的数量(通过在对应堆顶增加新货物)。  
洗回：**将本卡牌洗回牌库。**

**13 亡魂**：左上“[树] 13”；职业（圆形画框）；蓝色方框 **3+**；无费用；无分值；无洗回句；类别 Actions Booster。  
风味：*即使是死亡也无法阻止朱尼尔做他的农活。*  
正文：本卡牌为一名家庭成员提供房间。从下一轮起，只有在所有其他玩家放置完自己全部的家庭成员后，你才能放置你的最后一名家庭成员。当你这么做时，你可以依次使用两个不同的行动格。

**14 狼人**：左上“[树] 14”；职业；紫色方框 **1+**；无费用；无分值；无洗回句；类别 Actions Booster。  
风味：*你被一个漂亮的狼人亲了。不幸的是，在满月之夜，你还是跟原来一样丑。*  
正文：在每轮的回家阶段前，立即选择你的一个动物(或者如果你没有动物，选择另一位玩家的一个动物)归还到公共供应堆中。随后其持有者可以立即使用一个未被占据的行动格的效果。

**15 贵族骑士**：左上“[树] 15”；职业；紫色方框 **1+**；无费用；无分值；无洗回句；类别 Building Resource Provider。  
风味：*你必须砍倒森林里最高大的树，用……一条鲱鱼。*  
正文：每次你使用“钓鱼”累积格时，你额外获得2个木材。

**16 火沼烈焰喷射烤炉**：左上“[树] 16”；主要发展（红色边框）；无人数标记；无费用栏；左侧圆形分值 **1**；无洗回句；类别 Food Provider（刀叉）；左下角锅形烹饪图标。  
风味：*你猎取了被流沙困住的块头异常大的动物，并将它放在烈焰喷射上烤。*  
正文：没有文字，只有图标：[羊]／[野猪]／[牛]／[马]／[羊驼]／[妖精（蝴蝶）] → [2 食物]。

**17 丰饶之地**：左下“[树] 17”；行动格（整幅画面）；无人数标记；无费用；无分值；无洗回句；类别 Food Provider。  
风味：*烤鹌鹑、美味的MLT(羊肉、生菜和西红柿三明治)、松露、鱼子酱，还有减肥可乐。生活真美好。*  
正文：本卡牌是一个所有玩家均可使用的行动格。当你使用本卡牌时，你获得10个食物，且在回家阶段中，你必须将你的一名家庭成员归还到供应堆中(而不是回你的房屋)。

**18 战斗公主**：左下“[树] 18”，其下一枚黄色圆形图标（内有方块，外形与规则书的奖励分图标相似）；行动格；无人数标记；无费用；无印刷分值；无洗回句；类别 Points Provider（圆中方块）。  
风味：*一位极美的女性出现了，这使得农夫们原本的生活都变得索然无味。*  
正文：本卡牌是一个所有玩家均可使用的行动格。它替代在第5轮至第7轮进场的“希望增加家庭成员”行动格。当你使用本卡牌时，你获得5点奖励分数，且在回家阶段中，你必须将你的一名家庭成员归还到供应堆中(而不是回你的房屋)。

**19 龙之巢穴**：左下“[树] 19”；行动格；无人数标记；无费用；无分值；无洗回句；类别 Actions Booster。  
风味：*巨龙吉塞穆克总是准备好执行任务，只要你付得起价。*  
正文：本卡牌是一个所有玩家均可使用的行动格。当你使用本卡牌时，你可以执行以下任意数量的行动，每个行动可以执行任意次数：  
[羊] → 他烧毁你的3个农场格子。这些格子视为已使用，且不能再以任何其他方式被使用。[羊图标下方画 3 个深色农场格标记]  
[野猪] → 抽取2张次要发展。  
[牛] → 3[石]　[马] → 4[火焰图标]  
[灰色人形] → 将一名对手的一张职业从游戏中移除，且在回家阶段中，将你的一名家庭成员归还到供应堆中(而不是回你的房屋)。

**20 妖精戒指**：左下“[树] 20”；行动格；无人数标记；无费用；无印刷分值；无洗回句；类别 Points Provider；正文下方画一个妖精（蝴蝶）图标和指向画面蘑菇圈的箭头。  
风味：*咻！*  
正文：本卡牌是一个所有玩家均可使用的行动格。立即在本卡牌上放置2个妖精，并且在每轮的准备阶段中，在本卡牌上放置1个妖精。当你使用本卡牌时，你获得本卡牌上所有的妖精。你可以在每个未使用的农场格子中安置至多2个妖精，随后该格子视为已使用。妖精的繁殖和动物类似。游戏结束计分时，拥有最多妖精的所有玩家获得5点奖励分数。

**21 未选之路**：左下“[树] 21”；行动格；无人数标记；无费用；无分值；无洗回句；类别 Building Resource Provider；画面中一条小路通向[芦苇][石头]图标，另一条通向[黏土]图标。  
风味：*一片树林里分出两条路，而我选择了人迹更少的一条。*  
正文：本卡牌是一个所有玩家均可使用的行动格。当你使用本卡牌时，将家庭成员放在本卡牌的其中一边。在回家阶段中，你获得依然在累积格上的所有对应类型的建造资源。

**22 特大栅栏**：左上“[树] 22”；次要发展；无人数标记；无费用；无分值；无洗回句；类别 Farm Planner。  
风味：*它们从块头异常大的肉食动物嘴下保护你。*  
正文：每当你建造栅栏时，你必须为你建造在一条直线上的任何数量的栅栏仅支付1个木材。

**23 女巫**：左上“[树] 23”；次要发展；无人数标记；无费用；无分值；**有条件洗回句**；类别 Actions Booster；右下角画 3 个占卜标志。  
风味：*你将收集的木材中的一些给了一位上了年纪的妇人。谢天谢地，她同意使用她的占卜水晶球。*  
正文：立即归还1个木材到公共供应堆中并在本卡牌上放置3个占卜标志。在任何时候，你可以从本卡牌上移除1个占卜标志，以查看[树]牌库顶3张卡牌，并以任意顺序放回。  
洗回：**一旦本卡牌上没有占卜标志，将本卡牌洗回牌库。**

**24 卡米洛**：左上“[树] 24”；次要发展；无人数标记；无费用；无分值；无洗回句；类别 Farm Planner。  
风味：*又考虑了一下，我们还是别去卡米洛了。那是个蠢地方。*  
正文：本卡牌为以下所有提供空间：一名家庭成员、一个羊、一个野猪、一个牛、一个马和一个羊驼。

**25 伐木工查克**：左上“[树] 25”；职业；紫色方框 **1+**；无费用；无分值；无洗回句；类别 Building Resource Provider。  
风味：*伐木工查克要伐木，每次查克伐更多木。*  
正文：每当你从一个行动中仅获得木材这一种货物时，你从公共供应堆额外获得1个木材。

**26 秘鲁宗教裁判所**：左上“[树] 26”；事件（“!”）；无人数标记；无费用；无印刷分值；无洗回句；类别 Livestock Provider。  
风味：*没人期待秘鲁宗教裁判所。*  
正文：立即归还你所有的羊，并获得相同数量的羊驼。羊驼是一种新类型的动物，并如常进行繁殖。游戏结束计分时，对所有玩家，羊驼都按如下计分：  
[计分表] [羊驼] 0 → -1；1-3 → 1；4-5 → 2；6-7 → 3；8+ → 4。

## 八、译文核对、来源冲突与英文原牌确认

### 译文可靠性检验

| 牌 | 对照来源 | 结果 |
| --- | --- | --- |
| 09 | 出版社英文、德文官网图片 | 正文逐句一致。“your supply”译“你供应堆”，“instead”译“改为”。 |
| 15 | 英文清晰照片 | 风味与正文逐句一致，人数标记、类别图标一致。 |
| 16 | 英文清晰照片 | 风味一致；兑换图标、1 分、锅形图标、无费用栏一致。两版都没有时机文字。 |
| 26 | 英文清晰照片 | 正文与计分表一致；“for all players”译“对所有玩家”。 |
| 01、02、03、25 | 英文低清照片 | 正文意思一致；03 的 -3、02/03/25 的类别图标一致。英文 25 的人数数字不可辨，中文牌图为 1+。 |
| 13、14 | 日文官方译本全文 | 意思一致。 |
| 08、19、22 | 英文实物照片（用户提供） | 风味与正文逐句一致，图标、牌号一致。08 的单数“the player who has the most”“the player with the least”和“you must distribute”、19 的五行兑换、22 的“in one straight line”都与中文对应。 |
| 22 | 日文官方译本全文 | 日文“一直線に連続した柵”，中文“一条直线上的任何数量的栅栏”。英文原文“any number of fences that you build in one straight line”没有“连续”，中文忠实于英文，“連続”是日文译本增补。 |

结论：在可对照的 15 张牌上，中文译文贴近英文原文，没有增删规则。日文 22 号的“連続”在英文原文中没有对应词。牌面用语前后一致：“供应堆”对应 your supply，“公共供应堆”对应 general supply，“收成”对应 harvest，“奖励分数”对应 bonus points。04、17、18、19 号的家庭成员归还到“供应堆”，不是“公共供应堆”。

### 影响规则理解的歧义与来源冲突

| 牌 | 中文牌图句子 | 其他来源 | 说明 |
| --- | --- | --- | --- |
| 08 | “拥有最多该资源的玩家必须将1个该资源给予拥有该资源最少的一位玩家。如果平局，你必须平均分配资源，否则它们都会被‘绿林好汉’玩家没收。” | 2022 英文：“The player who has the most of a resource must give one of that resource to the player with the least of it. In case of a tie, you must distribute the resources evenly or they are all forfeit to the "Men in Tights" player.” 2010：“The player(s) with the most … loses 1 … The player(s) with the least … receives 1 … If two or more players are tied for least, the stolen resources MUST be distributed evenly or they are all forfeit to the ‚Men in Tights‘ player.” 英文附录：不理解分配规则时把被抢的建材全部给抽牌者。`desc`：“否则它们都被『绿林好汉』没收”，没有“玩家”二字。 | 英文原牌（单数，与中文一致）。“tie”没有说是最多者还是最少者并列；“you”指谁不明；“or”何时成立不明；最多者并列时是否各交 1 个不明。没收对象是“the "Men in Tights" player”，即抽牌玩家，与附录兜底一致，`desc` 漏了“玩家”。直接决定每种建材的数量与去向，英文原文没有回答，交 #1528。 |
| 19 | “[野猪] → 抽取2张次要发展。” | 2022 英文：“Draw 2 minor improvements.” 2010：“Draw 2 cards from the Minor Improvement deck and keep them.” [规则书 p.11](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=11)：次要发展与职业放在手牌中，修订版没有公共次要发展牌堆。附录无澄清。 | 英文原牌同样没写从哪里抽、进手牌还是直接打出，交 #1528。 |
| 19 | “[羊] → 他烧毁你的3个农场格子。这些格子视为已使用，且不能再以任何其他方式被使用。” | 2022 英文：“He burns 3 of your farmyard spaces. These spaces are considered used but cannot be used in any other way.” 2010：“They don't count as unused, but can't be used either.” | “是否算 unused”已解答：视为已使用。英文原牌没有限定“未使用”格，也没写由谁选格、不足 3 格时如何处理，交 #1528。 |
| 19 | “[灰色人形] → 将一名对手的一张职业从游戏中移除，且在回家阶段中，将你的一名家庭成员归还到供应堆中” | 2022 英文：“Remove an opponent's occupation from play and, in the returning home phase, return one of your people to the supply (instead of your house).” 2010：“Choose one opponent. Discard one occupation of that player for good.” | 英文原牌没写由谁选择对手和职业；归还的是“one of your people”，不限于使用者本人。此行没有 17、18 号的“必须”。交 #1528。 |
| 19 | “[马] → 4[火焰图标]” | 英文原牌同为图标“4”加深色圆内火焰，没有文字；附录未解释图标；`desc` 写“4燃料”。论坛线索见第五节。 | 图标含义未由官方文字确认；不用 Farmers of the Moor 时没有马，此项不会发生。 |
| 22 | “每当你建造栅栏时，你必须为你建造在一条直线上的任何数量的栅栏仅支付1个木材。” | 2022 英文：“Each time you build fences, you must pay only 1 wood for any number of fences that you build in one straight line.” 日文官方译本：“柵を建設するたび、一直線に連続した柵のコストは木材1だけで済む。” 2010：“building several fences in one straight line cost only 1 Wood.” 附录：3×3 新牧场只需 4 木。 | 英文原牌没有“连续”，中文忠实；日文“連続”是译本增补。同一直线上不相连的几段栅栏是否合计 1 木，英文原文也没写，附录例子两种读法都满足，交 #1528。 |
| 10 | “每位玩家将自己的1个家庭成员给予左手边的玩家……所选行动格的好处由该家庭成员的持有者获得。在该轮的回家阶段中，将所有这些家庭成员归还给正确的持有者。” | `desc`：“下家”“原持有者”。2010：“left neighbour … the owner of the disc gets the effect”。附录：由你决定何时放置他人人员。 | “持有者”在借用期间可被误读为借用者，但同句的“正确的持有者”与 2010 都指所有者。[规则书 p.4](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=4) 规定按顺时针轮流放人，“左手边的玩家”即“下家”。各来源一致，不需拍照。 |
| 11 | “因此必须跳过你的下一个回合。(你不会失去该回合；你只是将该回合延后。)” | 2010：“forfeit your next chance to place a family member”。 | 2022 改为延后而不是失去；延后到何时（本轮其他人放完后，或顺序上后移一位）牌面没写。英文原文不太可能写得更细，交 #1528。 |
| 17、18、19 | “将你的一名家庭成员归还到供应堆中(而不是回你的房屋)” | 2010 的 17、18：移除使用此行动的那名人员，“You can later get it back through Family Growth”。 | 中文是“一名”而不是使用者本人。普通对局结果相同，只在与 10 号借用人员、04 号临时成员、13 号亡魂叠加时有差别，交 #1528。 |
| 17、19、20、21 | 只写“本卡牌是一个所有玩家均可使用的行动格” | 英文附录字面“except in one case, the drawn action space replaces an existing one”。 | 见第四节：牌面、德文附录和 2010 一致，只有 18 号替换。 |
| 24 | “本卡牌为以下所有提供空间：一名家庭成员……” | 13 号牌图写“提供房间”；`desc` 写“提供空房间”；附录：可同时容纳 1 人和至多 5 种不同动物；2010 规则单：相当于额外房间加马厩但不计分。 | 能否满足“需要空房间”的家庭增长、是否计入房间数与翻修，牌面没写。英文原文也未必回答，交 #1528。 |
| 16 | 只有兑换图标 | `desc` 加“任何时候”；英文牌面同样没有时机文字；规则书：锅形图标表示可把动物和蔬菜换成食物。 | 牌面没有写兑换时机，交 #1528。 |
| 04 | 没有洗回句 | 2010 洗回；日文残片正文最后一行之下未见洗回句；`desc` 的 `reshuffle` 为 false。 | 中文牌图没有洗回句，日文残片可见部分也没有；按牌面，2022 版不洗回。 |
| 12 | 有洗回句 | `desc` 的 `reshuffle` 为 false 且无洗回句；日文残片可见“このカードはデッキに”开头的洗回句；2010 洗回。 | 以牌图为准：洗回。 |

### 牌图与 `desc` 的其他差异

`desc` 与牌图意思相同的措辞差异（如“饭”与“食物”、“仓库”与“供应堆”、“增加家庭成员（无需空房间）”与“无需空房间的家庭增长”）不逐条列出。会改变理解的差异如下，均以牌图为准：

| 牌 | 牌图 | `desc` |
| --- | --- | --- |
| 08 | 被“绿林好汉”**玩家**没收 | 被『绿林好汉』没收 |
| 10 | 左手边的玩家；该家庭成员的持有者 | 下家；原持有者 |
| 11 | 只有风味“我要朝你的方向放个屁！” | 多出“尽管你的母亲是只仓鼠，(且)你的父亲有接骨木莓的味道，你还是拆掉了城堡的墙。”，该句不在 2022 中文牌面上，对应 2010 英文牌面 |
| 12 | 标题“全部收下了”；有洗回句 | 标题“全收下了”；无洗回句，`reshuffle` 为 false |
| 13 | 提供房间 | 提供空房间 |
| 14 | 可以立即使用一个未被占据的行动格的效果 | 另加“无需派遣家庭成员” |
| 15 | 使用“钓鱼”累积格**时** | 使用“钓鱼”累积格**前** |
| 16 | 只有图标 | 另加“任何时候” |
| 17 | 标题“丰饶之地”；“在回家阶段中，你必须……” | 标题“乳蜜之地”；“在该轮的回家阶段”，无“必须” |
| 20 | 标题“妖精戒指”；繁殖和动物“类似” | 标题“精灵之环”；繁殖方式和动物“相同” |
| 21 | 放在本卡牌的其中一边；获得依然在累积格上的所有对应类型的建造资源 | 放在此卡上边或是下边；从每个累积格上拿取 |
| 23 | 有条件洗回句 | 正文有同一句，但 `reshuffle` 为 false |
| 24 | 提供空间 | 提供空房间 |
| 25 | 获得木材这一种货物**时** | 获得……**后** |
| 04、13 | “丛林”“阻止” | 错字“从来”“组织” |

### 英文原牌确认（#1536）

[#1535](https://github.com/titanxxh/open-agricola/issues/1535) 列出 08、19、22 需要英文原牌。用户于 2026-10-31 提供三张 2022 英文实物牌照片，转录如下（**官方牌面（用户实物照片）**）。

**08 Men in Tights**（树形图标 08；感叹号事件图标；右侧树形牌堆图标）  
风味：*Suddenly, figures clad in woolly green break out of the underwood.*  
正文：Immediately do the following for each type of building resource: The player who has the most of a resource must give one of that resource to the player with the least of it. In case of a tie, you must distribute the resources evenly or they are all forfeit to the "Men in Tights" player.  
SHUFFLE THIS CARD BACK INTO THE DECK.

**19 Dragon's Lair**（树形图标 19，竖排在左下；行动格版式）  
风味：*Gisemück the dragon is always up for tasks if you pay him.*  
正文：This is an action space for all. When you use it, you can take any number of the following actions, any number of times:  
[羊；下方 3 个深色格标记] → He burns 3 of your farmyard spaces. These spaces are considered used but cannot be used in any other way.  
[野猪] → Draw 2 minor improvements.  
[牛] → 3 [石]　　[马] → 4 [深色圆内火焰]  
[灰色人形] → Remove an opponent's occupation from play and, in the returning home phase, return one of your people to the supply *(instead of your house)*.

**22 Fences of Unusual Size**（树形图标 22；次要发展版式，无费用栏，未见分值；右下栅栏类别图标与树形牌堆图标）  
风味：*They save you from Rodents of Inconceivable Size.*  
正文：Each time you build fences, you must pay only 1 wood for any number of fences that you build in one straight line.

结论：三张中文牌图都忠实于英文原文。原先列入清单的问题中，只有两处由英文原牌解答：22 号原文没有“连续”；08 号的没收对象是抽牌玩家（“the "Men in Tights" player”）。其余问题英文原文同样没有写明，属于规则空白，交 #1528：08 的并列方与“you”、19 的抽牌来源与选择者、22 的不相连线段。现在没有需要再拍原牌的牌。

## 九、官方 FAQ、勘误与 2010 版差异

**官方裁定**：周年版 FAQ 共四问。Farmers of the Moor 问答为“Yes, you can.”；5–6 人扩展问答为“Absolutely!”；另两问涉及收纳和 L 牌堆的 LE 事件。没有本扩展的专项问答。[英文 FAQ](https://www.lookout-spiele.de/en/games/15yearsofagricolaanniversarybox.html)

没有找到任何本扩展的出版社勘误。2010 产品页 FAQ 回答旧版牌能否与修订版混用，开头为“Yes-ish”，并提醒混用新旧版可能出问题，只建议有经验的玩家这样做，[2010 产品页](https://www.lookout-spiele.de/en/games/agricola_legendary.html)。这说明 2010 牌面不能直接代表 2022 规则。

**2010 → 2022 的已确认差异**（官方规则、官方牌面与中文牌图对照旁证）：

- 张数 24 → 26，加入两张促销卡。2010 规则单写“四类牌”，2022 附录拆出主要发展，写“五类牌”。
- 2022 附录说明本牌堆“have been reworded to comply with the changes made in revised Agricola”。已核实的改写包括：Lady of the Sea → Lady of the Lake，耕“未使用格”→ 耕“fields”；Meeting a Unicorn → The Unicorn；Unicorn Pt. 2 从“你获得家庭成长”改为“抽到时立即执行一次家庭成长行动，即使无法执行负分仍保留”；Werewolf 从“At end of turn”改为“每轮回家阶段之前”（日文版、中文）；The Noble Knight 改为“使用 Fishing 累积格”；Fire Bog 烤炉从按种类兑换改为任一列出的动物换 2 食物，且列出马和妖精。
- 中文牌图另显示：04 从 guest marker 改为正式的“无需空房间的家庭增长”，不算新生儿，且不再洗回；07 从“野猪立即繁殖”改为“野猪数量翻倍”；11 从失去下一次放人机会改为只延后；17、18 从移除使用者改为回家阶段归还“你的一名家庭成员”；19、20 的格子“视为已使用”；20 写明并列最多者都得 5 分（2010 只写“the player with the most fairies”）；24 列出 1 名家庭成员和 5 种动物各 1 只。以上为**中文贴条实物牌图**等级。
- 英文实物牌另显示：08 从 2010 的复数“The player(s)”和“tied for least”改为单数，并只写“In case of a tie”；19 的次要发展从“from the Minor Improvement deck and keep them”改为“Draw 2 minor improvements”，移除职业从“Choose one opponent. Discard one occupation”改为“Remove an opponent's occupation from play”，并加上回家阶段归还一名人员；22 从“building several fences in one straight line”改为“Each time you build fences … any number of fences that you build in one straight line”。以上为**官方牌面（用户实物照片）**。
- 触发规则新增非木累积格上至少 3 木也适用、以及同时取得其他货物不影响两句。
- 附录澄清有改动：04 从 guest marker 改为人员措辞；24 Camelot 从“相当于房间加马厩但不计分”改为“可同时容纳 1 人和至多 5 种不同动物”；17、18 不再写“不能用 guest marker”。

另有线索：BGG 显示 2026 年的《Agricola: Special Edition》（BGG 440147）也收录本扩展，其措辞是否再次修改未调查，不在本次 2022 版范围内。

## 十、人数适用性与组合

| 组合 | 来源能确认的内容 | 未提及 |
| --- | --- | --- |
| 人数 | 周年版盒子标 1–4 人；FAQ 称兼容 5–6 人扩展。2010 产品页标 1–5 人。附录没有为本扩展设人数限制。牌面只有 4 张职业印人数标记（13 为 3+，其余 1+）。 | 本扩展在单人或 5–6 人局的特殊规则，**未提及**。 |
| 单人 | 规则书单人规则：每轮“Forest”累积格只放 2 木而不是 3 木，[规则书 p.12](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=12)，**官方规则**。这会改变触发频率，但不构成禁止。 | 牌面涉及“其他玩家”“左手边的玩家”“对手”的牌（08、10、14、19）在单人局如何结算，以及 3+ 职业 13 Revenant 是否移出，**未提及**。 |
| Farmers of the Moor | FAQ 一般兼容；16 号 2022 牌面列出马；19 号马一行给火焰图标；24 号容纳 1 匹马。 | 农场森林地形取木是否触发、火焰图标是否就是 Moor 的燃料，**未提及**。 |
| Through the Seasons | 附录称该变体可与“基础游戏及其各种扩展的任意组合”一起使用，包括 Farmers of the Moor，[附录 p.10](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=10)，**官方规则**。春季每个木累积格减 1 木、秋季加 1 木，春季建栅栏有免费栅栏。 | 季节增减木与“至少 3 木”的结合、春季免费栅栏与 22 号的叠加，**未提及**。 |
| Parent Cards、选牌与轮抽、Moor Balance Rules | 没有找到任何官方文字。 | **未提及**。 |

## 十一、尚未解决的问题

以下问题在所查官方来源中没有唯一答案，应由 [#1528](https://github.com/titanxxh/open-agricola/issues/1528) 处理。凡采纳的答案若无唯一出版依据，须标为 Project Rule Interpretation。

已由牌面解答、从本表删除的问题：18 号替换的是第 5–7 轮进场的“希望增加家庭成员”（Basic Wish for Children）；英文附录的替换句与牌面不一致（牌面只有 18 号替换）；23 号窥牌能力；04 号是正式家庭增长、不算新生儿、不洗回；19 号烧毁格与 20 号妖精格“视为已使用”；20 号并列最多者都得 5 分；12 号洗回；各张牌是否洗回；08、19、22 的英文原文（与中文一致，22 号没有“连续”，08 号没收归抽牌玩家）。

| 领域 | 问题 |
| --- | --- |
| 英文原文 | 04–07、10–14、17、18、20、21、23、24 这 15 张只有译文（13、14 另有日文全文），英文原文若与译文不同，以英文为准。 |
| 触发口径 | 卡牌另给的木（25、15 等）是否计入 3 木；格上不足 3 木但加卡牌奖励后达到 3 木时如何处理；一次行动多个累积格或多次取物如何计次；只拿走部分累积物的情况（规则要求累积格须全拿）。 |
| 时点 | 抽牌与取物、与其他“取物后”反应的先后；事件在抽牌者当前行动中途结算还是行动结束后结算。 |
| 牌堆生命周期 | 牌堆耗尽；洗回是整副重洗还是插入；06 号再次抽到时“广场”限制与起始玩家如何交接；23 号洗回时牌上状态。 |
| 自动获得的牌 | 是否付费（牌面都没有费用栏）、是否算“打出”并触发相关效果、是否受数量限制；3+ 职业在 1–2 人局如何处理；23 号抽到时没有木材怎么办；16 号兑换时机。 |
| 行动格 | 替换时格上资源和人员；行动格牌在单人局是否照常进入；19 号“Draw 2 minor improvements”的来源与去向（英文原文未写）；21 号两边能否各放 1 人，以及有多个同类累积格时是否全部收取。 |
| 人员 | 10 号借用人员占用借用者的哪个回合、单人局如何处理；11 号延后的回合放在何时；17、18、19 号归还的是任意一名家庭成员还是使用者本人，被归还者能否经家庭增长重获；13 号与 24 号提供的空间是否计作房间。 |
| 动物 | 羊驼的饲养容量、交易、烹饪和 8 个标记是否为上限；所有玩家按羊驼计分（无羊驼 -1）在未抽到 26 号时是否也适用；独角兽能否选为羊驼、马或妖精，是否与真实动物配对繁殖；妖精能否放在农场格以外、放不下时如何处理、“类似”动物繁殖的具体条件、无人拥有妖精时是否算并列；07 号野猪翻倍后放不下的处理。 |
| 农场 | 19 号烧毁哪些格、由谁选、不足 3 格时如何处理；Camelot 的位置与计分。 |
| 其他玩家 | 08 号的分配规则：英文原文只写单数最多者给单数最少者，“In case of a tie”未说明哪一方并列，“you”指谁、何时全归抽牌玩家也未写；19 号被移除职业由谁选择对手和职业；14 号在单人局选“另一位玩家的动物”。 |
| 栅栏 | 22 号英文原文“in one straight line”没有“连续”，同一直线上不相连的几段是否合计 1 木未写；与其他减费、季节免费栅栏的叠加。 |
| 组合 | 单人与 5–6 人中涉及他人的牌；Farmers of the Moor 农场森林、马与燃料；Through the Seasons；Parent Cards；选牌与轮抽；Moor Balance Rules。 |

## 交接

本研究确认了 2022 版 26 张的编号、英德名称、类型、组件、触发规则和抽到后各类牌的处理方式。2022 牌面方面，英文全文 7 张（08、09、15、16、19、22、26，其中 08、19、22 为用户实物照片）、英文低清 4 张（01–03、25）、日文全文 3 张（13、14、22），中文贴条实物牌图覆盖全部 26 张并已逐字转录。中文译文与英文可对照的 15 张逐句一致；日文 22 号的“連続”是译本增补。08、19、22 剩余的问题来自英文原文本身，已没有需要拍原牌确认的牌。后续决策不应把原需求 [#1425](https://github.com/titanxxh/open-agricola/issues/1425) 的概述、2010 牌面、社区评测、论坛回复或 BGA 快照的实现当作 2022 官方裁定。
