import { dictionaries, translate } from "./i18n.js";
import { getLicenseLabel } from "./license.js";

const DB_NAME = "pwe-music-player";
// v2：旧版会因为一次加载超时就把曲目永久拉黑，升级时清空这份黑名单，
// 把被误判的曲目放回曲库。播放历史（played）不动。
const DB_VERSION = 2;
const PLAYED_STORE = "played";
const BAD_STORE = "bad";
const FILTERS_STORAGE_KEY = "pwe-music-player-filters";
const LANGUAGE_STORAGE_KEY = "pwe-music-player-language";
const LISTEN_THRESHOLD_SECONDS = 30;
// archive.org 冷启动读取可能很慢，超时给足，否则会把正常曲目误判为坏曲目。
const LOAD_TIMEOUT_MS = 45_000;
// 连续失败达到这个数就停止自动跳过：网络出问题时不能让播放器一路烧穿整个曲库。
const MAX_CONSECUTIVE_FAILURES = 3;
// 同一曲目先重试再说，原因有两层：
//   1) archive.org 单个存储节点约 1/5 概率瞬时失败；
//   2) 部分网络环境下到存储节点子域名的连接会被间歇性 RST（实测 ERR_CONNECTION_RESET，
//      同一首连着两个不同节点都被切断，但换个时间又能放）。
// 两种都属于「重试有用」的失败，所以给足次数，并且退避后再试
// ——连接刚被 RST 时立刻重连通常还是会被 RST。
const MAX_TRACK_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 900;

const ALL_FILTERS = {
  kinds: new Set(["solo", "chamber", "orchestral"]),
  instruments: new Set(["piano", "harpsichord", "organ", "guitar", "strings", "wind", "orchestra"]),
  includeHistorical: true,
};

export function defaultFilters() {
  return {
    kinds: new Set(["solo", "chamber"]),
    instruments: new Set(["piano", "harpsichord", "organ", "guitar", "strings", "wind", "orchestra"]),
    includeHistorical: false,
  };
}

function initialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved in dictionaries) return saved;
  } catch {
    // Fall back to the browser language when storage is unavailable.
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

// 优先用曲库里存的 item 可读标题；旧版 catalog 没有该字段时退回把 identifier 拆成词。
export function readableSource(track) {
  const title = typeof track === "object" ? String(track?.sourceTitle || "").trim() : "";
  if (title) return title;
  const identifier = typeof track === "object" ? track?.source : track;
  return String(identifier || "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function matchesFilter(track, filters) {
  return filters.kinds.has(track.kind)
    && filters.instruments.has(track.instrument)
    && (filters.includeHistorical || !track.historical);
}

export function chooseNextTrack(
  tracks,
  playedIds,
  badIds,
  random = Math.random,
  filters = ALL_FILTERS,
) {
  const pool = tracks
    .filter((track) => matchesFilter(track, filters))
    .filter((track) => !playedIds.has(track.id) && !badIds.has(track.id));
  if (pool.length === 0) return null;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

export function getPoolStatus(tracks, playedIds, badIds, filters) {
  const matching = tracks.filter((track) => matchesFilter(track, filters));
  if (matching.length === 0) return "filtered-empty";
  if (matching.every((track) => playedIds.has(track.id) || badIds.has(track.id))) return "exhausted";
  return "available";
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PLAYED_STORE)) database.createObjectStore(PLAYED_STORE);
      if (!database.objectStoreNames.contains(BAD_STORE)) database.createObjectStore(BAD_STORE);
      // 从 v1 升上来时清掉旧的坏曲目黑名单——那份名单里多是被超时误判的正常曲目。
      if (event.oldVersion > 0 && event.oldVersion < 2) {
        request.transaction.objectStore(BAD_STORE).clear();
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readKeys(database, storeName) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).getAllKeys();
    request.onsuccess = () => resolve(new Set(request.result));
    request.onerror = () => reject(request.error);
  });
}

function writeKey(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readwrite").objectStore(storeName).put(true, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function clearStore(database, storeName) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readwrite").objectStore(storeName).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// 把失败原因说清楚。笼统的「加载失败」无法定位问题——
// MediaError 的四种类型指向完全不同的原因（网络 / 解码 / 格式 / 中止）。
export function describeMediaError(audio) {
  const codes = { 1: "ABORTED", 2: "NETWORK", 3: "DECODE", 4: "SRC_NOT_SUPPORTED" };
  const error = audio?.error;
  const parts = [];
  if (error) parts.push(`${codes[error.code] || error.code}${error.message ? `: ${error.message}` : ""}`);
  else parts.push("TIMEOUT");
  parts.push(`net=${audio?.networkState ?? "?"}`, `ready=${audio?.readyState ?? "?"}`);
  if (typeof navigator !== "undefined" && navigator.onLine === false) parts.push("offline");
  return parts.join(" ");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

async function initPlayer() {
  const elements = {
    audio: document.querySelector("#player"),
    title: document.querySelector("#track-title"),
    composer: document.querySelector("#composer"),
    attribution: document.querySelector("#attribution"),
    attributionPrefix: document.querySelector("#attribution-prefix"),
    license: document.querySelector("#license-link"),
    source: document.querySelector("#source-link"),
    play: document.querySelector("#play-button"),
    playLabel: document.querySelector("#play-label"),
    next: document.querySelector("#next-button"),
    volume: document.querySelector("#volume"),
    sleep: document.querySelector("#sleep-timer"),
    sleepStatus: document.querySelector("#sleep-status"),
    progress: document.querySelector("#progress"),
    elapsed: document.querySelector("#elapsed"),
    duration: document.querySelector("#duration"),
    stats: document.querySelector("#stats"),
    status: document.querySelector("#status"),
    reset: document.querySelector("#reset-history"),
    filters: document.querySelector("#filters"),
    language: document.querySelector("#language-select"),
  };

  let language = initialLanguage();
  let database;
  let catalog;
  let played = new Set();
  let bad = new Set();
  let currentTrack = null;
  let queuedTrack = null;
  let preloader = null;
  let listenedSeconds = 0;
  let lastListenTick = 0;
  let listenTimer = null;
  let loadTimer = null;
  let loadToken = 0;
  let failureInProgress = false;
  let consecutiveFailures = 0;
  let trackAttempts = 0;
  let lastFailureDetail = "";
  let sleepTimer = null;
  let sleepTicker = null;
  let sleepDeadline = 0;
  let isFading = false;
  let activeFilters = defaultFilters();
  let lastStatus = { key: "initializing", values: {}, kind: "" };
  let emptyView = "";

  function t(key, values = {}) {
    return translate(language, key, values);
  }

  function applyStaticTranslations() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    for (const element of document.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }
    for (const element of document.querySelectorAll("[data-i18n-aria-label]")) {
      element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
    }
    for (const element of document.querySelectorAll("[data-i18n-content]")) {
      element.setAttribute("content", t(element.dataset.i18nContent));
    }
    elements.language.value = language;
  }

  function setStatus(key, kind = "", values = {}) {
    lastStatus = { key, values, kind };
    elements.status.textContent = t(key, values);
    elements.status.dataset.kind = kind;
  }

  function renderAttribution() {
    if (!currentTrack) {
      elements.attribution.hidden = true;
      return;
    }
    elements.attributionPrefix.textContent = t("attributionPrefix", {
      composer: currentTrack.composer,
      source: readableSource(currentTrack),
    });
    elements.license.textContent = getLicenseLabel(currentTrack.license);
    elements.license.href = currentTrack.license;
    elements.attribution.hidden = false;
  }

  function renderEmptyView() {
    if (emptyView === "exhausted") {
      elements.title.textContent = t("catalogExhausted", { count: catalog.count });
      elements.composer.textContent = t("resetToRestart");
    } else if (emptyView === "filtered") {
      elements.title.textContent = t("filteredEmptyTitle");
      elements.composer.textContent = t("relaxFilters");
    } else if (emptyView === "error") {
      elements.title.textContent = t("playerUnavailable");
    } else if (currentTrack) {
      // 标题/作曲家在 HTML 里带着 data-i18n 占位文案，applyStaticTranslations 会把它们
      // 重写回「正在准备曲库」。切换语言后必须把当前曲目的信息填回去，否则正在播放的
      // 曲名会被占位文案覆盖。
      elements.title.textContent = currentTrack.title;
      elements.composer.textContent = currentTrack.composer;
    }
  }

  function readFiltersFromControls() {
    return {
      kinds: new Set(
        [...elements.filters.querySelectorAll('input[name="kind"]:checked')]
          .map((input) => input.value),
      ),
      instruments: new Set(
        [...elements.filters.querySelectorAll('input[name="instrument"]:checked')]
          .map((input) => input.value),
      ),
      includeHistorical: elements.filters.querySelector("#include-historical").checked,
    };
  }

  function applyStoredFilters() {
    try {
      const saved = JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY));
      if (!saved || !Array.isArray(saved.kinds) || !Array.isArray(saved.instruments)) return;
      for (const input of elements.filters.querySelectorAll('input[name="kind"]')) {
        input.checked = saved.kinds.includes(input.value);
      }
      for (const input of elements.filters.querySelectorAll('input[name="instrument"]')) {
        input.checked = saved.instruments.includes(input.value);
      }
      elements.filters.querySelector("#include-historical").checked = saved.includeHistorical === true;
    } catch {
      // Keep defaults when storage is missing or contains invalid data.
    }
  }

  function saveFilters() {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
        kinds: [...activeFilters.kinds],
        instruments: [...activeFilters.instruments],
        includeHistorical: activeFilters.includeHistorical,
      }));
    } catch {
      // Filtering remains usable when storage is unavailable.
    }
  }

  function updateStats() {
    const matchingCount = catalog
      ? catalog.tracks.filter((track) => matchesFilter(track, activeFilters)).length
      : 0;
    elements.stats.textContent = t("stats", {
      played: played.size,
      matching: matchingCount,
      total: catalog?.count || 0,
    });
  }

  function availableExclusions() {
    const exclusions = new Set(played);
    if (currentTrack) exclusions.add(currentTrack.id);
    return exclusions;
  }

  function selectTrack() {
    return chooseNextTrack(catalog.tracks, availableExclusions(), bad, Math.random, activeFilters);
  }

  function updateMediaSession(track) {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.composer,
      album: t("appName"),
      artwork: [
        { src: new URL("icon-192.png", location.href).href, sizes: "192x192", type: "image/png" },
        { src: new URL("icon-512.png", location.href).href, sizes: "512x512", type: "image/png" },
      ],
    });
  }

  function clearPreloader() {
    if (preloader) {
      preloader.removeAttribute("src");
      preloader.load();
      preloader.remove();
    }
    preloader = null;
    queuedTrack = null;
  }

  function primeNextTrack() {
    if (queuedTrack) return;
    const track = selectTrack();
    if (!track) return;
    queuedTrack = track;
    preloader = document.createElement("audio");
    preloader.hidden = true;
    // 只预取元数据，不要用 "auto"。"auto" 会并行下载整首下一曲，
    // 与正在播放的曲目抢带宽；archive.org 本就慢，这足以把当前曲目拖到超时。
    preloader.preload = "metadata";
    preloader.src = track.url;
    document.body.append(preloader);
    preloader.load();
  }

  async function markPlayed() {
    if (!currentTrack || played.has(currentTrack.id)) return;
    played.add(currentTrack.id);
    updateStats();
    await writeKey(database, PLAYED_STORE, currentTrack.id);
  }

  function stopListeningClock() {
    clearInterval(listenTimer);
    listenTimer = null;
    lastListenTick = 0;
  }

  function startListeningClock() {
    if (listenTimer) return;
    lastListenTick = performance.now();
    listenTimer = setInterval(() => {
      if (elements.audio.paused || elements.audio.ended || !currentTrack) {
        lastListenTick = performance.now();
        return;
      }
      const now = performance.now();
      listenedSeconds += Math.max(0, (now - lastListenTick) / 1000);
      lastListenTick = now;
      if (listenedSeconds > LISTEN_THRESHOLD_SECONDS) void markPlayed();
    }, 1000);
  }

  function setPlayState(isPlaying) {
    elements.play.dataset.playing = String(isPlaying);
    elements.playLabel.textContent = isPlaying ? t("pause") : t("play");
    elements.play.setAttribute("aria-label", isPlaying ? t("pause") : t("play"));
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }

  function showExhausted() {
    stopListeningClock();
    elements.audio.pause();
    currentTrack = null;
    emptyView = "exhausted";
    renderEmptyView();
    renderAttribution();
    elements.source.hidden = true;
    elements.reset.hidden = false;
    elements.play.disabled = true;
    elements.next.disabled = true;
    setStatus("allPlayableComplete", "complete");
  }

  function showFilteredEmpty() {
    stopListeningClock();
    elements.audio.pause();
    currentTrack = null;
    emptyView = "filtered";
    renderEmptyView();
    renderAttribution();
    elements.source.hidden = true;
    elements.reset.hidden = true;
    elements.play.disabled = true;
    elements.next.disabled = true;
    setStatus("filteredEmptyStatus", "error");
  }

  // permanent=true 表示确定是这个文件本身的问题（媒体解码失败等），才永久拉黑；
  // 超时只说明「这次没加载出来」，可能只是网络慢，不能据此永久烧掉一首曲子。
  async function handlePlaybackFailure({ permanent = false } = {}) {
    if (!currentTrack || failureInProgress) return;
    failureInProgress = true;
    const failed = currentTrack;
    try {
      // archive.org 的存储节点有明显的瞬时失败率（实测同一 URL 连发 5 次会出现一次 500），
      // 失败不代表这首曲子有问题。先重试同一首，重试才是这里最该做的事。
      if (trackAttempts < MAX_TRACK_ATTEMPTS) {
        trackAttempts += 1;
        setStatus("retryingTrack", "", { title: failed.title, attempt: trackAttempts, total: MAX_TRACK_ATTEMPTS });
        // 退避后再试：连接刚被切断时立刻重连往往还是失败。
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * trackAttempts));
        if (currentTrack !== failed) return;   // 退避期间用户手动切歌了，放弃这次重试
        await loadTrack(failed, true, { attempt: trackAttempts });
        return;
      }

      if (permanent) {
        bad.add(failed.id);
        await writeKey(database, BAD_STORE, failed.id);
      }

      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        lastFailureDetail = describeMediaError(elements.audio);
        // 连续失败多半是网络/上游出问题，不是曲目问题。停在这里，
        // 否则自动跳过会一路烧穿曲库，表现为「曲目飞快地自己往下跳」。
        clearTimeout(loadTimer);
        elements.audio.pause();
        setStatus("networkTrouble", "error", { detail: lastFailureDetail });
        return;
      }

      setStatus("loadFailedSkipping", "error", { title: failed.title });
      await advance(true);
    } finally {
      failureInProgress = false;
    }
  }

  function armLoadTimeout(token = loadToken) {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (token === loadToken && elements.audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        void handlePlaybackFailure({ permanent: false });
      }
    }, LOAD_TIMEOUT_MS);
  }

  async function loadTrack(track, shouldPlay = false, { attempt = 0 } = {}) {
    clearTimeout(loadTimer);
    const token = ++loadToken;
    if (track !== currentTrack) trackAttempts = 0;   // 换曲目就重置重试计数
    currentTrack = track;
    emptyView = "";
    listenedSeconds = 0;
    lastListenTick = performance.now();
    elements.title.textContent = track.title;
    elements.composer.textContent = track.composer;
    renderAttribution();
    elements.source.href = `https://archive.org/details/${encodeURIComponent(track.source)}`;
    elements.source.hidden = false;
    elements.reset.hidden = true;
    elements.play.disabled = false;
    elements.next.disabled = false;
    elements.progress.value = "0";
    elements.elapsed.textContent = "0:00";
    elements.duration.textContent = formatTime(track.duration);
    setStatus("connectingArchive");
    updateMediaSession(track);
    // 重试时加一个无意义的查询参数：archive.org 会忽略它，但浏览器会因此
    // 重新发起请求并重新走 302，多半会落到另一个存储节点上。
    elements.audio.src = attempt > 0 ? `${track.url}?retry=${attempt}` : track.url;
    elements.audio.load();
    if (shouldPlay) {
      armLoadTimeout(token);
      try {
        await elements.audio.play();
      } catch (error) {
        if (error.name !== "AbortError") setStatus("tapToContinue");
      }
    }
  }

  async function advance(shouldPlay = true) {
    const warmed = queuedTrack;
    if (preloader) {
      preloader.removeAttribute("src");
      preloader.load();
      preloader.remove();
    }
    preloader = null;
    queuedTrack = null;
    const track = warmed
      && matchesFilter(warmed, activeFilters)
      && !played.has(warmed.id)
      && !bad.has(warmed.id)
      ? warmed
      : selectTrack();
    if (!track) {
      if (getPoolStatus(catalog.tracks, played, bad, activeFilters) === "filtered-empty") {
        showFilteredEmpty();
        return;
      }
      const onlyCurrentRemains = currentTrack
        && chooseNextTrack(
          catalog.tracks,
          played,
          bad,
          Math.random,
          activeFilters,
        )?.id === currentTrack.id;
      if (onlyCurrentRemains) {
        setStatus("noOtherUnheard");
        return;
      }
      showExhausted();
      return;
    }
    await loadTrack(track, shouldPlay);
  }

  function cancelSleepTimer(resetSelect = false) {
    clearTimeout(sleepTimer);
    clearInterval(sleepTicker);
    sleepTimer = null;
    sleepTicker = null;
    sleepDeadline = 0;
    elements.sleepStatus.textContent = "";
    if (resetSelect) elements.sleep.value = "0";
  }

  function updateSleepStatus() {
    const seconds = Math.max(0, Math.ceil((sleepDeadline - Date.now()) / 1000));
    elements.sleepStatus.textContent = seconds > 0
      ? t("stopsInMinutes", { minutes: Math.ceil(seconds / 60) })
      : t("fadingOut");
  }

  function fadeOutAndPause() {
    isFading = true;
    const originalVolume = Number(elements.volume.value);
    const steps = 20;
    let step = 0;
    elements.sleepStatus.textContent = t("fadingOut");
    const fade = setInterval(() => {
      step += 1;
      elements.audio.volume = originalVolume * (1 - step / steps);
      if (step >= steps) {
        clearInterval(fade);
        elements.audio.pause();
        elements.audio.volume = originalVolume;
        isFading = false;
        cancelSleepTimer(true);
        setStatus("sleepStopped");
      }
    }, 500);
  }

  elements.play.addEventListener("click", async () => {
    if (!currentTrack) return;
    if (elements.audio.paused) {
      armLoadTimeout();
      try {
        await elements.audio.play();
      } catch (error) {
        // AbortError 只是「这次 play() 被新的加载打断了」，属正常流程，不该报错给用户。
        if (error.name !== "AbortError") setStatus("playFailed", "error");
      }
    } else {
      elements.audio.pause();
    }
  });

  elements.next.addEventListener("click", () => void advance(true));
  elements.volume.addEventListener("input", () => {
    if (!isFading) elements.audio.volume = Number(elements.volume.value);
  });
  elements.progress.addEventListener("input", () => {
    if (Number.isFinite(elements.audio.duration)) {
      elements.audio.currentTime = Number(elements.progress.value) * elements.audio.duration / 1000;
    }
  });
  elements.sleep.addEventListener("change", () => {
    cancelSleepTimer();
    const minutes = Number(elements.sleep.value);
    if (!minutes) return;
    sleepDeadline = Date.now() + minutes * 60_000;
    updateSleepStatus();
    sleepTicker = setInterval(updateSleepStatus, 30_000);
    sleepTimer = setTimeout(fadeOutAndPause, minutes * 60_000);
  });
  elements.filters.addEventListener("change", () => {
    activeFilters = readFiltersFromControls();
    saveFilters();
    clearPreloader();
    updateStats();
    if (!catalog) return;

    const status = getPoolStatus(catalog.tracks, played, bad, activeFilters);
    if (status === "filtered-empty") {
      setStatus("filteredEmptyStatus", "error");
    } else if (!currentTrack && status === "available") {
      void advance(false);
    } else if (!currentTrack && status === "exhausted") {
      showExhausted();
    } else if (status === "exhausted") {
      setStatus("filteredComplete", "complete");
    } else {
      setStatus("filtersUpdated");
    }
  });
  elements.reset.addEventListener("click", async () => {
    await clearStore(database, PLAYED_STORE);
    played.clear();
    updateStats();
    setStatus("historyReset");
    await advance(false);
  });

  elements.audio.addEventListener("playing", () => {
    clearTimeout(loadTimer);
    consecutiveFailures = 0;   // 播出声了就说明链路正常，重新计数
    trackAttempts = 0;
    lastListenTick = performance.now();
    setStatus("playing");
    setPlayState(true);
    startListeningClock();
  });
  elements.audio.addEventListener("pause", () => setPlayState(false));
  elements.audio.addEventListener("canplay", () => {
    clearTimeout(loadTimer);
    if (elements.audio.paused) setStatus("readyToPlay");
  });
  elements.audio.addEventListener("timeupdate", () => {
    const duration = elements.audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    elements.progress.value = String(Math.round(elements.audio.currentTime / duration * 1000));
    elements.elapsed.textContent = formatTime(elements.audio.currentTime);
    elements.duration.textContent = formatTime(duration);
    if (elements.audio.currentTime / duration >= 0.8) primeNextTrack();
  });
  elements.audio.addEventListener("ended", () => void advance(true));
  elements.audio.addEventListener("error", () => void handlePlaybackFailure());

  if ("mediaSession" in navigator) {
    const handlers = {
      play: () => elements.audio.play(),
      pause: () => elements.audio.pause(),
      nexttrack: () => advance(true),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
    }
  }

  elements.language.addEventListener("change", () => {
    language = elements.language.value in dictionaries ? elements.language.value : "en";
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The active language still changes when storage is unavailable.
    }
    applyStaticTranslations();
    updateStats();
    setStatus(lastStatus.key, lastStatus.kind, lastStatus.values);
    setPlayState(!elements.audio.paused);
    renderAttribution();
    renderEmptyView();
    if (currentTrack) updateMediaSession(currentTrack);
  });

  try {
    applyStaticTranslations();
    setStatus("readingCatalog");
    applyStoredFilters();
    activeFilters = readFiltersFromControls();
    const [catalogResponse, openedDatabase] = await Promise.all([
      fetch("catalog.json", { cache: "no-cache" }),
      openDatabase(),
    ]);
    if (!catalogResponse.ok) throw new Error(t("catalogRequestFailed", { status: catalogResponse.status }));
    catalog = await catalogResponse.json();
    if (!Array.isArray(catalog.tracks) || catalog.tracks.length === 0) throw new Error(t("catalogEmpty"));
    database = openedDatabase;
    [played, bad] = await Promise.all([
      readKeys(database, PLAYED_STORE),
      readKeys(database, BAD_STORE),
    ]);
    updateStats();
    elements.audio.volume = Number(elements.volume.value);
    await advance(false);
  } catch (error) {
    emptyView = "error";
    renderEmptyView();
    elements.composer.textContent = error.message;
    renderAttribution();
    elements.play.disabled = true;
    elements.next.disabled = true;
    setStatus("checkNetwork", "error");
  }
}

if (typeof document !== "undefined") void initPlayer();
