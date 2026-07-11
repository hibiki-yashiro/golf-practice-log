const CLOUD_SYNC_CONFIG = {
  enabled: true,
  endpointUrl: "",
  token: "",
  requestTimeoutMs: 15000,
};

window.CloudSync = (() => {
  const LOGS_KEY = "golf-practice-logs-v1";
  const CONFIG_KEY = "golf-practice-cloud-config-v1";
  const MAX_SYNC_BATCH = 100;
  let syncing = false;
  let statusMessage = "";
  let statusListener = () => {};
  let logsChangedListener = () => {};

  function initialize(options = {}) {
    statusListener = options.onStatusChange ?? statusListener;
    logsChangedListener = options.onLogsChanged ?? logsChangedListener;
    migrateStoredLogs();
    window.addEventListener("online", () => {
      void synchronize({ pullFirst: true, reason: "online" });
    });
    notify();

    if (isConfigured()) {
      void synchronize({ pullFirst: true, reason: "startup" });
    }
  }

  function getConfig() {
    const saved = readJson(CONFIG_KEY, {});
    return {
      ...CLOUD_SYNC_CONFIG,
      endpointUrl: String(saved.endpointUrl ?? CLOUD_SYNC_CONFIG.endpointUrl).trim(),
      token: String(saved.token ?? CLOUD_SYNC_CONFIG.token).trim(),
    };
  }

  function saveConfig(config) {
    const next = {
      endpointUrl: String(config.endpointUrl ?? "").trim(),
      token: String(config.token ?? "").trim(),
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    notify("クラウド設定を保存しました。");
    return getConfig();
  }

  function isConfigured() {
    const config = getConfig();
    return config.enabled && Boolean(config.endpointUrl && config.token);
  }

  function loadLogs() {
    const value = readJson(LOGS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function saveLogs(logs) {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    notify();
  }

  function prepareLog(log) {
    const now = new Date().toISOString();
    const sessionId = log.id || createId("session");
    return {
      ...log,
      id: sessionId,
      schemaVersion: 3,
      updatedAt: now,
      sync_status: "pending",
      last_sync_at: "",
      sync_error_message: "",
      clubs: (log.clubs ?? []).map((clubItem, index) => ({
        ...clubItem,
        resultId: clubItem.resultId || createStableResultId(sessionId, clubItem, index),
      })),
    };
  }

  function migrateStoredLogs() {
    const logs = loadLogs();
    let changed = false;
    const migrated = logs.map((log) => {
      const sessionId = log.id || createId("session");
      const clubs = Array.isArray(log.clubs) ? log.clubs : [];
      const next = {
        ...log,
        id: sessionId,
        schemaVersion: Math.max(Number(log.schemaVersion) || 1, 3),
        updatedAt: log.updatedAt || log.createdAt || new Date().toISOString(),
        sync_status: normalizeSyncStatus(log.sync_status),
        last_sync_at: log.last_sync_at || "",
        sync_error_message: log.sync_error_message || "",
        clubs: clubs.map((clubItem, index) => ({
          ...clubItem,
          resultId: clubItem.resultId || createStableResultId(sessionId, clubItem, index),
        })),
      };
      if (JSON.stringify(next) !== JSON.stringify(log)) changed = true;
      return next;
    });
    if (changed) localStorage.setItem(LOGS_KEY, JSON.stringify(migrated));
    return migrated;
  }

  function normalizeSyncStatus(value) {
    return ["synced", "pending", "error"].includes(value) ? value : "pending";
  }

  async function synchronize(options = {}) {
    if (syncing) return { skipped: true, reason: "busy" };
    if (!isConfigured()) {
      notify("Apps Script URLと共有トークンを設定してください。");
      return { skipped: true, reason: "not_configured" };
    }
    if (!navigator.onLine) {
      notify("オフラインです。記録は端末に保存されています。");
      return { skipped: true, reason: "offline" };
    }

    syncing = true;
    notify(options.reason === "startup" ? "クラウド履歴を確認しています。" : "同期しています。※ブラウザを閉じないでください。");
    const result = { pulled: 0, synced: 0, failed: 0 };

    try {
      if (options.pullFirst !== false) {
        result.pulled = await pullCloudLogs();
      }
      const pendingResult = await pushPendingLogs();
      result.synced = pendingResult.synced;
      result.failed = pendingResult.failed;
      notify(result.failed ? `${result.synced}件同期、${result.failed}件でエラーが発生しました。` : "クラウド同期が完了しました。");
      return result;
    } catch (error) {
      console.error("Cloud synchronization failed", error);
      notify(toUserMessage(error));
      return { ...result, failed: result.failed + 1, error };
    } finally {
      syncing = false;
      notify();
    }
  }

  async function pushPendingLogs() {
    const logs = loadLogs();
    const targets = logs.filter((log) => log.sync_status !== "synced").slice(0, MAX_SYNC_BATCH);
    let synced = 0;
    let failed = 0;

    for (const target of targets) {
      try {
        await postAction("upsertSession", target);
        updateSyncResult(target.id, { status: "synced" });
        synced += 1;
      } catch (error) {
        console.error(`Failed to sync session ${target.id}`, error);
        updateSyncResult(target.id, { status: "error", error });
        failed += 1;
      }
    }
    return { synced, failed };
  }

  function updateSyncResult(sessionId, result) {
    const now = new Date().toISOString();
    const logs = loadLogs().map((log) => {
      if (log.id !== sessionId) return log;
      return {
        ...log,
        sync_status: result.status,
        last_sync_at: result.status === "synced" ? now : log.last_sync_at || "",
        sync_error_message: result.error ? String(result.error.message || result.error).slice(0, 300) : "",
      };
    });
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
    notify();
  }

  async function pullCloudLogs() {
    const response = await getCloudLogs();
    const cloudLogs = Array.isArray(response.sessions) ? response.sessions : [];
    if (cloudLogs.length === 0) return 0;

    const localLogs = loadLogs();
    const merged = new Map(localLogs.map((log) => [log.id, log]));
    let imported = 0;

    cloudLogs.forEach((rawLog) => {
      const cloudLog = normalizeCloudLog(rawLog);
      if (!cloudLog.id) return;
      const localLog = merged.get(cloudLog.id);
      if (!localLog) {
        merged.set(cloudLog.id, cloudLog);
        imported += 1;
        return;
      }

      const localTime = Date.parse(localLog.updatedAt || localLog.createdAt || 0) || 0;
      const cloudTime = Date.parse(cloudLog.updatedAt || cloudLog.createdAt || 0) || 0;
      if (cloudTime > localTime || (cloudTime === localTime && localLog.sync_status === "synced")) {
        merged.set(cloudLog.id, cloudLog);
      }
    });

    const nextLogs = Array.from(merged.values()).sort(compareLogsNewestFirst);
    localStorage.setItem(LOGS_KEY, JSON.stringify(nextLogs));
    logsChangedListener();
    notify();
    return imported;
  }

  function normalizeCloudLog(log) {
    const prepared = prepareLog(log);
    return {
      ...prepared,
      updatedAt: log.updatedAt || log.updated_at || log.createdAt || new Date().toISOString(),
      sync_status: "synced",
      last_sync_at: new Date().toISOString(),
      sync_error_message: "",
    };
  }

  async function backupAll() {
    const logs = loadLogs().map((log) => ({
      ...log,
      sync_status: log.sync_status === "synced" ? "synced" : "pending",
      sync_error_message: "",
    }));
    saveLogs(logs);
    return synchronize({ pullFirst: true, reason: "backup" });
  }

  function getState() {
    const logs = loadLogs();
    const pending = logs.filter((log) => log.sync_status === "pending").length;
    const errors = logs.filter((log) => log.sync_status === "error").length;
    const synced = logs.filter((log) => log.sync_status === "synced").length;
    const syncTimes = logs
      .map((log) => log.last_sync_at)
      .filter(Boolean)
      .sort();
    const lastSyncAt = syncTimes[syncTimes.length - 1] || "";
    return {
      configured: isConfigured(),
      syncing,
      total: logs.length,
      pending,
      errors,
      synced,
      unsynced: pending + errors,
      lastSyncAt,
    };
  }

  async function postAction(action, payload) {
    const config = getConfig();
    return request(config.endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token: config.token, payload }),
    }, config.requestTimeoutMs);
  }

  async function getCloudLogs() {
    const config = getConfig();
    const url = new URL(config.endpointUrl);
    url.searchParams.set("action", "listSessions");
    url.searchParams.set("token", config.token);
    return request(url.toString(), { method: "GET" }, config.requestTimeoutMs);
  }

  async function request(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("クラウドから不正な応答を受信しました。");
      }
      if (!data.ok) throw new Error(data.error || "クラウド処理に失敗しました。");
      return data.data || {};
    } catch (error) {
      if (error.name === "AbortError") throw new Error("クラウド同期がタイムアウトしました。");
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function notify(message = "") {
    if (message) statusMessage = message;
    statusListener(getState(), statusMessage);
  }

  function toUserMessage(error) {
    if (!navigator.onLine) return "オフラインです。記録は端末に保存されています。";
    const message = String(error?.message || error);
    if (message.includes("token") || message.includes("認証")) return "共有トークンを確認してください。";
    if (message.includes("timeout") || message.includes("タイムアウト")) return "同期がタイムアウトしました。後でもう一度試せます。";
    return "クラウド同期に失敗しました。記録は端末に保存されています。";
  }

  function compareLogsNewestFirst(a, b) {
    return String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  }

  function createStableResultId(sessionId, clubItem, index) {
    const clubPart = String(clubItem.clubId || clubItem.clubName || "club").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "club";
    return `${sessionId}-${index}-${clubPart}`;
  }

  function createId(prefix) {
    if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (error) {
      console.error(`Failed to parse localStorage key ${key}`, error);
      return fallback;
    }
  }

  return {
    initialize,
    getConfig,
    saveConfig,
    isConfigured,
    loadLogs,
    saveLogs,
    prepareLog,
    synchronize,
    backupAll,
    getState,
  };
})();
