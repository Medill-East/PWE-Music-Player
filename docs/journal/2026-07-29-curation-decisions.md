# 曲库策展决策记录 — 2026-07-29

这份文件记录**为什么曲库长这样**。代码里的白名单注释是速查版，这里是完整推理链。
新增或移除白名单条目前，先读这份。

## 一、核心决策：放弃自动搜索，改用人工白名单

前后试过三代策略，前两代都失败：

| 代 | 策略 | 结果 |
|---|---|---|
| 1 | 按 `subject:(piano OR "classical music")` 搜索 + 授权过滤 | 681 首里 44% 是杂音（俄语后朋 `Ariu_Kara`、库存音乐 `jamendo-153087`） |
| 2 | 按作曲家逐个搜索 + 每人限额 + 丢弃 Unknown | 1350 首里 35% 的曲目其标注作曲家名不出现在曲名里；混入 `aporee` 实地录音（火车声、泳池声）、`audiocite` 法语有声书、歌剧与清唱剧 |
| 3 | **人工核验白名单**（当前） | 482 首，逐项确认 |

**结论：archive.org 的免费古典长尾未经策展，元数据启发式无法替代人工核验。**
每加一道闸门都会被下一类垃圾绕过。这不是调参问题，是策略问题。

## 二、踩过的坑（每一条都对应代码里的一道防线）

### 1. identifier 里的词会骗人 —— 必须看 subject/creator

- **`Sacred Harp Singing`**（384 首）：harp 指**人声**不是竖琴，实为无伴奏合唱
- **`The Infinite Lute Compilation`**（25 首）：lute 是**网络厂牌名**不是鲁特琴，
  subject 写着 `cold wave / joy division / factory / new order`，实为冷波后朋合辑。
  **已收录后被用户听出来才发现**——教训是核验时只看了曲目数和授权，没看 subject
- **`bohemiansonata`**：文件名是 `Sonata_1.mp3`，subject 是 `generative / loop / experimental`，实为实验电子乐

### 2. CC0 与 PDM 不是一回事 —— 这是最重要的一条

| | 含义 | 可信度 |
|---|---|---|
| **CC0** (`publicdomain/zero`) | 权利人**主动放弃**权利的法律文件 | 可信 |
| **PDM** (`publicdomain/mark`) | **上传者单方面主张**「这已是公版」 | 仅为主张，谁都能贴 |

- **`b-1-greenleaves`**：`Bruton Music - BRC 6 - 1979 - Guitar And Lute`，
  至今在运营的英国商业配乐库，1979 年英国录音版权到 2049 年，却贴着 PDM。**已移除**
- 反例：Kimiko Ishizaka 的 Open Goldberg / Open WTC 也用 PDM/CC0，但有
  [2015-03-19 PR Newswire 新闻稿](https://www.prnewswire.com/news-releases/kimiko-ishizaka-releases-the-open-well-tempered-clavier-300053401.html)
  与 Kickstarter 4.4 万美元众筹记录佐证，**可信，保留**

**规则：用 PDM 的条目必须另行查证其公版来源。**

### 3. 「古典」≠「轻音乐」

曾混入大量歌剧（`EugeneOnegin`、`DieZauberflöte`）、清唱剧（`MendelssohnStPaul`）、
声乐（`SDRodriansLpEnricoCaruso` 卡鲁索咏叹调）。这些是古典，但是背景音乐的反面。
→ 引入 `kind` 维度（solo / chamber / orchestral），管弦默认不勾。

### 4. 母带 ≠ 成品

`master-tracks-the-open-well-tempered-clavier` 是**原始多轨母带**，
每条是单支话筒拾音（`Mic 06 (Neumann M50): Surround Right`）。它自己的描述就写着
「想听请去 bach-well-tempered-clavier-book-1」——那条已收录，删除无损失。**已移除**

### 5. 子串匹配会误杀（代码 bug）

厂牌黑名单曾用 `identity.includes(label)`，`"emi"` 命中了曲名
`R. Hahn - Premieres Valses` 里的 pr-**emi**-eres，把一张正经的 OnClassical
室内乐专辑当成 EMI 盗版拒掉（同理 Boh-emi-an、ch-emi-stry）。
→ 改为词边界正则 `\b(...)\b`，恢复 18 首。有回归测试锁住。

### 6. 同作品跨合集重复

两套 Musopen 肖邦合集有 80 首重叠（`Ballade no. 1, op. 23` vs `Ballade no. 1 - Op. 23`），
文件 id 不同但听感就是重复。→ 加 `dedupeByWork()`，按「作曲家 + 规范化曲名」二次去重。

## 三、授权立场

用户定位：**公益项目**，免费、无广告、无捐赠、不盈利。

关于 NC（非商业）曲目能否公开分享，依据 CC 官方
[NonCommercial interpretation](https://wiki.creativecommons.org/wiki/NonCommercial_interpretation)：

1. NC 定义为「not primarily intended for or directed towards commercial advantage
   or monetary compensation」，只看**主要目的**，不看使用者身份
2. 更关键：CC 明确指出**发布链接不需要著作权许可**，
   本项目**不托管任何音频**，只存 URL 与元数据，音频由用户浏览器直接从
   archive.org 获取 —— 对 NC 曲目，NC 条款很可能根本不介入

**因此保留全部曲目（含 NC）。** 但：
- **BY 系授权要求署名**，这是明文义务，已在播放器界面逐曲展示
  「作曲家 · 来源 · 授权」并链接到授权原文，另有自动生成的 `CREDITS.md`
- 若日后加广告/捐赠/付费，**必须重新审视 NC 曲目**

⚠️ 以上不构成法律意见。「嵌入播放」与「纯超链接」在部分司法辖区有细微差别。

## 四、术语修正

原先用「织体」描述 独奏/室内乐/管弦，**这是误用**——织体(texture)指单声部/主调/复调。
行业标准说法是**编制**(instrumentation)。已全局改正，数据层字段名 `kind` 保持不变。

## 五、当前状态

- **482 首 / 约 30 小时 / 15 个人工核验来源**
- 编制：独奏 415 · 室内乐 37 · 管弦 30
- 乐器：钢琴 376 · 吉他 39 · 弦乐 37 · 乐团 30
- 作曲家：肖邦 279 · 巴赫 87 · 格里格 31 · Jałochowski 24 · 贝多芬 16 · 其余若干
- 测试 19/19 通过；随机抽样 URL 实测 `200 + audio/mpeg`；浏览器实测真实出声

## 六、未决问题

1. **1930 年代历史录音的公版灰区**：已收 Cortot 肖邦练习曲 24 首（标 `historical`，默认不勾）。
   另有 Artur Schnabel 贝多芬奏鸣曲全集约 63 首**未收**——同为 PDM 标注的 1930 年代录音，
   美国要 2032 年后才进入公有领域。两者处境相同，取舍需用户拍板。
2. **曲库扩充产出低**：搜了 404 个候选只有 15 个通过判据。合法免费的高质量古典**录音**
   本身稀缺（大部分 CC 音乐是当代创作）。继续扩充需人工核验，无法自动化。
3. **iOS PWA 后台音频**未在真机验证。MediaSession 已实现且桌面端确认生效。
