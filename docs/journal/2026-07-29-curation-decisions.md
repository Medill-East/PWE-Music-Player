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

### 7. 时长下限设太高会掐掉真音乐

曾用 60 秒下限「掐掉片段」，实际掐掉的是正经曲目 ——
**古典曲目短的是常态**：肖邦 Op.28 前奏曲多首在 30–45 秒、贝多芬变奏曲每个变奏 30–60 秒、
穆索尔斯基《图画展览会》里反复出现的 Promenade 只有 26 秒。
贝多芬《「看啊，凯旋的英雄」主题 12 变奏》14 个乐章被刷掉 12 个。
→ 下限降到 **25 秒**（仍能掐掉片段/静音/报幕），曲库 938 → 1058 首。

### 8. 专辑内曲名撞车 ≠ 重复曲目

某些来源的乐章**只靠开头序号区分**，曲名清洗剥掉序号后全部同名，
再被 `dedupeByWork` 当成重复删掉 —— 等于把一套变奏曲吃剩一首。
→ **同一专辑内的曲目按定义就是不同录音**，撞名时补 `· No. N` 消歧，而不是去重。

### 9. 曲名要从文件名 slug 里还原

OnClassical 把曲名存成 `{演奏者}_{专辑slug}_{序号}_{真实曲名}` 的下划线长串，
直接显示是 `alessandro deljavan clementi beethoven sonatinas op 36 ahn 5 woo 50 51 25 l.van...`。
→ 通用解法：**取同一专辑内所有曲名的最长公共前缀并剥掉**（那段就是演奏者+专辑名），
再剥掉残留的卷号/序号。不硬编码任何厂牌规则；曲名本就干净的来源公共前缀为空，原样通过。
剥卷号时只在「罗马数字后紧跟数字」时才剥，避免把 `II. Andante` 这类合法乐章号误伤。

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

- **1058 首 / 约 53 小时 / 31 个人工核验来源 / 18 位作曲家**
- 编制：独奏 / 室内乐（管弦已随格里格那条一并移除，筛选项保留备用）
- 作曲家：肖邦 343 · 巴赫 170 · 贝多芬 165 · 格里格 68 · 萨蒂 65 · 莫扎特 56 ·
  乔普林 33 · 德彪西 30 · 穆索尔斯基 27 · Jałochowski 24（吉他）· 雅纳切克 21 ⋯
- 已公开部署：<https://medill-east.github.io/PWE-Music-Player/>
- 测试 19/19；随机抽样 URL 实测 `200 + audio/mpeg`；线上站点实测真实出声

## 六、未决问题

1. **1930 年代历史录音一律不收**（用户定调「有风险的就不收录」）。
   已移除 Cortot 肖邦练习曲；Artur Schnabel 贝多芬奏鸣曲全集同理未收。
   `historical` 这个标签维度暂时没有曲目使用，保留备用。
### 扩充方向的教训：搜索 archive.org ≠ 搜索互联网

我连续几轮都在 archive.org 内部搜，挖尽 OnClassical 后就得出「合法免费的古典录音已经找不到了」
的结论。**这个结论是错的**，错在把「archive.org 上有什么」当成了「世界上有什么」。

换成从**网页调研**入手（由 Codex 用 agent-reach 执行），立刻找到一批 archive.org 上没有的渠道：

| 渠道 | 授权 | 结论 |
|---|---|---|
| **Pandora Records**（ibiblio.org） | EFF Open Audio License | ✅ **已采用**，约 450 首器乐，厂牌自有母带 |
| MAESTRO（Google Magenta） | CC BY-NC-SA 4.0 | ❌ 1276 首真人钢琴演奏，但只提供整包 ZIP，本项目不托管音频 |
| LOC National Jukebox | 美国国会图书馆认定 pre-1923 公版 | ⏸ 机构级权利判断，可信度高于用户贴的 PDM；但本机访问 403 |
| SMD（萨尔兰音乐学院） | CC BY-NC-SA 3.0 | ⏸ 约 166 首器乐，页面 403 |
| Isabella Stewart Gardner 博物馆 | CC BY-NC-ND | ❌ 是**播客**不是纯音乐，28 分钟节目含主持人讲解 |
| Magnatune | CC BY-NC-SA | ❌ 需付费会员 |
| Musopen 官网（10 万+ 文件） | — | ❌ 全站 403，封机器人 |

**方法论教训**：在一个平台内部反复换关键词，收益会迅速趋零；换一个**发现层**
（从「这个平台上有什么」变成「这类内容在世界上由谁发布」）才能突破。
两者应当并行，而不是先穷尽前者。

### 另一个代码层面的发现

`itemTracks` 曾写死只接受 `format === "VBR MP3"`。archive.org 的 MP3 衍生文件
还有 `128Kbps MP3`、`64Kbps MP3` 等格式名，**这些来源会被静默跳过**
（ISGM 就是全部 `128Kbps MP3`，扫描结果显示 0 首可用，一度被误判为「没有音频」）。
目前收录的来源恰好都是 `VBR MP3` 所以没出问题，但这个限制真实存在，
将来接入新 archive.org 来源时若发现「明明有音频却抓到 0 首」，先查这里。

2. **曲库扩充靠人工，无法自动化**。当前 31 个来源里 20 个来自 OnClassical
   （厂牌自授权、演奏者具名，是目前找到的信噪比最高的来源）。
   继续扩充建议优先找**权利人自行释出**的来源：厂牌自授权、艺人自发布、众筹释出公版。
3. ~~iOS PWA 后台音频未在真机验证~~ —— **已验证**：真机可播放，锁屏正常显示曲目信息，
   MediaSession 在移动端生效。

5. **播放失败的根因是网络通路，不是代码**。一位使用者在 Windows + Chrome 上频繁失败，
   控制台显示 `net::ERR_CONNECTION_RESET`，且同一首曲目连续两个不同的 archive.org
   存储节点（`dn721704.ca` / `ia903202.us`）都被切断。同一时间：
   - 本机全量检查 1058/1058 通过；
   - 同一使用者的手机可正常播放。

   即连接在传输层被间歇性切断，与曲目、与代码无关。已做的缓解是重试 5 次 + 递增退避
   （0.9s → 1.8s → …），这能提高成功率但无法根治。

   **架构层面的固有弱点**：所有音频实时从 archive.org 取流，网络到 archive.org
   不通时无解。若长期困扰，可考虑把播放过的音频缓存进 IndexedDB
   （代价是占用存储，且首次播放仍需过网络）。

   附带教训：诊断这类问题必须拿到**使用者浏览器的真实报错**。此前我反复从本机测试，
   结果全绿，方向完全错了。是控制台里的 `ERR_CONNECTION_RESET` 一行定的案。
   另注意使用者控制台里的 `403 / exceptions.UserAuthError` 来自一个名为 `Chat-Memo`
   的浏览器扩展，与本项目无关——排查时要先区分报错来源。
4. **部分曲名大小写不理想**（如 `L.van beethoven sonatina in c major`），
   源数据本身即为小写 slug，已提取到可得的最好结果。
