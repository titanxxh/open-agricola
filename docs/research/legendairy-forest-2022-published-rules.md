# Legen*dairy Forest 2022 版出版规则研究

研究日期：2026-10-31。目标版本：Lookout Games 2022 年《Agricola 15》周年版（Agricola 15 / 15 Years of Agricola）。仓库基线：`d1570f66c`。

本报告回答 [#1527](https://github.com/titanxxh/open-agricola/issues/1527) 的事实调查，属于地图 [#1526](https://github.com/titanxxh/open-agricola/issues/1526)。报告只记录出版来源能确认什么、不能确认什么，不采纳 Project Rule Interpretation，也不核对本仓库代码能力。为避免与 `forest` 行动格（3 木累积格）和 Farmers of the Moor 的农场森林地形混淆，本文称本扩展时一律用全称 Legen*dairy Forest。

## 证据等级

| 标记 | 含义 |
| --- | --- |
| **官方规则** | Lookout 2022 年出版的规则书、附录或出版社官网文字。 |
| **官方牌面** | 2022 版牌面原文。出版社官网图片直接标为“官方牌面（出版社图片）”；第三方拍摄的 2022 版实物照片标为“官方牌面（社区照片）”，内容是官方印刷品，但来源和清晰度另行说明。日文版由 Hobby Japan 出版，日文牌面是 2022 版的官方译本，不是英文原文。 |
| **官方裁定** | 出版社 FAQ 或勘误。 |
| **社区线索** | BGG 论坛、评测、BGG 条目元数据等。包括设计者或出版社编辑的个人论坛回复：它们是有价值的线索，但不是出版社 FAQ 或勘误，本文不把它们升级为官方裁定。 |
| **旁证（2010）** | 2010 原版 24 张牌和规则单的内容。原版已按修订版规则改写，只能在 2022 文本有歧义或缺失时作旁证。 |

“未提及”表示所查来源没有相关文字；“禁止”只在来源明文禁止时使用。本报告没有把任何“未提及”写成“禁止”。

## 来源与局限

| 来源 | 本文用途 | 局限 |
| --- | --- | --- |
| [英文附录第 12–13 页](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=12)（16 页 PDF，创建于 2022-05-12） | 组件、准备、触发规则、五类牌的处理方式、26 张牌的编号与英文名、逐卡澄清。已用 `pdftotext -layout` 提取并渲染第 12–13 页人工核对排版和图标。 | 附录只列牌名和部分澄清，不印完整牌面效果。 |
| [德文附录第 12–13 页](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=12)（创建于 2022-05-05） | 德文牌堆名、牌名、组件名；与英文附录对照。 | 与英文附录有几处措辞差异，见下文。 |
| [英文规则书](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf)（12 页） | 第 2 页组件表（“26 [树形图标] deck cards”）、职业人数标记、累积格、单人规则、牌面图标含义。 | 基础规则只定义被修改的基础术语，不回答本扩展的逐卡组合。 |
| [英文产品页与 FAQ](https://www.lookout-spiele.de/en/games/15yearsofagricolaanniversarybox.html) | 发行年份、1–4 人、FAQ 四问。 | FAQ 没有任何 Legen*dairy Forest 专项问答。用 `curl` 访问被 CDN 拒绝，正文经 WebFetch 读取。 |
| [英文官网卡牌拼图](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png)、[德文官网卡牌拼图](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_GalleryImage_3.png) | 09 号牌的完整英文、德文牌面。已下载原图裁切核对。 | 拼图中只有一张本扩展的牌。 |
| [英文盒背](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.jpg)、[德文盒背（BGG 图 6928314）](https://boardgamegeek.com/image/6928314) | 牌堆在盒背上的正式名称。 | 只给名称和宣传语。 |
| [2010 原产品页](https://www.lookout-spiele.de/en/games/agricola_legendary.html) | 2010 版 24 张、1–5 人；FAQ 关于新旧版混用。 | 只适用 2010 版。 |
| [BGG 条目 83697](https://boardgamegeek.com/boardgame/83697/agricola-the-legendairy-forest-deck)、[Agricola 15 条目 359999](https://boardgamegeek.com/boardgame/359999/agricola-15) | 版本、包含关系、两张促销卡的 BGG 条目、图库与论坛索引。通过 geekdo API 读取。 | 社区维护的元数据。 |
| [BGG 图 8137340](https://boardgamegeek.com/image/8137340)（2024，Agricola 15 图库） | 2022 版 15、16、26 号英文牌面，清晰可读。 | 社区照片，只有三张。 |
| [BGG 图 7254823](https://boardgamegeek.com/image/7254823)，出自 [Silver Duck 评测](https://boardgamegeek.com/blogpost/142069/agricola-15-agricola-x-and-legendairy-forest-deck)（2023） | 2022 版 25、01、02、03 号英文牌面。 | 原图只有 567×211 像素，放大后可读但不保证每个字符；评测正文本身只是社区线索。 |
| [日文开箱博客](https://boardgame-replay.com/archives/unboxing-agricola15-230614.html)（2023）、[Hobby Japan 产品页](https://hobbyjapan.games/agricola_15th_ann/) | 日文版 13、14、22 号完整牌面和其余牌的残片；日文牌堆名。 | 社区照片，多数牌被相互遮挡；日文是译本。 |
| [BGG 图 841493](https://boardgamegeek.com/image/841493)、[2010 规则单正面](https://boardgamegeek.com/image/849711)与[背面](https://boardgamegeek.com/image/849713) | 2010 版 24 张英文牌面和规则单全文。 | 只作旁证（2010）。 |
| BGG 论坛帖（逐条链接见下文） | 设计者、出版社编辑和玩家的回复。 | 社区线索。2010 年代的回复针对旧版牌面。 |

没有找到出版社发布的 2022 版完整牌面扫描、逐卡 FAQ 或勘误。没有找到简体或繁体中文出版物。

## 结论速览

- 2022 版牌堆共 **26 张**：11 张事件、4 张职业、5 张次要发展、1 张主要发展、5 张行动格。比 2010 版 24 张多出 25 号 Chuck the Wood Chuck 和 26 号 Peruvian Inquisition，二者原是 2010 和 2012 年的促销卡。**官方规则**，[英文附录 p.12–13](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=12)、[规则书 p.2](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=2)。
- 触发：每次从**任意累积格**取得**至少 3 木**，必须同时抽牌堆顶 1 张并向所有玩家公开；非木累积格上因其他效果（例如卡牌）放了至少 3 木也适用；同时取得的其他货物不影响。**官方规则**。
- 职业、次要发展、主要发展被抽到时，“放在你面前，与已打出的牌放在一起”；附录没有提到支付费用、职业学费或是否算作“打出”。行动格牌放在版图旁，除一个例外外替换现有行动格，供所有人按常规放置。**官方规则**。
- 2022 版完整英文牌面目前只核实到 09、15、16（费用栏未见）、26；01、02、03、25 低分辨率可读；13、14、22 只有日文版完整牌面。其余 15 张的 2022 完整牌面**未能核实**，只能用附录澄清、日文残片和 2010 旁证。
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
| 中文 | **未找到官方中文名称** | BGG 为 Agricola 15 列出“Simplified Chinese edition”和“Traditional Chinese edition”两个版本条目，但没有产品名、出版社以外的信息或图片。社区视频与资讯只用“农场主15周年纪念版”指整盒，没有牌堆译名。 |
| 2010 版名称 | 规则单“The legen\*dairy [树形图标]-Deck”；2010 产品页标题“Legen\*dary-Deck”、描述“Legen\*dairy Forest Deck”；德文“Tannenbäumchendeck” | 旁证（2010） |

牌的编号：2022 牌面左上角为树形图标加两位数字（例如“[树形图标] 09”），附录同样用树形图标加 01–26，没有字母前缀。**官方规则 / 官方牌面**。

牌类型的官方叫法（英 / 德附录）：Events / Ereignisse；Occupations / Ausbildungen；Minor Improvements / Kleine Anschaffungen；Major Improvement / Große Anschaffung；Action Spaces / Aktionsfelder。

组件的官方叫法（英 / 德附录）：12 torched farmyard spaces / 12 abgebrannte Hoffelder（19 号用）；7 “one fairy” markers / 7 Marken „1 Fee“ 与 14 “two fairies” markers / 14 Marken „2 Feen“（20 号用）；3 scry counters / 3 Hellsichtmarken（23 号用）；8 llama markers / 8 Lamamarken（26 号用）。

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
| 洗回 | “Some events are shuffled back into the deck and may reappear later in the game.” 具体哪些事件洗回由牌面决定。 | 2022 逐卡洗回标记未能全部核实（见第六节）。洗回是整副重洗还是插入，2022 来源**未提及**；2010 年设计者论坛回复为整副重洗（[BGG 帖 660800](https://boardgamegeek.com/thread/660800)，**社区线索**）。 |
| 牌堆耗尽 | **未提及**。 | 待裁定。 |
| 窥牌 | 只有 23 号 The Witch 通过 scry counters 提供窥牌能力（附录列出 3 个 scry counters）。2022 牌面未核实；2010 版为“移除 1 个计数器查看牌堆顶 3 张并任意排序，最后一个计数器移除时将此牌洗回”，**旁证（2010）**。 | 2022 具体能力待补证据。 |
| 出牌者 | 附录对职业与发展写“When you draw ..., place it face up in front of you”，即归抽牌玩家。 | — |

## 三、自动获得的职业与发展

| 问题 | 来源能确认的内容 | 未提及 |
| --- | --- | --- |
| 获得方式 | 职业：“When you draw an occupation, place it face up in front of you, with your played cards.” 次要发展：“These are things you found in the forest. When you draw a minor improvement, place it face up in front of you, with your played cards.” 主要发展同样处理。**官方规则**。 | 是否支付建造费用或职业学费，**未提及**。可见的 2022 牌面（02、03、15、16、22、25）均未见费用栏。 |
| 是否触发普通出牌相关效果 | — | 是否算“打出职业 / 建造发展”、是否触发“每当你打出职业”之类的效果、是否占用发展或职业数量限制，**未提及**。 |
| 计分 | 牌面印有分数的照常计分：16 号印 1 分，03 号印 -3 分（2022 照片），**官方牌面（社区照片）**。 | 是否计入其他“按职业 / 发展数量计分”的效果，**未提及**。 |
| 人数标记 | 2022 职业印有人数标记：14 Werewolf 为 1+（日文版照片），15 The Noble Knight 为 1+（英文照片），13 Revenant 为 **3+**（日文版照片），25 号有标记但数字不可辨。[规则书 p.3](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=3) 说明 [1+] 指 1–4 人、[3+] 指 3–4 人，不符合人数的牌放回盒中，语境是发手牌。**官方规则 / 官方牌面（社区照片）**。 | 本扩展的 3+ 职业在 1–2 人局是否移出牌堆，**未提及**。 |
| 主要发展图标 | 16 号左下角有锅形图标。[规则书 p.10](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=10) 说明凡能把动物和蔬菜换成食物的牌在左下角有此图标；规则书另说明持有带此图标的发展可把从累积格取得的动物直接换成食物。**官方规则**。 | 该牌是否计入主要发展相关的数量条件、其他玩家能否另行获得，**未提及**。 |

## 四、公共行动格

- “These cards are placed face up beside the game board; except in one case, the drawn action space replaces an existing one. They are normal action spaces and can be used by any person, according to the usual placement rules.” 英文附录，**官方规则**。
- 德文附录同一段没有“除一个例外外替换现有行动格”这一句，只说放在版图旁、按常规规则使用。英德文本在这里不一致。**官方规则**。
- 唯一的替换在 18 号 Warrior Princess。附录澄清：“If the ‘Wish for Children’ action space is not in play when this card is revealed, it will never come into play.” 2022 规则书的阶段 2 行动格叫“Basic Wish for Children”，阶段 5 叫“Urgent Wish for Children”，附录只写“Wish for Children”，没有说明是哪一张。2010 版牌面写的是替换第 5–7 轮出现的“Family Growth”或“Family Growth + Minor Improvement”，**旁证（2010）**。
- 被替换时已有人员如何处理：2022 版编辑 Grzegorz Kobiela 在 BGG 回答“Any people already on the space are unaffected.”（[BGG 帖 3149754](https://boardgamegeek.com/thread/3149754)，2023），属**社区线索**。
- 资源、累积物在替换时如何处理、行动格与轮次牌的编号关系、行动格牌的占格能否在当轮使用，**未提及**。

## 五、附属组件与特殊机制涉及的牌

“牌面原文”一栏只写已核实的 2022 版内容。

| 类别 | 涉及的牌（2022 编号） | 已确认的 2022 内容 | 主要空白 |
| --- | --- | --- | --- |
| 借用他人人员 | 10 A Midsummer Night's Dream | 附录澄清：“You decide when to place the other player's person.” 德文：“Du entscheidest selbst, in welchem Spielzug du die fremde Person einsetzt.” | 2022 牌面未核实。2010 版：下一个回家阶段每位玩家把 1 名家庭成员交给左邻，左邻在下一轮放置，效果归所有者，之后照常回家并洗回，**旁证（2010）**。单人局如何处理未提及。 |
| 额外、临时或移除人员 | 03 The Unicorn, Pt. 2；04 Feral Child；11 French Castle；13 Revenant；17 Land of Milk and Honey；18 Warrior Princess；19 Dragon's Lair；24 Camelot | 03：抽到时立即进行一次“Family Growth without Room”行动，即使无法执行，-3 分仍保留（低分辨率照片）。04 附录：已有 5 人时无事发生，也不必在下一次喂养后归还人员。13（日文版全文）：此牌可住 1 人；从下一轮起你的最后一个人只能在其他所有玩家放完后放置，并可用它连续使用 2 个不同行动格。17（日文残片）：所有人可用的行动格，使用者得 10 食物，回家阶段该人员须放回供应区而非房屋。24 附录：可同时容纳 1 人和至多 5 种不同动物。 | 04、11、17、18、19、24 的 2022 牌面未核实。2010 版 04 用 guest marker，2022 附录改用“person”和“归还人员”措辞。2010 版 17、18 规则单写明不能用 guest marker，2022 附录未保留此句。 |
| 新动物：羊驼 | 26 Peruvian Inquisition（8 个 llama markers） | 牌面全文（清晰照片）：立即归还你所有的羊，获得同等数量羊驼；羊驼是新动物，照常繁殖；计分时**所有玩家**按 0/1–3/4–5/6–7/8+ 只计 -1/1/2/3/4 分。 | 羊驼的饲养容量、宠物、交易与转换规则只有“breed as normal”。8 个标记是否是上限未提及。 |
| 新动物：仙女 | 20 Fairy Ring（7 个“一仙女”、14 个“两仙女”标记） | 只有附录组件表。 | 2022 牌面未核实。2010 版：立即放 2 仙女，每轮开始加 1，使用者全部取走，每个未使用农场格可放 2 仙女，仙女像动物一样繁殖，终局仙女最多者得 5 分，**旁证（2010）**。仙女所在格是否算“used”：2011 年 Hanno Girke 回答“不算 used”，同帖另一位设计者先答“算”（[BGG 帖 603689](https://boardgamegeek.com/thread/603689)），**社区线索**；2023 年评测说算占用，与之相反。 |
| 虚拟动物：独角兽 | 02 The Unicorn, Pt. 1 | 牌面（低分辨率）：每次收获的繁殖阶段和计分时，独角兽视为你选择的一种动物（用于繁殖和分数）。附录澄清：不占农场空间；是变形者，每个繁殖阶段和计分时都可重新选择；不能换成食物。 | 德文附录写“in jeder Ernte”（每次收获）而非“breeding phase”。能否选羊驼、马或仙女未提及。 |
| 其他与动物相关 | 05 The Hermit；07 The Boar King；14 Werewolf；16 The Fire Bog Flame Spurts Oven | 14（日文版全文）：每轮回家阶段前选 1 只自己的动物放回供应；若没有动物则选他人的 1 只；该动物所有者随即可使用 1 个未被占用行动格的效果。附录：被选对手不能借此把动物换成食物；无人有动物则无事发生。16（清晰照片）：羊 / 野猪 / 牛 / 马 / 羊驼 / 仙女 → 2 食物，印 1 分。05 附录：不能为响应此牌把羊换成食物。 | 05、07 牌面未核实。16 牌面图标包含 Farmers of the Moor 的马和本扩展的仙女。 |
| 农场烧毁或封锁 | 19 Dragon's Lair（12 个 torched farmyard spaces）；20 Fairy Ring（仙女占用农场格）；24 Camelot | 只有组件表和 24 号附录澄清。 | 19 的 2022 牌面未核实。2010 版：交出某种动物后，龙烧毁你 3 个农场格，这些格不算 unused 但也不能使用；其他选项包括抽 2 张次要发展、换石头或另一种资源、牺牲 1 人让 1 名对手弃 1 张已打出的职业，**旁证（2010）**。2023 年有玩家问“给牛得到的火焰符号是什么”，Hanno Girke 回答那是 Farmers of the Moor 的取暖物（[BGG 帖 3167678](https://boardgamegeek.com/thread/3167678)），帖子标题写“card 19 L Deck”，所指是否为本扩展 19 号未能确认，**社区线索**。 |
| 特殊栅栏计费 | 22 Fences of Unusual Size | 日文版全文：每次建栅栏时，一条直线上连续的栅栏只需 1 木。附录：例如新建 3×3 牧场只需 4 木。 | “一条直线”是否可跨越已有栅栏或垂直栅栏，2010 年有玩家提问但没有得到设计者回答（[BGG 帖 583781](https://boardgamegeek.com/thread/583781)）；与其他栅栏减费、Through the Seasons 春季免费栅栏的叠加，**未提及**。 |

## 六、逐张牌面

“2022 牌面”一列：**全文**＝已读到完整 2022 牌面；**低清**＝2022 照片可读但分辨率低；**日文全文**＝日文版完整牌面；**残片**＝只有日文残片；**未核实**＝没有找到 2022 牌面。2010 名称与 2022 不同时在旁证列注明。

| 编号 | 英文名（2022） | 德文名（2022） | 类型 | 2022 牌面 | 已确认的 2022 内容 | 2010 旁证要点 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | The Lady of the Lake, Pt. 1 | Die Dame vom See, Teil 1 | 事件 | 低清 | “Immediately plow up to 3 fields.” | 原名 The Lady of the Sea, Pt. 1；耕至多 3 个未使用格。 |
| 02 | The Unicorn, Pt. 1 | Das Einhorn, Teil 1 | 次要发展 | 低清 | 见第五节。 | 原名 Meeting a Unicorn, Pt. 1。 |
| 03 | The Unicorn, Pt. 2 | Das Einhorn, Teil 2 | 次要发展 | 低清 | -3 分；见第五节。 | 原名 Meeting a Unicorn, Pt. 2；“You have Family Growth without space in your home”。 |
| 04 | Feral Child | Das wilde Kind | 事件 | 残片 | 附录澄清见第五节。 | guest marker 至下一次收获，喂养后消失；洗回。 |
| 05 | The Hermit | Der Einsiedler | 事件 | 未核实 | 附录：不能为响应此牌把羊换成食物。 | 交出所有羊，得等量木。 |
| 06 | The Lady of the Lake, Pt. 2 | Die Dame vom See, Teil 2 | 事件 | 残片 | 日文残片显示涉及起始玩家、次要发展行动并写有洗回句。 | 获得起始玩家标记，直到其他人被宣布为王；起始玩家行动失去起始玩家效果；洗回。 |
| 07 | The Boar King | Der König der Schweine | 事件 | 未核实 | — | 有野猪则野猪立即繁殖；否则毁掉已种蔬菜；两者都无则耕 1 个未使用格；洗回。 |
| 08 | Men in Tights | Männer in Strumpfhosen | 事件 | 未核实 | 附录：若不理解分配规则，被抢走的建材全归抽牌者。 | 每种建材最多者失 1，最少者得 1；最少者平局时须平分，否则全归抽牌者；洗回。 |
| 09 | Noblesse Oblige | Adel verpflichtet | 事件 | **全文**（出版社图片，英德两版） | “Immediately double the amount of grain in your supply. If you have no grain, instead double the number of vegetables in your supply. If you have neither grain nor vegetables, you immediately get 1 grain and 1 vegetable.” | 同义，旧措辞。 |
| 10 | A Midsummer Night's Dream | Ein Mittsommernachtstraum | 事件 | 残片 | 附录澄清见第五节。 | 见第五节；洗回。 |
| 11 | French Castle | Burg der Franzosen | 事件 | 残片 | — | 得 3 石 3 食物，跳过你下一次放人机会；设计者与 Hanno Girke 论坛回答为在顺序中被跳过（[BGG 帖 732720](https://boardgamegeek.com/thread/732720)，社区线索）。 |
| 12 | All Your Wood Are Belong to Us | All dein Holz sind gehören uns | 事件 | 残片 | 标题以「君達の森は」开头的日文事件牌按标题推断为此牌。可见残片涉及“你的供应区”“公共供应”“田里的小麦和蔬菜加同样货物”，并有洗回句开头；不足以还原完整 2022 文本。 | 弃所有木，田里谷物和蔬菜数量加倍；洗回。 |
| 13 | Revenant | Wiedergänger | 职业（3+） | 日文全文 | 见第五节。附录：始终把一人留在此牌上作提醒。 | 回家阶段把该成员放在此牌上，不再需要房间；每轮等其他人都放完，再用它执行 2 个行动。 |
| 14 | Werewolf | Werwolf | 职业（1+） | 日文全文 | 见第五节。 | “At end of turn”牺牲 1 只动物，获得 1 个额外行动；无动物则毁 1 名对手 1 只动物，对手获得该行动。 |
| 15 | The Noble Knight | Der edle Ritter | 职业（1+） | **全文** | “Each time you use the "Fishing" accumulation space, you get an additional 2 wood.” 附录：即使只捕到鲑鱼也得木。 | 同义。 |
| 16 | The Fire Bog Flame Spurts Oven | Der Sumpfflammen-Eruptionsofen | 主要发展 | **全文**（费用栏未见） | 见第五节。 | 按动物种类给不同食物的兑换表。 |
| 17 | Land of Milk and Honey | Schlaraffenland | 行动格 | 残片 | 见第五节。 | 使用后该人员移出游戏（之后可通过家庭成长重获），得 10 食物；不能用 guest marker。 |
| 18 | Warrior Princess | Kämpferische Prinzessin | 行动格（替换） | 残片 | 见第四节。 | 新行动：把使用的人员移出游戏，得 5 分；不能用 guest marker。 |
| 19 | Dragon's Lair | Drachenfeld | 行动格 | 残片 | 见第五节。 | 见第五节；规则单称一次来访可献上多只动物或多名成员（非 guest）。 |
| 20 | Fairy Ring | Feenring | 行动格 | 残片 | 见第五节。 | 见第五节。 |
| 21 | The Road Not Taken | Der Weg, den ich nicht nahm | 行动格 | 未核实 | 英文附录：选芦苇＋石头一侧时两者都得。德文附录更具体：得到相应累积格上的全部芦苇和全部石头。 | 把人放在牌的一侧，回合结束时收取版图行动格上残留的该类资源。 |
| 22 | Fences of Unusual Size | Zäune von unnatürlicher Länge | 次要发展 | 日文全文 | 见第五节。 | 原名“FOUS Fences of Unusual Size”，同义。 |
| 23 | The Witch | Die Hexe | 次要发展 | 残片 | 组件：3 个 scry counters。 | 原名 Meeting a witch；见第二节“窥牌”。 |
| 24 | Camelot | Camelot | 次要发展 | 残片 | 附录澄清见第五节。 | 2010 规则单：相当于 1 间额外房间加至多 5 个无围栏马厩，但计分时都不算。 |
| 25 | Chuck the Wood Chuck（附录拼作“Chuck the Woodchuck”） | Horst, der Holzhacker | 职业 | 低清 | “Each time you get wood as the only good from an action, you get 1 additional wood from the general supply.” | 2010 年促销卡（BGG 86457）。 |
| 26 | Peruvian Inquisition | Die peruanische Inquisition | 事件 | **全文** | 见第五节。 | 2012 年促销卡（BGG 132590）。 |

逐卡来源：01–03、25 出自 [BGG 图 7254823](https://boardgamegeek.com/image/7254823)；09 出自[英文官网图片](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png)和[德文官网图片](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_GalleryImage_3.png)；15、16、26 出自 [BGG 图 8137340](https://boardgamegeek.com/image/8137340)；13、14、22 与日文残片出自[日文开箱博客](https://boardgame-replay.com/archives/unboxing-agricola15-230614.html)；德文名与附录澄清出自[德文附录](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=13)；2010 旁证出自 [BGG 图 841493](https://boardgamegeek.com/image/841493) 和 [2010 规则单](https://boardgamegeek.com/image/849713)。25、26 已收入 2022 版由出版社编辑 Grzegorz Kobiela 在 [BGG 帖 3008181](https://boardgamegeek.com/thread/3008181) 确认（社区线索），并与附录编号一致（官方规则）。

## 七、官方 FAQ、勘误与 2010 版差异

**官方裁定**：周年版 FAQ 共四问。Farmers of the Moor 问答为“Yes, you can.”；5–6 人扩展问答为“Absolutely!”；另两问涉及收纳和 L 牌堆的 LE 事件。没有本扩展的专项问答。[英文 FAQ](https://www.lookout-spiele.de/en/games/15yearsofagricolaanniversarybox.html)

没有找到任何本扩展的出版社勘误。2010 产品页 FAQ 回答旧版牌能否与修订版混用，开头为“Yes-ish”，并提醒混用新旧版可能出问题，只建议有经验的玩家这样做，[2010 产品页](https://www.lookout-spiele.de/en/games/agricola_legendary.html)。这说明 2010 牌面不能直接代表 2022 规则。

**2010 → 2022 的已确认差异**（官方规则对照旁证）：

- 张数 24 → 26，加入两张促销卡。2010 规则单写“四类牌”，2022 附录拆出主要发展，写“五类牌”。
- 2022 附录说明本牌堆“have been reworded to comply with the changes made in revised Agricola”。已核实的改写包括：Lady of the Sea → Lady of the Lake，耕“未使用格”→ 耕“fields”；Meeting a Unicorn → The Unicorn；Unicorn Pt. 2 从“你获得家庭成长”改为“抽到时立即执行一次家庭成长行动，即使无法执行负分仍保留”；Werewolf 从“At end of turn”改为“每轮回家阶段之前”（日文版）；The Noble Knight 改为“使用 Fishing 累积格”；Fire Bog 烤炉从按种类兑换改为任一列出的动物换 2 食物，且列出马和仙女。
- 触发规则新增非木累积格上至少 3 木也适用、以及同时取得其他货物不影响两句。
- 附录澄清有改动：04 从 guest marker 改为人员措辞；24 Camelot 从“相当于房间加马厩但不计分”改为“可同时容纳 1 人和至多 5 种不同动物”；17、18 不再写“不能用 guest marker”。

另有线索：BGG 显示 2026 年的《Agricola: Special Edition》（BGG 440147）也收录本扩展，其措辞是否再次修改未调查，不在本次 2022 版范围内。

## 八、人数适用性与组合

| 组合 | 来源能确认的内容 | 未提及 |
| --- | --- | --- |
| 人数 | 周年版盒子标 1–4 人；FAQ 称兼容 5–6 人扩展。2010 产品页标 1–5 人。附录没有为本扩展设人数限制。 | 本扩展在单人或 5–6 人局的特殊规则，**未提及**。 |
| 单人 | 规则书单人规则：每轮“Forest”累积格只放 2 木而不是 3 木，[规则书 p.12](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=12)，**官方规则**。这会改变触发频率，但不构成禁止。 | 需要“其他玩家”“左邻”“对手”的牌（08、10、14、19 等）在单人局如何结算，以及 3+ 职业 13 Revenant 是否移出，**未提及**。 |
| Farmers of the Moor | FAQ 一般兼容；16 号 2022 牌面列出马。 | 农场森林地形取木是否触发、Moor 取暖与 19 号的关系，**未提及**。 |
| Through the Seasons | 附录称该变体可与“基础游戏及其各种扩展的任意组合”一起使用，包括 Farmers of the Moor，[附录 p.10](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=10)，**官方规则**。春季每个木累积格减 1 木、秋季加 1 木，春季建栅栏有免费栅栏。 | 季节增减木与“至少 3 木”的结合、春季免费栅栏与 22 号的叠加，**未提及**。 |
| Parent Cards、选牌与轮抽、Moor Balance Rules | 没有找到任何官方文字。 | **未提及**。 |

## 九、尚未解决的问题

以下问题在所查官方来源中没有唯一答案，应由 [#1528](https://github.com/titanxxh/open-agricola/issues/1528) 处理。凡采纳的答案若无唯一出版依据，须标为 Project Rule Interpretation。

| 领域 | 问题 |
| --- | --- |
| 证据缺口 | 能否找到 04–08、10–12、17–21、23、24 的清晰 2022 英文牌面，以及 16 号完整牌面？在补到之前，这些牌的效果只能以附录澄清、日文残片和 2010 旁证为依据。 |
| 触发口径 | 卡牌另给的木（25、15 等）是否计入 3 木；格上不足 3 木但加卡牌奖励后达到 3 木时如何处理；一次行动多个累积格或多次取物如何计次；只拿走部分累积物的情况（规则要求累积格须全拿）。 |
| 时点 | 抽牌与取物、与其他“取物后”反应的先后；事件在抽牌者当前行动中途结算还是行动结束后结算。 |
| 牌堆生命周期 | 牌堆耗尽；洗回是整副重洗还是插入；23 号窥牌在 2022 版的确切能力。 |
| 自动获得的牌 | 是否付费、是否算“打出”并触发相关效果、是否受数量限制；3+ 职业在 1–2 人局如何处理。 |
| 行动格 | 18 号替换的是 Basic 还是 Urgent Wish for Children；替换时格上资源和人员；英德附录关于替换的不一致；行动格牌在单人局是否照常进入。 |
| 人员 | 10 号借用人员的放置者、受益者、回合口径与归还时点；04 号 2022 版是正式人员还是临时成员、5 人上限；17、18、19 号移除人员后能否再成长；13 号的放置顺序与两个行动；24 号容纳人员是否算房间。 |
| 动物 | 羊驼的饲养容量、交易、烹饪和 8 个标记是否为上限；所有玩家按羊驼计分（无羊驼 -1）在未抽到 26 号时是否也适用；独角兽能否选为羊驼、马或仙女，是否与真实动物配对繁殖；仙女的持有、繁殖、占格是否算 used、最多者 5 分的并列处理；16 号能否把仙女、独角兽换成食物（附录明确独角兽不能）。 |
| 农场 | 19 号烧毁格的 2022 规则（是否算 unused、能否修复）；仙女占格；Camelot 的位置与计分。 |
| 栅栏 | 22 号“一条直线”的判定，以及与其他减费、季节免费栅栏的叠加。 |
| 组合 | 单人与 5–6 人中涉及他人的牌；Farmers of the Moor 农场森林、马与取暖；Through the Seasons；Parent Cards；选牌与轮抽；Moor Balance Rules。 |

## 交接

本研究确认了 2022 版 26 张的编号、英德名称、类型、组件、触发规则和抽到后各类牌的处理方式，并核实了 9 张牌的 2022 牌面（含 3 张日文版）。其余牌的效果仍缺 2022 原文。后续决策不应把原需求 [#1425](https://github.com/titanxxh/open-agricola/issues/1425) 的概述、2010 牌面、社区评测或论坛回复当作 2022 官方裁定。
