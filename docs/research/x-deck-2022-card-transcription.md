# X-Deck 2022 版中文牌图转录与英文来源对照

研究日期：2026-11-01。目标版本：Lookout Games 2022 年《Agricola 15》周年版（Agricola 15 / 15 Years of Agricola）中的 X-Deck。仓库基线：`2cf5c21be`。

本报告回答 [#1546](https://github.com/titanxxh/open-agricola/issues/1546)，并按 [#1547](https://github.com/titanxxh/open-agricola/issues/1547) 补入 X08、X11、X12、X14、X15、X18、X21 七张英文实物牌原文（2026-11-01，见第四节），属于地图 [#1544](https://github.com/titanxxh/open-agricola/issues/1544)。并行的出版规则研究见 [#1545 的固定 commit 报告](https://github.com/titanxxh/open-agricola/blob/13fbbe4893f32154df685c02d1ce92bf61bc2c56/docs/research/x-deck-2022-published-rules.md)（下称“#1545 报告”）。本报告只记录牌面能确认什么、不能确认什么，不采纳 Project Rule Interpretation，也不核对本仓库代码能力。牌图只转录文字，没有复制进仓库。

## 证据等级

由强到弱排列，沿用 #1545 报告的标记，另加两种译文等级。

| 标记 | 含义 |
| --- | --- |
| **官方规则** | Lookout 2022 年出版的规则书、附录或出版社官网文字。 |
| **官方牌面** | 2022 版英文牌面原文。出版社官网图片标为“官方牌面（出版社图片）”；第三方拍摄的实物照片标为“官方牌面（社区照片）”，用户提供的实物照片标为“官方牌面（用户实物照片）”，清晰度另行说明。 |
| **官方裁定** | 出版社 FAQ 或勘误。X-Deck 没有找到任何一条（见 #1545 报告第六节）。 |
| **中文贴条实物牌图** | 本机 BGA 参考快照中的 24 张牌图（下称“中文牌图”）。版式、牌号、图标、分值与 2022 英文实物牌一致（已用 X01、X02、X06、X08、X09、X11、X12、X14、X15、X18、X19、X20、X21 对照），文字区是中文译文，译者与出版方不明。弱于英文官方牌面。 |
| **日文官方译本（社区照片）** | Hobby Japan 日文版的实物牌照片。日文是 2022 版的官方译本，不是英文原文；与中文同为译文，两者冲突时不能单独定案。 |
| **社区线索** | BGG 论坛、评测、玩家转引的牌面文字。设计者或出版社编辑在论坛上的个人回复也归此级，不升级为官方裁定。 |
| **旁证（2008）** | 2008 年原版 X-Deck 的英文牌面与论坛回复。原版按初版 Agricola 写成，2022 附录说明牌面已按修订版改写，只能在 2022 文本有歧义或缺失时作旁证。 |

“未提及”表示所查来源没有相关文字；“禁止”只在来源明文禁止时使用。

## 来源与局限

| 来源 | 本文用途 | 局限 |
| --- | --- | --- |
| 本机 BGA 参考快照 `/home/xxh/bga-agricola/.worktree/agricolag-snapshot-20261027`（commit `289b951b`）的 `img/narrative/XE01_Narrative.png`–`XE24_Narrative.png` | 24 张中文牌图，逐张转录于第二节。每张约 370–410×555–600 像素，用 PIL 放大 2 倍并局部再放大后全部文字可读，没有遮挡。 | 本机快照，不是公开链接；来源与版权不明，本仓库只转录文字。 |
| 同快照 `modules/php/Helpers/NarrativeDefinitions.php` | 每张牌的中文 `desc`、`kind`、`vp`、`reshuffle` 字段，只作对照（第三节）。 | 文件头注释写明来源为“user workbook and Lookout 15-year appendix”，不是牌图。快照中的实现是第三方规则取舍，本文不评价，也不当作官方裁定。 |
| [英文附录 p.11–12](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=11)（16 页 PDF，创建于 2022-05-12）、[德文附录 p.11–12](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Appendix_155_DE_WEB.pdf#page=11) | 24 张的英、德牌名与分类，X01、X18、X20、X21 的逐卡澄清。`pdftotext -layout` 提取并渲染 p.12 人工核对。 | 附录只列牌名和四条澄清，不印牌面效果。通则与组件见 #1545 报告。 |
| [英文官网卡牌拼图](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_GalleryImage.png)、[德文官网卡牌拼图](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_GalleryImage_3.png) | X20 英文、德文牌面的右半。 | 左半被另一张牌遮住。 |
| [BGG 图 8137342](https://boardgamegeek.com/image/8137342)（2024，Agricola 15 图库） | X06、X01、X19 三张完整、清晰的 2022 英文牌面。 | 社区照片，只有三张。 |
| [BGG 图 7254822](https://boardgamegeek.com/image/7254822)，出自 [Silver Duck 评测](https://boardgamegeek.com/blogpost/142069/agricola-15-agricola-x-and-legendairy-forest-deck)（2022-12-29 上传） | X02、X06、X09、X14 的 2022 英文牌面和牌背。 | 原图只有 567×207 像素，放大后可读，但不保证每个字符。 |
| [日文开箱博客](https://boardgame-replay.com/archives/unboxing-agricola15-230614.html)（2023） | 日文版 X01、X04、X07、X13、X23 的完整牌面，X12 的大部分，其余牌的残片。 | 社区照片，多数牌相互遮挡；日文是译本。 |
| [BGG 帖 3027136](https://boardgamegeek.com/thread/3027136)（2023-02）、[BGG 帖 2990858](https://boardgamegeek.com/thread/2990858)（2022-12） | 玩家 Kazuki Asakura 转引的 X03、X10、X12 英文文字，以及 Geoff Burkman、Grzegorz Kobiela 等人的回复。 | 社区线索。转引者说他对照了德文和英文版，没有说明转引文字逐字抄自英文牌面。 |
| 用户提供的 2022 英文实物牌照片（2026-11-01，本机 `/home/xxh/x-deck-2022-photos/X08-X11-X12-X14-X15-X18-X21-english-cards.png`，4096×3072） | X08、X11、X12、X14、X15、X18、X21 七张完整英文牌面，正面完整入镜，印刷编号、分值、图标与全部文字清晰可读；X08、X18、X21 的正文另按原分辨率裁切逐字核对。 | 本机照片，不是公开链接，不提交仓库；只有这七张。 |
| [BGG 图 420914](https://boardgamegeek.com/image/420914)、[420922](https://boardgamegeek.com/image/420922)、[420923](https://boardgamegeek.com/image/420923)（2009 年上传，“English Edition”） | 2008 原版英文 24 张牌面全文。 | 旁证（2008）。 |
| BGG X-Deck 论坛旧帖（逐条链接见下文） | 2008 版设计者 Hanno Girke、Dave Fair 等人对旧牌的回复。 | 社区线索，且针对旧版牌面。 |

另查了 Lookout 的 X-Deck 与周年版产品页、BGG 条目 359999 与 38733 的图库、文件区和论坛帖子标题。没有找到出版社发布的 2022 版完整牌面扫描、逐卡 FAQ 或勘误，也没有找到 BGG 上的 2022 版英文全卡转录。中文牌图的译者与出版方不明；#1545 报告只找到原版的 2009 年繁体中文版名称。

## 结论速览

- 24 张中文牌图齐全、清晰，已逐张转录印刷编号、名称、牌框、分值、角标、类别图标、全文与括注（第二节）。**中文贴条实物牌图**。
- 牌框分五组，与附录分类一致，只有一处例外：X01–X03 与 X23 用米色羊皮纸牌框，X04–X06 红框，X07–X12 绿框，X13–X22 蓝框，X24 黄框。X23 的牌框与行动格相同，但附录把它列在事件下，牌面也没有“行动格”字样。米色牌框的四张没有右侧的 X 圆章，其余 20 张都有。
- 印刷分值：X04、X05、X06 各 2 分，X08 为 −3 分，X22 为 3 分。人数标记只有 X24 的紫色“1+”。24 张都没有费用栏，也**都没有洗回句**（#1545 报告列出的核对项）。
- 可对照的英文牌面有 13 张：X01、X06、X19 清晰全文（社区照片），X08、X11、X12、X14、X15、X18、X21 清晰全文（用户实物照片，[#1547](https://github.com/titanxxh/open-agricola/issues/1547)），X02、X09 低清全文，X20 出版社图片右半；另有 X03、X10 的玩家转引英文。日文官方译本有 X01、X04、X07、X13、X23 全文和 X12 的大部分。中文与这些英文逐句一致，与日文全文也一致；X12 的喂养规则与日文冲突，英文牌面支持中文。
- X14 的“和家庭成员”指已经在西采石场上的那个人员，英文原文为“Place the newborn with the person on the "Western Quarry" accumulation space.”，已由用户实物照片清晰确认。
- `NarrativeDefinitions.php` 与牌图的差异已逐张核对，地图列出的 X03、X09、X10、X11、X12、X13、X14、X15、X18 九处都属实；另有 X02、X08、X15、X16、X21、X22、X24 等处会改变理解（第三节）。
- 原列为需英文原牌确认的 5 张 **X08、X11、X15、X18、X21** 和建议顺带拍的 X12、X14，已于 2026-11-01 由用户实物照片补齐（第四至七节）。英文原文回答了译文问题；英文同样没有写明的部分，转为第八节的规则空白。
- 其余问题来自牌面本身的规则空白，英文原文也未必回答，交 #1548（第八节）。

## 一、牌面版式与图标

据 24 张中文牌图，并与英文照片（X01、X02、X06、X09、X14、X19、X20）和日文照片对照，版式一致。**中文贴条实物牌图 / 官方牌面（社区照片）**。

| 组别 | 牌 | 牌框 | 附录分类（官方规则） |
| --- | --- | --- | --- |
| 米色 | X01–X03、X23 | 米色羊皮纸标题框加藤蔓边框，文字框在上半，插画在下半；牌号在标题框左下；无 X 圆章；类别图标在文字框右下。X23 的插画是麦田怪圈本身。 | X01–X03 为 Alien Action Spaces；X23 为 Alien Events |
| 红色 | X04–X06 | 红框；左侧黄色圆形分值“2”；右侧绿色 X 圆章 | Merchants from Outer Space |
| 绿色 | X07–X12 | 绿框，六边形画框两侧是藤蔓；X10 两侧是指向左方的绿色箭头 | Alien Artifacts |
| 蓝色 | X13–X22 | 蓝框，与 2022 英文 X19、X20 相同 | Alien Events |
| 黄色 | X24 | 黄框，拱形标题，圆形画框，左侧紫色方框“1+” | Alien Occupation |

- **牌号**：所有牌都印“X”加两位数字（X01–X24），位于标题框左下。BGA 文件名的“XE”前缀不在牌面上。
- **X 圆章**：右侧绿色圆章内印“X”，是牌堆标记；米色牌框的四张没有。
- **分值**：X04–X06 左侧黄色圆形“2”；X08 左侧深棕色圆形“−3”；X22 左侧黄色圆形“3”。其余牌没有印刷分值。X02、X07、X12、X17、X24 通过正文给奖励分数。
- **小金币图标**：X07、X12、X17 在画框左下角另有一枚小金色圆形图标，内有竖长方块，形似奖励分标记。
- **人数标记**：只有 X24 印紫色方框“1+”，日文版照片同样是“1+”。[规则书 p.3](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=3) 说明 [1+] 指 1–4 人。
- **类别图标**：附录 p.2 定义的八种小圆章，在 X 圆章左下（米色牌框在文字框右下）：井字＝Farm Planner、人形＝Actions Booster、圆中方块＝Points Provider、篮子＝Goods Provider、麦穗＝Crop Provider、铲形＝Building Resource Provider、马蹄铁＝Livestock Provider。24 张没有用到刀叉（Food Provider）。逐张见第二节。
- **其他图标**：X01 有两个“+1 作物落到田上”的图示；X02 有资源组“−1x→ 4”兑换图示；X08 有 3 个燃料罐；X09 有草叉；X12 有两个毛球；X17 有一颗糖果。
- **费用栏与洗回句**：24 张都没有。日文与英文照片可见部分也没有洗回句。

## 二、逐张转录

来源：BGA 参考快照 `289b951b` 的 `img/narrative/XE01_Narrative.png`–`XE24_Narrative.png`，等级为**中文贴条实物牌图**。逐字照录牌面文字，标点宽度按图形近似录入；方括号内是对图标的描述，不是牌面文字。牌面上多数括注排成斜体，这里不另标。每张的属性行依次为：牌框、分值、人数标记、类别图标、其他图标。24 张都没有费用栏和洗回句，下文不再重复。牌面没有风味文字。

**X01 异星粪便**：米色牌框；无分值；无人数标记；类别麦穗（Crop Provider）；文字框上方图示“+1[谷物]↓[田]　+1[蔬菜]↓[田]”。  
正文：本卡牌是一个所有玩家均可使用的行动格。当你使用它时，立即在你的每个谷物和蔬菜农田上分别增加1个谷物或1个蔬菜(从公共供应堆拿取)。

**X02 自制火箭**：米色牌框；无印刷分值；无人数标记；类别圆中方块（Points Provider）；正文下方图示“[木][木][芦苇] / [黏土][黏土][石] −1x→ (4)”。  
正文：本卡牌是一个所有玩家均可使用的行动格。当你使用它时，立即将正好一组货物——由2个木材、2个黏土、1个芦苇和1个石材组成——交换为4点奖励分数。

**X03 变形器**：米色牌框；无分值；无人数标记；类别篮子（Goods Provider）。  
正文：本卡牌是一个所有玩家均可使用的行动格。当你使用它时，立即将你供应堆中一个类型的全部货物交换为公共供应堆中相同数量的另一种货物。或者，将一个累积格上的全部货物交换为相同数量的另一种货物。(食物、建造资源和动物都视为货物。)

**X04 木星商人**：红框；分值 **2**；无人数标记；类别圆中方块。  
正文：将本卡牌放在游戏版图旁。第一位建造1个畜棚并额外支付2个芦苇的玩家获得本卡牌。

**X05 火星商人**：红框；分值 **2**；无人数标记；类别圆中方块。  
正文：将本卡牌放在游戏版图旁。第一位执行“需要空房间的家庭增长”行动并额外支付2个食物的玩家获得本卡牌。

**X06 冥王星商人**：红框；分值 **2**；无人数标记；类别圆中方块。  
正文：将本卡牌放在游戏版图旁。第一位使用“围栏”行动格并额外支付2个石材的玩家获得本卡牌。

**X07 灵脉**：绿框；无印刷分值，左下小金币图标；无人数标记；类别圆中方块。  
正文：游戏结束计分时，你农场版图上五列中每有一列含有3个房间、3个农田或3个属于同一个牧场的牧场格子，你获得1点奖励分数。在此你只能从每个牧场获得至多1点奖励分数。

**X08 奇异外星能量**：绿框；分值 **−3**；无人数标记；类别人形（Actions Booster）；正文右下画 3 个燃料罐。  
正文：在本卡牌上放置3个燃料罐。在每个回家阶段开始前，你可以立即归还本卡牌上正好1个燃料罐以使用一个未被占据的行动格的效果。

**X09 外星雇农**：绿框；无分值；无人数标记；类别篮子；正文右下画一把草叉。  
正文：立即标记任意一个累积格。在每个回家阶段开始前，如果标记的格子未被占据，你可以立即从该格上拿取1个货物。

**X10 复制器**：绿框，画框两侧为指向左方的箭头；无分值；无人数标记；类别篮子。  
正文：下一次你使用一个累积格时，你每从该格拿取1个货物，你从公共供应堆额外获得1个相同类型的货物。  
末句（粗体小字）：你获得那些货物后，将本卡牌放到你左手边的玩家面前。

**X11 X锉刀**：绿框；无分值；无人数标记；类别铲形（Building Resource Provider）。  
正文：每次你建造至少1个栅栏、1个畜棚或1个木造房间时，你总计少支付1个木材。

**X12 毛茸朋友**：绿框；无印刷分值，左下小金币图标；无人数标记；类别圆中方块；正文右下画两个毛球。  
正文：在本卡牌上放置2个太空毛球，并且在每次收成的收割步骤中，本卡牌上每有2个太空毛球，在本卡牌上额外放置1个太空毛球(向下取整)。在每个供养步骤中，你必须为每个太空毛球支付1个食物，或任该太空毛球离去并失去1点分数。游戏结束计分时，本卡牌上每有1个太空毛球，你获得1点奖励分数。

**X13 银河尽头的餐馆**：蓝框；无分值；无人数标记；类别圆中方块。  
正文：游戏结束时，获得正好42分的玩家获胜。否则，分数最高的玩家获胜。

**X14 异星奇缘**：蓝框；无分值；无人数标记；类别人形。  
正文：立即执行“无需空房间的家庭增长”行动。(将新生儿和家庭成员放到“西采石场”累积格上。)

**X15 三脚入侵者**：蓝框；无分值；无人数标记；类别人形。  
正文：在每个回家阶段结束时，每位玩家必须支付任意1个货物，或将自己房屋中的1个家庭成员归还到自己供应堆中。执行“家庭增长”行动额外花费1个食物。

**X16 把我传送下去，威尔士人**：蓝框；无分值；无人数标记；类别人形。  
正文：你决定每位其他玩家下一个家庭成员必须放置在哪儿。(必须按照规则选择行动格。如果有玩家已经放置了其全部家庭成员，你决定下一轮其第一个家庭成员放置在哪儿。)

**X17 糖果追踪**：蓝框；无印刷分值，左下小金币图标；无人数标记；类别圆中方块；正文右下画一颗糖果。  
正文：立即选择计分2、3、4、5或6点奖励分数。将两倍该数量的糖果分发到不同的行动格上。当你使用一个行动格时，移除其上的糖果。游戏结束计分时，游戏版图上每有1个糖果剩余，你获得-1分。

**X18 我是你的父亲**：蓝框；无分值；无人数标记；类别人形。  
正文：你可以立即支付任意5个货物给另一位玩家，以收养其1个后代——就是将其1个家庭成员交换给你，无论你房屋中是否有房间。(你必须立即实行这个行动，否则其没有效果。)

**X19 外星人绑架**：蓝框；无分值；无人数标记；类别马蹄铁（Livestock Provider）。  
正文：你立即额外获得1个羊、1个野猪和1个牛。然而，在本轮的回家阶段中，你必须将你的1个家庭成员归还到你的供应堆中(而不是回到你的房屋)。

**X20 亲爱的，我把这缩小了……**：蓝框；无分值；无人数标记；类别井字（Farm Planner）。  
正文：外星人把你的动物缩小到一半尺寸。你的牧场和畜棚现在可以容纳两倍数量的动物。(但你的房屋不能。)不幸的是，你的动物也只提供通常情况下一半数量的食物(向下取整)。

**X21 小心喷嘴!**：蓝框；无分值；无人数标记；类别井字。  
正文：飞碟造访了每个农场。飞碟的喷嘴烧毁了所有木造房间，将所有砖土房间烧制成了石造房间，并且对石造房间没有效果。任何没有房屋剩下的玩家可以使用一个“翻新”行动，用总计2个木材和1个芦苇获得2个木造房屋。

**X22 碳凝表亲**：蓝框；分值 **3**；无人数标记；类别人形。  
正文：在本轮的回家阶段中，将目前的轮数加上4并在对应的轮次格上放置你的1个家庭成员。(直到那时该家庭成员都被冻在碳凝合金中。)在该轮的工作阶段开始时，在起始玩家进行其第一个回合前，你可以用该家庭成员执行一个行动。

**X23 麦田怪圈**：米色牌框，插画是麦田怪圈；无分值；无人数标记；无“!”或其他事件标记；类别井字。  
正文：将本卡牌放在你的农场中，使其覆盖2个相邻的格子。这些格子视为已使用，且不能再以任何其他方式被使用。如果你将本卡牌放在你已经建造的某些东西顶上，将其从你的农场中移除。

**X24 反抗军**：黄框；无印刷分值；紫色方框 **1+**；类别圆中方块。  
正文：立即计分5点奖励分数。在本轮的回家阶段中，将你的1个家庭成员放在本卡牌上。该家庭成员不能再执行任何行动，但依然在你的房屋中需要房间，且在每次收成期间都必须供养。

牌面用语前后一致：“供应堆”对应 your supply，“公共供应堆”对应 general supply，“货物”对应 goods，“奖励分数”对应 bonus points，“家庭成员”对应 person / people（X19 英文“one of your people”译作“你的1个家庭成员”）。X15、X19 的家庭成员归还到“供应堆”，不是“公共供应堆”。

## 三、与 `NarrativeDefinitions.php` 的差异

只作说明，不采纳快照的规则取舍。意思相同的措辞差异（如“饭”与“食物”、“仓库”与“供应堆”、“增加家庭成员（无需空房间）”与“无需空房间的家庭增长”、“1分”与“1点奖励分数”）不逐条列出。会改变理解的差异如下，均以牌图为准。

| 牌 | 牌图 | `desc` |
| --- | --- | --- |
| X02 | 立即将**正好一组**货物交换为4点奖励分数 | “可支付”2木2土1芦1石，获得4奖励分；无“正好一组” |
| X03 | 交换“货物”；有括注“食物、建造资源和动物都视为货物” | 交换“资源”；无括注 |
| X08 | 归还**正好1个**燃料罐以使用一个未被占据的行动格**的效果** | 移除1个燃料罐来使用1个未被占据的行动格，另加“**无需派遣家庭成员**” |
| X09 | 在每个回家阶段开始**前**；拿取1个货物 | 每个回家阶段开始**时**；拿取1个资源 |
| X10 | 使用累积格**时**；获得货物后放到**左手边的玩家面前** | 使用累积格**后**；每“实际”拿取1个；放入**下家已打出的牌区**，另加“下家可以继续使用此效果” |
| X11 | 每次建造**至少1个**栅栏、1个畜棚或1个木造房间时，**总计**少支付1个木材 | 每当建造栅栏、畜棚或木造房间时，费用减少1木 |
| X12 | 标题“毛茸朋友” | 标题“毛绒朋友” |
| X13 | 标题“银河尽头的餐馆” | 标题“银河尽头的太空餐厅” |
| X14 | 将新生儿**和家庭成员**放到“西采石场”累积格上 | 将新生儿放置到西采石场累积格上 |
| X15 | 标题“三脚入侵者”；支付任意1个“货物”，或将自己**房屋中的**1个家庭成员归还；执行“家庭增长”行动额外花费1个食物 | 标题“三角入侵者”；支付1个任意“资源”，或将1名家庭成员返还；执行“增加家庭成员”行动**前**需额外支付1饭 |
| X16 | 标题“把我传送下去，威尔士人” | 标题“把我传下去，威尔士人” |
| X18 | 支付任意5个“货物”；无论你房屋中是否有房间；括注“(你必须立即实行这个行动，否则其没有效果。)” | 支付5个任意“资源”；无需空房间；无括注 |
| X21 | 烧毁所有“木造房间”，砖土“房间”变石造“房间”；“任何没有房屋剩下的玩家可以使用一个‘翻新’行动，用总计2个木材和1个芦苇获得2个木造房屋” | “木屋”“砖屋”“石屋”；“没有房间的玩家可以通过执行‘翻新’行动，支付2木和1芦苇作为总费用来建造2个木造房间” |
| X22 | 括注“直到那时”；“你可以用该家庭成员执行一个行动” | 无“直到那时”；“你可以派遣该名家庭成员” |
| X23 | 覆盖2个相邻的格子 | 覆盖“恰好”2个相邻的农场格子 |
| X24 | 依然在你的房屋中需要房间 | 依然占据你的空房间 |

字段核对：`kind` 为 X01–X03 action、X04–X06 merchant、X07–X12 artifact、X13–X23 event、X24 occupation，与附录分类一致；`vp` 为 X04–X06 2、X08 −3、X22 3，与印刷分值一致；`reshuffle` 全部为 false，与牌面没有洗回句一致。X01、X04–X07、X13、X17、X19、X20 的 `desc` 与牌图没有会改变理解的差异。

## 四、英文与其他译本来源

逐张列出能找到的最强英文证据。“—”表示没有找到。

| 牌 | 2022 英文名（附录，官方规则） | 2022 英文牌面 | 其他 2022 来源 | 旁证（2008） |
| --- | --- | --- | --- | --- |
| X01 | Extraterrestrial Excrement | 全文清晰（BGG 图 8137342），**官方牌面（社区照片）** | 附录澄清；日文全文 | Immediately place one additional Grain on each Grain plant and one additional Vegetable on each Vegetable plant. |
| X02 | Homemade Space Rocket | 全文低清（BGG 图 7254822），**官方牌面（社区照片）** | 日文残片 | Pay 2 Wood, 2 Clay, 1 Reed and 1 Stone to score 4 Bonus points. |
| X03 | Transmogrifier | — | 玩家转引英文（BGG 帖 2990858），**社区线索**；日文残片 | 可换成任意货物，但须能立即安置或烹饪；或把行动格上的货物换种 |
| X04 | Merchants of Jupiter | — | 日文全文 | The first player to build 1 Stable and pay 2 additional Reed receives this card. |
| X05 | Merchants of Mars | — | 日文残片 | The first player to use the standard Family Growth action (with space in their Home) and pay 2 additional Food receives this card. |
| X06 | Merchants of Pluto | 全文清晰（8137342）与低清（7254822） | — | The first player to use the simple Build Fences action and pay 2 additional Stone receives this card. |
| X07 | Ley Lines | — | 日文全文 | 每竖列 3 个房间、3 块田或占满一列的 3 格牧场各 1 分 |
| X08 | Strange Alien Energy | 全文清晰（用户实物照片），**官方牌面（用户实物照片）** | 日文残片（可见“未占有”） | Place three Guest markers on this card. At the start of the Returning Home phase of any Round, before players take back their Family members, you may move one marker from this card to take any unused action. |
| X09 | Alien Farmhand | 全文低清（7254822） | — | 在提供资源或动物的行动格上放 1 个标记；回家阶段若该行动没有人用，可拿 1 个货物 |
| X10 | Replicator | — | 玩家转引英文首句（BGG 帖 3027136） | The next time you take Goods from an Action space, you receive twice as many Goods of that type. As soon as you have received the goods, pass this card to the player to your left. |
| X11 | The X File | 全文清晰（用户实物照片） | 日文残片（可见“柵1本以…”“木の部屋1…”“合計から”） | Whenever you pay Wood to build Fences, Stables or Rooms **as an Action**, you pay 1 less Wood in total. |
| X12 | Furry Friends | 全文清晰（用户实物照片） | 玩家转引英文（BGG 帖 3027136）；日文大部分 | 每次收成每 2 个毛球繁殖 1 个；喂不起或不想喂的毛球逃走，每逃走 1 个扣 1 分 |
| X13 | Space Diner at the End of the Galaxy | — | 日文全文 | A player whose final score is 42 automatically wins the game. |
| X14 | Earthlings Are Easy | 全文清晰（用户实物照片）；全文低清（7254822） | — | Immediately carry out the Family Growth even without Room in your Home action.（名为 Earth Girls Are Easy） |
| X15 | Tripods | 全文清晰（用户实物照片） | 日文残片 | Every player must pay 1 Good in tribute. **If a player cannot pay the Good**, the Aliens kill one of his or her Family members. Players must pay 1 Food whenever they use **any** Family growth action. |
| X16 | Beam Me Down, Welshie | — | 日文残片 | You decide where each other player places their next Family member. (…) Resistance is futile. |
| X17 | Candy Trail | — | 日文残片 | Your Family members must collect these markers by taking an action on the marked spaces. |
| X18 | I Am Your Father | 全文清晰（用户实物照片） | 附录澄清；日文残片 | You may adopt one child from another player's family. You must pay him or her 5 resources to do so. Exchange this Person disc for one of your own. You need not have an empty room in your home. (You must carry out this action immediately, or it has no effect.) |
| X19 | Alien Abduction | 全文清晰（8137342） | — | You immediately lose the Family member who took this action, and he or she is never seen again. |
| X20 | Darling, I Shrunk ... | 右半（英文官网拼图），**官方牌面（出版社图片）** | 附录澄清；德文官网拼图右半 | 同义 |
| X21 | Mind the Jets! | 全文清晰（用户实物照片） | 附录澄清（英德不一致）；日文残片 | (Any player who is left with no hut can "renovate" to a 2-room Wooden hut for 2 Wood and 1 Reed) |
| X22 | Carbonite Cousin | — | 日文残片（可见分值 3） | The family member **taking this action** is frozen in Carbonite. He will be rescued in the Returning home phase 3 Rounds from now. (…) |
| X23 | Crop Circles | — | 日文全文 | Place this card on your Farm board in such a way that it covers 2 spaces. These spaces count as used, but can't be used in any other way. |
| X24 | Rebel | — | 日文残片（可见“1+”） | The Family member **taking this Action** decides to devote the rest of the game to fighting for the Rebels. Place it on this card. (…) 印 5 分 |

已取得的 2022 英文牌面原文（逐字）：

- **X01 Extraterrestrial Excrement**（清晰）：“This is an action space for all. When you use it, immediately add 1 grain and 1 vegetable from the general supply to each of your grain and vegetable fields, respectively.” 类别麦穗。
- **X02 Homemade Space Rocket**（低清）：“This is an action space for all. When you use it, immediately exchange exactly one set of goods comprising 2 wood, 2 clay, 1 reed, and 1 stone for 4 bonus points.” 兑换图示与中文相同。
- **X06 Merchants of Pluto**（清晰）：“Place this card next to the game board. The first player to use the "Fencing" action space and pay an additional 2 stone gets this card.” 印 2 分。
- **X08 Strange Alien Energy**（清晰，用户实物照片）：“Place three fuel tanks on this card. Immediately before each returning home phase, you can return exactly one fuel tank from this card to use the effects of an unoccupied action space.” 印 −3 分。
- **X09 Alien Farmhand**（低清）：“Immediately mark an accumulation space of your choice. Immediately before each returning home phase, if the marked space is unoccupied, you can take one good from it.”
- **X11 The X File**（清晰，用户实物照片）：“Each time you build at least 1 fence, 1 stable, or 1 wood room, you pay 1 wood less in total.”
- **X12 Furry Friends**（清晰，用户实物照片）：“Place 2 space woozles on this card and, in the field phase of each harvest, an additional 1 space woozle for every 2 space woozles on it *(rounded down)*. In each feeding phase, you must pay 1 food for each space woozle or let it go, losing 1 point if you do the latter. During scoring, you get 1 bonus point for each space woozle on this card.” 与第四节下文的玩家转引逐字一致。
- **X14 Earthlings Are Easy**（清晰，用户实物照片；另有低清社区照片）：“Immediately take the "Family Growth without Room" action. *(Place the newborn with the person on the "Western Quarry" accumulation space.)*”
- **X15 Tripods**（清晰，用户实物照片）：“At the end of each returning home phase, each player must pay 1 good of their choice or return a person from their house to their supply. Taking the "Family Growth" action costs an additional 1 food.”
- **X18 I Am Your Father**（清晰，用户实物照片）：“You can immediately pay 5 goods of your choice to another player to adopt one of their offspring, i.e., exchange their person for yours, regardless of whether you have room in your house or not. *(You must carry out this action immediately, or it has no effect.)*”
- **X21 Mind the Jets!**（清晰，用户实物照片）：“Flying saucers visit each farm. Their jets burn down all wood rooms, harden all clay rooms to stone rooms, and have no effect on stone rooms. Any player who is left with no house can use a "Renovation" action to get two wood rooms for a total of 2 wood and 1 reed.”
- **X19 Alien Abduction**（清晰）：“You immediately get an additional 1 sheep, 1 wild boar, and 1 cattle. However, in the returning home phase of this round, you must return one of your people to your supply *(instead of your house)*.”
- **X20 Darling, I Shrunk ...**（右半）：“…shrunk your animals to …ir size. Your pastures …es can now hold twice …nimals. *(Your house …* Unfortunately, your …o provide only half … amount of food …*ded down)*.” 德文右半：“…schrumpfen deine Tiere … Größe. Deine Weiden …lle können ab sofort …o viele Tiere halten. (…nicht für dein Haus.) …rhältst du nur noch …le Nährwerte für … (abgerundet).”

玩家转引的英文（**社区线索**）：

- **X03**（[BGG 帖 2990858](https://boardgamegeek.com/thread/2990858)）：“This is an action space for all. When you use it, immediately exchange all goods of one type in your supply for the same number of goods of a different type from the general supply. Alternatively, exchange all goods on an accumulation space for the same number of a different good. (Food, building resources, and animals are all considered goods.)” 提问者问作物是否也算货物；2022 版编辑 Grzegorz Kobiela 回复“Just an oversight”，另两位玩家回复作物一直算货物。
- **X10**（[BGG 帖 3027136](https://boardgamegeek.com/thread/3027136)）：“The next time you use an accumulation space, for each good you take from that space, you get one additional good of the same type from the general supply.” 提问者说日文版写成只额外获得 1 个。
- **X12**（同帖）：“Place 2 space woozles on this card and, in the field phase of each harvest, an additional 1 space woozle for every 2 space woozles on it (rounded down). In each feeding phase, you must pay 1 food for each space woozle or let it go, losing 1 point if you do the latter. During scoring, you get 1 bonus point for each space woozle on this card.” 提问者说日文版写成只要有 1 个喂不起就全部逃走。Legen\*dairy Forest 设计者 Geoff Burkman 回复两处都是日文误译，只有没喂的毛球逃走，每个扣 1 分。

日文官方译本全文（**日文官方译本（社区照片）**，[日文开箱博客](https://boardgame-replay.com/archives/unboxing-agricola15-230614.html)）：

- **X01 地球外排泄物**：このカードは、全員が使えるアクションスペースである。このカードを使うとき、すぐに小麦畑と野菜畑それぞれに、共通のストックから小麦1と野菜1ずつを追加する。
- **X04 木星の商人**：このカードをゲームボードの横に置く。最初に、厩1を建設して、追加で葦2を支払ったプレイヤーは、このカードを得る。
- **X07 レイライン**：得点計算時、あなたの農場ボードの縦一列の部屋3、縦一列の畑3、縦一列に並んだ同じ牧場に属する牧場スペース3の、それぞれにつきボーナス1点を得る。これによって得られるボーナス点は、牧場1つにつき1点まで。
- **X13 銀河の果ての宇宙食堂**：ゲーム終了時、ちょうど42点のプレイヤーはゲームに勝利する。そうでない場合、得点が最も多いプレイヤーが勝利する。
- **X23 ミステリーサークル**：このカードをあなたの農場にある隣接するスペース2つを覆うように置く。このカードで覆ったスペースは使用済みと見なし、他の方法では使えない。このカードをすでに何かを建設したスペースの上に置く場合は、それらを農場から取り除く。
- **X12 フサフサの友人**（下半被手指遮挡）：このカードの上に毛むくじゃらの宇宙生物2つを置き、各収穫の畑フェイズに、このカードの上の毛むくじゃらの宇宙生物2つにつき、毛むくじゃらの宇宙生物1つを追加する(端数切捨て)。各食料供給フェイズに、毛むくじゃらの宇宙生物1つにつき食料1を支払うか、毛むくじゃらの宇宙生物をすべて手放さなければならない。後者の場合、1…

## 五、译文核对

| 牌 | 对照来源 | 结果 |
| --- | --- | --- |
| X08、X11、X12、X14、X15、X18、X21 | 英文清晰照片（用户实物照片） | 逐句一致，没有增删规则。X08“正好1个燃料罐”“未被占据的行动格的效果”对应“exactly one fuel tank”“the effects of an unoccupied action space”；X11“至少”“总计”对应“at least”“in total”；X15“任意1个货物”“自己房屋中的”对应“1 good of their choice”“from their house”；X18“后代”“交换”对应“offspring”“exchange their person for yours”；X21“木造房间”“没有房屋剩下”“‘翻新’行动”对应“wood rooms”“left with no house”“"Renovation" action”。只有 X21 末句的“2个木造房屋”在英文是“two wood rooms”，译文把 rooms 译成了“房屋”。 |
| X01、X06、X19 | 英文清晰照片 | 逐句一致。X01 中文“分别增加1个谷物或1个蔬菜”对应“add 1 grain and 1 vegetable … respectively”，意思相同。X19“你的1个家庭成员”对应“one of your people”。 |
| X02、X09、X14 | 英文低清照片 | 意思一致。X02“正好一组”对应“exactly one set”；X09“在每个回家阶段开始前”对应“Immediately before each returning home phase”。X14 见下行。 |
| X14 | 英文低清照片 | 英文“Place the newborn with the person on the "Western Quarry" accumulation space”：新生儿放到西采石场上已有的那个人员旁边。中文“将新生儿和家庭成员放到……”的“家庭成员”就是这个人员；中文语序容易读成把另一个家庭成员也放过去，但没有增删规则。 |
| X20 | 英文、德文出版社图片右半 | 可见部分一致。 |
| X03、X10、X12 | 玩家转引英文 | 逐句一致，包括 X03 括注、X10“每拿取1个货物额外获得1个”、X12“为每个太空毛球支付1个食物，或任该太空毛球离去并失去1点分数”。X12 的转引已由用户实物照片逐字确认。 |
| X01、X04、X07、X13、X23 | 日文全文 | 意思一致。X13 两版都写“否则，分数最高的玩家获胜”。 |
| X12 | 日文大部分 | **冲突**：日文写“支付每个毛球 1 食物，或者让全部毛球离开”，中文和英文牌面都是逐个选择。 |

结论：在可对照的 19 张牌上，中文译文贴近英文，没有找到增删规则的地方；与日文冲突的 X12，英文牌面（用户实物照片）支持中文。原先因英文缺失而列为歧义的 5 张，英文原文已补齐，见第六节。

## 六、歧义表

列出中文译文可能改变规则结果的句子。“已解答”表示英文证据已经回答；“规则空白”表示英文原文同样不回答，交 #1548。2026-11-01 起，原“需英文”的 X08、X11、X15、X18、X21 和“建议拍照”的 X12、X14 都已有清晰英文实物牌（用户实物照片），下表“英文原文”一栏逐问作答。

| 牌 | 中文牌图句子 | 已有证据 | 问题 | 状态 |
| --- | --- | --- | --- | --- |
| X08 | “在每个回家阶段开始前，你可以立即归还本卡牌上正好1个燃料罐以使用一个未被占据的行动格的效果。” | 英文（用户实物照片）：“Immediately before each returning home phase, you can return exactly one fuel tank from this card to use the effects of an unoccupied action space.” 2008 用访客标记“take any unused action”。`desc` 另加的“无需派遣家庭成员”不在英文中。 | ①英文写“use the effects of an unoccupied action space”，没有写放人，也没有明文写“不放人”。②未写明是否要求该格当前能合法放人。③未写明是否限版图上的行动格。④“Immediately before each returning home phase, you can return exactly one fuel tank”：每个回家阶段前至多归还 1 个。 | ①④**已解答**（措辞已定；是否放人仍交 #1548）；②③**规则空白**，交 #1548 |
| X11 | “每次你建造至少1个栅栏、1个畜棚或1个木造房间时，你总计少支付1个木材。” | 英文（用户实物照片）：“Each time you build at least 1 fence, 1 stable, or 1 wood room, you pay 1 wood less in total.” 2008 有“as an Action”。 | ①2022 英文**没有**“as an action”。②“Each time you build … you pay 1 wood less in total”没有说同一次行动建造两类设施时算一次还是两次。③写明“wood room”。 | ①③**已解答**；②**规则空白**，交 #1548 |
| X12 | “你必须为每个太空毛球支付1个食物，或任该太空毛球离去并失去1点分数。” | 英文（用户实物照片）：“you must pay 1 food for each space woozle or let it go, losing 1 point if you do the latter.” 日文是全部离开。 | 逐个喂养，还是一个喂不起就全部离开；每个离开的毛球各扣 1 分。 | **已解答**：逐个选择，每离开 1 个扣 1 分；日文是误译 |
| X14 | “(将新生儿和家庭成员放到‘西采石场’累积格上。)” | 英文（用户实物照片）：“Immediately take the "Family Growth without Room" action. *(Place the newborn with the person on the "Western Quarry" accumulation space.)*” 2008 版设计者 Hanno Girke 的旧牌回复见 [BGG 帖 480359](https://boardgamegeek.com/thread/480359)（社区线索）。 | “家庭成员”指谁。 | **已解答**：指已在西采石场上的人员 |
| X15 | “每位玩家必须支付任意1个货物，或将自己房屋中的1个家庭成员归还到自己供应堆中。执行‘家庭增长’行动额外花费1个食物。” | 英文（用户实物照片）：“At the end of each returning home phase, each player must pay 1 good of their choice or return a person from their house to their supply. Taking the "Family Growth" action costs an additional 1 food.” 2008 是付不起才失去家庭成员，并写“any Family growth action”。 | ①英文写“must pay 1 good of their choice or return a person”，没有 2008 的“付不起才归还”条件。②原文“from their house”。③英文写“Taking the "Family Growth" action”，没有“any”；X14 另把“Family Growth without Room”写成一个单独命名的行动，是否覆盖它和卡牌给的家庭增长，英文未写明。 | ①②**已解答**；③**规则空白**，交 #1548 |
| X18 | “以收养其1个后代——就是将其1个家庭成员交换给你，无论你房屋中是否有房间。” | 英文（用户实物照片）：“You can immediately pay 5 goods of your choice to another player to adopt one of their offspring, i.e., exchange their person for yours, regardless of whether you have room in your house or not. *(You must carry out this action immediately, or it has no effect.)*” 附录澄清“You cannot use this action if you have 5 people already”。2008：“Exchange this Person disc for one of your own”。 | ①英文写“offspring”，紧接着用“i.e., exchange their person”解释，没有限定只能收养新生儿。②“exchange their person for yours”，与 2008“Exchange this Person disc for one of your own”同义，没有写双方互换；结合附录澄清，你的人数加 1。③未限定对方哪类人员（已放出、在房屋中、新生儿）。④原文是“goods”。 | ②④**已解答**；①③**规则空白**，交 #1548 |
| X21 | “任何没有房屋剩下的玩家可以使用一个‘翻新’行动，用总计2个木材和1个芦苇获得2个木造房屋。” | 英文（用户实物照片）：“Their jets burn down all wood rooms, harden all clay rooms to stone rooms, and have no effect on stone rooms. Any player who is left with no house can use a "Renovation" action to get two wood rooms for a total of 2 wood and 1 reed.” 附录英德澄清不一致（见 #1545 报告第五节）。2008：“"renovate" to a 2-room Wooden hut”。 | ①英文写“use a "Renovation" action”，与 X15“Taking the "Family Growth" action”同一种写法；是否须占用含翻修的行动格，未写明。②“two wood rooms”：2 个木造房间（中文“房屋”是 rooms 的译法），建在哪里未写明。③“for a total of 2 wood and 1 reed”是取得两个木造房间的总价；未提正常翻修费用。④原文“left with no house”。 | ②③④措辞**已解答**；①及②的位置**规则空白**，交 #1548 |
| X10 | “将本卡牌放到你左手边的玩家面前。” | 2008 同义；转引英文首句一致。[规则书 p.4](https://www.lookout-spiele.de/upload/en_15yearsofagricolaanniversarybox.html_Argicola_Aniversery_Rules_155_EN_WEB.pdf#page=4) 规定顺时针轮流，左手边即下家。 | 牌传过去后接手玩家是否同样生效；单人局没有左手边玩家。 | 译文无歧义；规则空白交 #1548 |
| X16 | “你决定每位其他玩家下一个家庭成员必须放置在哪儿。” | 2008 同义。 | 是抽牌时一次决定，还是轮到对方放人时再决定；所选行动格在放人时已不合法怎么办；单人局。 | 译文无歧义；规则空白交 #1548 |
| X17 | “当你使用一个行动格时，移除其上的糖果。” | 2008：“Your Family members must collect these markers”。 | 只有抽牌者使用才移除，中文与 2008 一致。糖果能否放在版图旁的行动格牌上、未进场的轮次格上；剩余糖果在行动格牌被替换时如何计算。 | 译文无歧义；规则空白交 #1548 |
| X19、X22、X24 | “你的1个家庭成员” | X19 英文为“one of your people”；2008 的 X19、X22、X24 都是“使用这个行动的那个人员”。 | 任意一名家庭成员，还是抽牌的那个人员（与 Legen\*dairy Forest 17–19 的同类问题相同）。 | X19 已由英文确认措辞；X22、X24 按同一译法推断为同一措辞；选人规则交 #1548 |
| X13 | “获得正好42分的玩家获胜。否则，分数最高的玩家获胜。” | 日文全文一致。 | 多名玩家正好 42 分、单人局如何判定胜负。 | 译文无歧义；规则空白交 #1548 |
| X03 | “或者，将一个累积格上的全部货物交换为相同数量的另一种货物。” | 转引英文一致；Kobiela 回复作物也算货物。 | 换出的货物留在累积格上还是归你；换成动物时的安置。 | 译文无歧义；规则空白交 #1548 |

## 七、拍照清单（供 [#1547](https://github.com/titanxxh/open-agricola/issues/1547)）

**已完成（2026-11-01）**：用户提供了下列七张牌的 2022 英文实物牌合照，保存在本机 `/home/xxh/x-deck-2022-photos/X08-X11-X12-X14-X15-X18-X21-english-cards.png`，不提交仓库。原文见第四节，逐问回答见第六节。以下保留原清单作记录。

正面完整入镜，清晰到能逐字转录，含角标与图标。照片放在本机 `/home/xxh/x-deck-2022-photos/`，文件名以牌号开头，不提交仓库。

**必拍（5 张）**：

1. **X08 Strange Alien Energy**：原文怎样描述“使用一个未被占据的行动格的效果”，是否写明不放人；是否写明只能用版图上的行动格，或可用版图旁的行动格牌；“正好1个”是否表示每个回家阶段至多 1 个燃料罐；时点是否为“Immediately before each returning home phase”。
2. **X11 The X File**：是否保留 2008 的“as an action”；“至少1个……总计少支付1个木材”的英文句式，能否看出同一次行动建造两类设施时减几次；“木造房间”是否写 wooden。
3. **X15 Tripods**：“支付1个货物或归还1名家庭成员”是自由二选一，还是付不起才归还；“自己房屋中的”原文；食物附加费是否写“any Family Growth action”。
4. **X18 I Am Your Father**：“后代”的原文（offspring / child / person）；“交换”的原文（用你供应堆的人员替换，还是互换）；“任意5个货物”是 goods 还是 resources；是否限定对方哪类人员。
5. **X21 Mind the Jets!**：“使用一个‘翻新’行动”的原文（行动格名、action 还是 renovate）；“获得2个木造房屋”是 2-room house 还是 2 rooms；“总计2个木材和1个芦苇”的原文；“没有房屋剩下”的原文。

**建议顺带拍（2 张）**：

6. **X12 Furry Friends**：确认“pay 1 food for each space woozle or let it go, losing 1 point”的原文，把社区转引升为官方牌面。
7. **X14 Earthlings Are Easy**：确认低清照片中的“Place the newborn with the person on the "Western Quarry" accumulation space.”。

其余 17 张不需要英文原牌：X01、X02、X06、X09、X19 已有英文全文，X20 已有英文局部且附录澄清同义，X03、X10 有转引英文；X04、X07、X13、X23 中日一致；X05、X16、X17、X22、X24 的待定问题属于英文原文也未必回答的规则空白。

## 八、交给 #1548 的规则空白

以下问题来自牌面本身，不是译文问题；英文原牌若补充了文字，再从本表删除。凡采纳的答案若无唯一出版依据，须标为 Project Rule Interpretation。通则层面的空白（触发口径、翻牌时点、牌堆耗尽、物品与职业是否付费或算打出等）见 #1545 报告第九节，这里不重复。

| 牌 | 问题 |
| --- | --- |
| X02 | 付不起一组货物时能否占用此格。 |
| X03 | 换成动物时须能安置还是可以立即烹饪（2008 写须能安置或烹饪）；累积格上换出的货物留在格上；作物是否算货物（Kobiela 回复算，社区线索）。 |
| X04–X06 | X04 经卡牌建畜棚、扩建农场同时建多个畜棚是否算；X05 经卡牌执行的需要空房间的家庭增长是否算；X06 只写“使用‘围栏’行动格”；额外费用是否可选；抽到商人的那一次行动是否已能满足条件；无人购买的商人终局如何处理。 |
| X07 | “五列”在 Farmers of the Moor 农场地形下的含义；同一牧场跨两列时如何计分。 |
| X08 | 英文只写“use the effects of an unoccupied action space”：是否放人、是否算“使用该行动格”（触发放人或使用行动格相关的卡牌）；是否要求该格当前能合法放人；是否限版图上的行动格，还是包括版图旁的行动格牌；能否用需要额外条件的行动格（例如家庭增长需空房间）；能否用累积格并取走其上全部货物；能否用当轮尚未进场的行动格。 |
| X09 | 标记的累积格被替换或移除时如何处理；格上有多种货物时拿哪种。 |
| X11 | 英文“Each time you build at least 1 fence, 1 stable, or 1 wood room, you pay 1 wood less in total”没有“as an action”：经卡牌效果建造是否同样减费；同一次行动建造两类设施（例如扩建农场同时建房间和畜棚）时减一次还是各减一次；建造无需木材的设施（例如免费栅栏）时如何处理。 |
| X10 | 接手玩家是否同样生效、能否一直传递；单人局；与 X-Deck 翻牌同一行动时的先后。 |
| X12 | 毛球是否算动物或货物；与 X20 等动物效果的关系。 |
| X13 | 多名玩家正好 42 分；单人局胜负。 |
| X14 | 新生儿在西采石场上当轮能否再行动（它已经在行动格上）；没有人员在西采石场时（例如经卡牌效果取石）如何处理。 |
| X15 | 回家阶段结束时付货物的顺序；X22、X24 等不在房屋中的人员是否计入；英文“Taking the "Family Growth" action”是否覆盖无需空房间的家庭增长（X14 单独命名为“Family Growth without Room”）以及卡牌给的家庭增长；英文写自由二选一，与 2008“付不起才归还”不同，有货物时也可选择归还人员。 |
| X16 | 决定时点；所选行动格不再合法时；单人局。 |
| X17 | 糖果能否放在版图旁的行动格牌、尚未进场的行动格上；其他玩家使用该格是否移除糖果（牌面写“你”）。 |
| X18 | 英文“adopt one of their offspring, i.e., exchange their person for yours”：只能收养新生儿，还是对方任意人员；可选对方已放出、在房屋中还是新生儿的人员；收养的人员当轮能否行动；对方只剩 1 人时能否收养；单人局。 |
| X19、X22、X24 | “你的1个家庭成员”是否必须是抽牌的那个人员；X22 冻结期间是否需要房间与食物（2008 版设计者 Melissa Rogerson 回复须保留房间，[BGG 帖 354265](https://boardgamegeek.com/thread/354265)，社区线索）；轮数加 4 超过第 14 轮时如何处理。 |
| X20 | “一半数量的食物（向下取整）”按每次兑换还是每只动物取整；房屋中的宠物、牌上的动物容量是否翻倍；附录：计分照常、以后获得的动物也缩小。 |
| X21 | 英文“use a "Renovation" action to get two wood rooms for a total of 2 wood and 1 reed”：是否须占用含翻修的行动格，还是单独执行一次；两个木造房间建在哪里（原房屋位置或任意格）；附录英德澄清冲突（“unused”是否只在计分时适用；“rebuilt”与“搬进新木屋 / 翻修”）；房屋烧毁期间家庭增长与房间数；附录只说把预印木房间标记为烧毁，另建的木造房间如何标记、12 块烧毁标记是否为上限，未提及；Farmers of the Moor 下的取暖。 |
| X22 | 印刷的 3 分归谁、事件牌结算后放在哪里。 |
| X23 | 能否覆盖房间、牧场或已有动物的格子；被移除的设施如何处理。 |
| X24 | 1+ 职业在单人局照常；放上卡牌的人员是否仍计入家庭成员数。 |

## 九、对模型票的提示

只列牌面事实，不替模型票做选择。

- [#1549](https://github.com/titanxxh/open-agricola/issues/1549)（牌堆生命周期、公共行动格与商人）：24 张都没有洗回句；X23 用行动格牌框但属于事件；X22 事件印 3 分，需要决定事件牌的去处；X10 会在玩家之间传递。
- [#1550](https://github.com/titanxxh/open-agricola/issues/1550)（人员生命周期与跨玩家放置）：X14 新生儿直接出现在西采石场；X15、X19 归还到个人供应堆；X16 替他人决定放置；X18 收养他人人员；X22 冻结在轮次格上；X24 人员放在牌上但仍占房间、仍需供养；X21 家人露宿。
- [#1551](https://github.com/titanxxh/open-agricola/issues/1551)（物品与行动格交互）：X03 改写累积格上的货物；X08 不放人使用行动格的效果；X09 标记累积格并拿 1 个货物；X10 复制累积格收益；X17 在行动格上放糖果；X02 兑换一组货物。
- [#1552](https://github.com/titanxxh/open-agricola/issues/1552)（农场、动物、特殊生物与胜负）：X07 按列计分；X11 建造减费；X12 太空毛球的繁殖与供养；X13 正好 42 分获胜；X20 动物容量翻倍、食物减半；X21 烧毁木造房间；X23 覆盖两个农场格。

## 交接

24 张中文牌图已逐张转录，版式与附录分类一致：X23 用行动格牌框但属事件，X24 印 1+，没有一张印洗回句。可对照的 2022 英文牌面有 13 张（X01、X06、X19 与用户拍摄的 X08、X11、X12、X14、X15、X18、X21 清晰，X02、X09 低清，X20 局部），另有 X03、X10 的玩家转引；中文与这些英文逐句一致，与日文官方译本只在 X12 冲突，英文牌面支持中文。`NarrativeDefinitions.php` 是改写，丢了 X03、X08、X11、X14、X15、X18 等处的规则细节，不能当牌面文本。原先需要拍英文原牌确认的 X08、X11、X15、X18、X21，以及建议顺带拍的 X12、X14，已于 2026-11-01 由用户实物照片补齐：译文问题均已回答，英文同样没写明的部分转入第八节。后续决策不应把 2008 牌面、论坛回复、评测、日文译本或第三方实现当作 2022 官方裁定。
