# PWE 古典轻音乐 / PWE Classical Music

## 中文

### 这是什么

一个免费的公版古典音乐收听站。它不会重复播放：听过的曲目不会再次出现，直到你主动重置历史。

### 为什么做

常见音乐 App 的“轻音乐电台”往往只是固定歌单循环，听上几天就会重样。这个项目希望提供一个可以长时间打开、持续遇见不同作品的安静入口。

### 曲库怎么来的

全部录音来自 Internet Archive，并经过逐项人工核验，确认是公版或由权利人自行采用 Creative Commons 授权。当前曲库有 966 首，约 53 小时，涵盖 18 位作曲家，包括：

- Musopen 通过众筹制作、以 CC0 释出的肖邦作品全集；
- Kimiko Ishizaka 众筹并释出公有领域的 Open Goldberg Variations 与 Open Well-Tempered Clavier；
- OnClassical 厂牌自行授权的专业录音（演奏者均具名），涵盖萧邦、巴赫、贝多芬、德彪西、萨蒂、格里格、莫扎特、穆索尔斯基、雅纳切克、斯科特·乔普林等；
- Beethoven 大提琴奏鸣曲等室内乐；
- 采用 CC 授权、由演奏者本人发布的古典吉他作品。

我们**只收录权利人自身授权的录音**。任何由第三方上传、标注授权与实际权利状态不符的内容一律不收——例如商业厂牌的历史录音，即使被贴上公版标记也不采用。

### 为什么是人工核验

自动搜索会混入实地录音、有声书、后朋克合辑等无关内容，只看元数据标签并不可靠。例如，“Sacred Harp”是无伴奏合唱而不是竖琴，“Infinite Lute”是网络厂牌名而不是鲁特琴。因此，这里的曲库是一份逐项确认过的人工白名单。

### 授权与非商业声明

本项目为公益性质，免费、无广告、无捐赠、不盈利。本仓库不托管任何音频文件；浏览器会直接从 Internet Archive 获取音频。

代码采用 MIT 许可。音乐保留各自的第三方授权，详情见 [CREDITS.md](CREDITS.md) 与播放器内的逐曲标注。部分曲目采用 CC BY-NC 授权，禁止商业使用。

### 怎么用

打开网页即可收听，也可以通过浏览器“添加到主屏幕”作为 App 使用。播放器支持按编制、乐器筛选，并提供睡眠定时功能。

### 免责声明

作者已尽力核验每项录音的授权，但这些信息不构成法律意见。如果你是权利人并认为某首曲目不应被收录，请提交 issue，我们会立即移除。

### 本地运行

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080/
```

## English

### What is this?

PWE Classical Music is a free listening site for public-domain classical recordings. It does not repeat tracks: once heard, a track stays out of rotation until you reset your listening history.

### Why make it?

The “light music radio” stations in common music apps are often fixed playlists on a loop. After a few days, the same tracks return. This project offers a quiet place that can keep playing for longer while continuing to surface different works.

### Where does the catalog come from?

Every recording comes from Internet Archive and has been checked individually to confirm it is public domain or was licensed under Creative Commons by the rights holder. The current catalog contains 966 tracks—about 53 hours—across 18 composers, including:

- Musopen’s crowdfunded, CC0 complete Chopin works;
- Kimiko Ishizaka’s crowdfunded, public-domain Open Goldberg Variations and Open Well-Tempered Clavier;
- professional recordings self-licensed by the OnClassical label (performers are credited by name), covering Chopin, Bach, Beethoven, Debussy, Satie, Grieg, Mozart, Mussorgsky, Janáček and Scott Joplin;
- chamber works such as Beethoven’s cello sonatas;
- CC-licensed classical guitar works published by the performers themselves.

Only recordings licensed by their own rights holders are included. Anything uploaded by a third party whose stated license does not match the actual rights position is excluded — commercial-label historical recordings are left out even when someone has tagged them as public domain.

### Why verify it by hand?

Automated searches bring in unrelated field recordings, audiobooks, and post-punk compilations. Metadata labels alone are unreliable. “Sacred Harp,” for example, is unaccompanied choral music rather than harp music, while “Infinite Lute” is the name of an online label rather than a lute recording. The catalog is therefore maintained as a human-reviewed allowlist.

### Licensing and non-commercial statement

This is a public-interest project: it is free, carries no advertising, accepts no donations, and earns no revenue. The repository does not host audio. Your browser streams each file directly from Internet Archive.

The code is MIT-licensed. Each recording retains its own third-party terms; see [CREDITS.md](CREDITS.md) and the per-track attribution in the player. Some recordings use CC BY-NC licenses and may not be used commercially.

### How to use it

Open the website and press play. You can also use “Add to Home Screen” to install it like an app. Filters are available for instrumentation and instrument, along with a sleep timer.

### Disclaimer

The author has made a good-faith effort to verify the licenses, but this is not legal advice. If you are a rights holder and believe a track should not be included, please open an issue and it will be removed promptly.

### Run locally

```bash
python3 -m http.server 8080
# Open http://localhost:8080/
```
