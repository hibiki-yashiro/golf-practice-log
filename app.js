const STORAGE_KEY = "golf-practice-logs-v1";
const DEFAULT_LOCATION = "zenゴルフレンジ";

const metric = (key, label, kind = "count", defaultValue = key === "balls" ? 20 : 0) => ({
  key,
  label,
  kind,
  defaultValue,
});
const percentMetric = () => metric("success_rate", "成功率", "percent", "");

const iron7Metrics = [
  metric("balls", "球数"),
  metric("success_130y", "130y成功数"),
  metric("success_140y", "140y成功数"),
  metric("success_150y", "150y成功数"),
];

const templates = {
  "A練": [
    {
      clubId: "iron7",
      clubName: "7番アイアン",
      metrics: iron7Metrics,
    },
    {
      clubId: "driver",
      clubName: "ドライバー",
      metrics: [
        metric("balls", "球数"),
        metric("success_180y", "180y成功数"),
        metric("success_190y", "190y成功数"),
        metric("success_200y", "200y成功数"),
        metric("max_distance", "最大飛距離", "distance"),
        metric("miss", "ミス数"),
      ],
    },
    {
      clubId: "sw60y",
      clubName: "SW60y",
      metrics: successRateOnlyMetrics(),
    },
    {
      clubId: "ut",
      clubName: "UT",
      metrics: [
        metric("balls", "球数"),
        metric("success_150y", "150y成功数"),
        metric("success_160y", "160y成功数"),
        metric("miss", "ミス数"),
      ],
    },
  ],
  "B練": [
    {
      clubId: "iron7",
      clubName: "7番アイアン",
      metrics: iron7Metrics,
    },
    quickClub("pw90y", "PW90y"),
    {
      clubId: "wood5",
      clubName: "5W",
      metrics: [
        metric("balls", "球数"),
        metric("success_170y", "170y成功数"),
        metric("success_180y", "180y成功数"),
        metric("success_190y", "190y成功数"),
        metric("max_distance", "最大飛距離", "distance"),
        metric("miss", "ミス数"),
      ],
    },
    {
      clubId: "putter10y",
      clubName: "パター10y",
      metrics: successRateOnlyMetrics(),
    },
    {
      clubId: "pw20y",
      clubName: "PW20y",
      metrics: successRateOnlyMetrics(),
    },
  ],
  "屋外練": [
    quickClub("driver", "ドライバー"),
    quickClub("iron7", "7番アイアン"),
    quickClub("approach", "アプローチ"),
    quickClub("putter", "パター"),
  ],
  "自由入力": [quickClub("free1", "自由入力")],
};

function quickClub(clubId, clubName) {
  return {
    clubId,
    clubName,
    metrics: [metric("balls", "球数"), metric("success", "成功数"), metric("miss", "ミス数")],
  };
}

function successRateOnlyMetrics() {
  return [metric("balls", "球数"), percentMetric()];
}

const state = {
  activeTemplate: "A練",
  clubs: [],
};

const templateButtons = document.querySelector("#templateButtons");
const activeTemplateLabel = document.querySelector("#activeTemplateLabel");
const clubCards = document.querySelector("#clubCards");
const cardTemplate = document.querySelector("#clubCardTemplate");
const form = document.querySelector("#logForm");
const dateInput = document.querySelector("#dateInput");
const locationInput = document.querySelector("#locationInput");
const conditionInput = document.querySelector("#conditionInput");
const overallMemoInput = document.querySelector("#overallMemoInput");
const todaySummary = document.querySelector("#todaySummary");
const trendList = document.querySelector("#trendList");
const exportCsvButton = document.querySelector("#exportCsv");
const clearDataButton = document.querySelector("#clearData");

init();

function init() {
  dateInput.value = formatLocalDate(new Date());
  renderTemplateButtons();
  setTemplate("A練");
  renderTrends();

  form.addEventListener("submit", saveLog);
  exportCsvButton.addEventListener("click", exportCsv);
  clearDataButton.addEventListener("click", clearAllLogs);
}

function renderTemplateButtons() {
  templateButtons.innerHTML = "";
  Object.keys(templates).forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "template-button";
    button.dataset.template = name;
    button.innerHTML = `${name}<span>${templates[name].length}クラブ</span>`;
    button.addEventListener("click", () => setTemplate(name));
    templateButtons.append(button);
  });
}

function setTemplate(name) {
  state.activeTemplate = name;
  state.clubs = structuredClone(templates[name]).map((club) => ({
    ...club,
    values: Object.fromEntries(club.metrics.map((item) => [item.key, item.defaultValue])),
    memo: "",
  }));
  if (name === "A練" || name === "B練") {
    locationInput.value = DEFAULT_LOCATION;
  }
  activeTemplateLabel.textContent = name;
  document.querySelectorAll(".template-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.template === name);
  });
  renderCards();
}

function renderCards() {
  clubCards.innerHTML = "";
  state.clubs.forEach((club, clubIndex) => {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = club.clubName;
    node.querySelector(".remove-card").addEventListener("click", () => {
      state.clubs.splice(clubIndex, 1);
      renderCards();
    });

    const metricList = node.querySelector(".metric-list");
    club.metrics.forEach((item) => {
      metricList.append(createMetricRow(clubIndex, item));
    });

    const memo = node.querySelector("textarea");
    memo.value = club.memo;
    memo.addEventListener("input", (event) => {
      state.clubs[clubIndex].memo = event.target.value;
    });

    clubCards.append(node);
  });
}

function createMetricRow(clubIndex, item) {
  const row = document.createElement("div");
  row.className = "metric-row";

  const name = document.createElement("div");
  name.className = "metric-name";
  name.textContent = item.label;

  const counter = document.createElement("div");
  counter.className = "counter";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.textContent = "-";
  minus.setAttribute("aria-label", `${item.label}を減らす`);

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.value = getDisplayMetricValue(clubIndex, item.key);
  input.setAttribute("aria-label", item.label);

  const plus = document.createElement("button");
  plus.type = "button";
  plus.textContent = "+";
  plus.setAttribute("aria-label", `${item.label}を増やす`);

  minus.addEventListener("click", () => changeMetric(clubIndex, item.key, -1, input));
  plus.addEventListener("click", () => changeMetric(clubIndex, item.key, 1, input));
  input.addEventListener("input", () => {
    state.clubs[clubIndex].values[item.key] = input.value === "" ? "" : cleanNumber(input.value);
  });

  counter.append(minus, input, plus);
  row.append(name, counter);
  return row;
}

function changeMetric(clubIndex, key, amount, input) {
  const nextValue = Math.max(0, getMetricValue(clubIndex, key) + amount);
  state.clubs[clubIndex].values[key] = nextValue;
  input.value = nextValue;
}

function getMetricValue(clubIndex, key) {
  return cleanNumber(state.clubs[clubIndex].values[key]);
}

function getDisplayMetricValue(clubIndex, key) {
  const value = state.clubs[clubIndex].values[key];
  return value === "" ? "" : cleanNumber(value);
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeMetricValue(value) {
  return value === "" ? "" : cleanNumber(value);
}

function saveLog(event) {
  event.preventDefault();
  if (state.clubs.length === 0) return;

  const log = {
    id: createId(),
    schemaVersion: 1,
    templateName: state.activeTemplate,
    date: dateInput.value,
    location: locationInput.value.trim(),
    condition: conditionInput.value,
    overallMemo: overallMemoInput.value.trim(),
    createdAt: new Date().toISOString(),
    clubs: state.clubs.map((club) => ({
      clubId: club.clubId,
      clubName: club.clubName,
      memo: club.memo.trim(),
      metrics: club.metrics.map((item) => ({
        key: item.key,
        label: item.label,
        kind: item.kind,
        value: normalizeMetricValue(club.values[item.key]),
      })),
      successRate: calculateSuccessRate(club),
    })),
  };

  const logs = loadLogs();
  logs.unshift(log);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));

  showSummary(log);
  renderTrends();
  overallMemoInput.value = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `log-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function calculateSuccessRate(club) {
  const balls = cleanNumber(club.values.balls);
  const explicitRate = club.metrics.find((item) => item.kind === "percent");
  if (explicitRate) {
    return clamp(cleanNumber(club.values[explicitRate.key]), 0, 100);
  }

  const successTotal = club.metrics
    .filter((item) => item.key.startsWith("success"))
    .reduce((sum, item) => sum + cleanNumber(club.values[item.key]), 0);

  if (!balls || !successTotal) return 0;
  return Math.min(100, Math.round((successTotal / balls) * 100));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function showSummary(log) {
  const totalBalls = log.clubs.reduce((sum, club) => {
    const balls = club.metrics.find((item) => item.key === "balls");
    return sum + (balls ? cleanNumber(balls.value) : 0);
  }, 0);

  todaySummary.classList.remove("hidden");
  todaySummary.innerHTML = `
    <div class="summary-head">
      <h2>今日の記録サマリー</h2>
      <button class="text-button copy-summary" type="button">コピー</button>
    </div>
    <div class="summary-grid">
      <div class="summary-item"><span>${log.date} / ${log.templateName}</span><strong>${totalBalls}球</strong></div>
      ${log.clubs
        .map(
          (club) =>
            `<div class="summary-item"><span>${escapeHtml(club.clubName)}</span><span class="rate">${club.successRate}%</span></div>`,
        )
        .join("")}
    </div>
    <p class="copy-status" aria-live="polite"></p>
  `;

  const copyButton = todaySummary.querySelector(".copy-summary");
  const copyStatus = todaySummary.querySelector(".copy-status");
  copyButton.addEventListener("click", async () => {
    const copied = await copyText(buildSummaryText(log));
    copyStatus.textContent = copied ? "コピーしました" : "コピーできませんでした";
  });
}

function buildSummaryText(log) {
  const lines = [
    "以下のゴルフ練習ログをもとに、良かった点・課題・次回の練習メニューを簡潔に振り返ってください。",
    "",
    "【今日の記録サマリー】",
    `日付: ${log.date}`,
    `テンプレート: ${log.templateName}`,
    `場所: ${log.location || "未入力"}`,
    `体調: ${log.condition}`,
    "",
    "【クラブ別】",
  ];

  log.clubs.forEach((club) => {
    lines.push(`■ ${club.clubName}`);
    club.metrics.forEach((item) => {
      const value = item.value === "" ? "未入力" : item.value;
      lines.push(`- ${item.label}: ${value}`);
    });
    lines.push(`- 成功率: ${club.successRate}%`);
    if (club.memo) lines.push(`- メモ: ${club.memo}`);
  });

  if (log.overallMemo) {
    lines.push("", "【総評メモ】", log.overallMemo);
  }

  return lines.join("\n");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function renderTrends() {
  const logs = loadLogs();
  const recent = logs.slice(0, 5);
  if (recent.length === 0) {
    trendList.innerHTML = '<p class="empty-state">まだ記録がありません。</p>';
    return;
  }

  const byClub = new Map();
  recent.forEach((log) => {
    log.clubs.forEach((club) => {
      if (!byClub.has(club.clubName)) byClub.set(club.clubName, []);
      byClub.get(club.clubName).push({ date: log.date, rate: club.successRate });
    });
  });

  trendList.innerHTML = Array.from(byClub.entries())
    .map(([clubName, entries]) => {
      const rows = entries
        .map(
          (entry) =>
            `<div class="trend-item"><span class="trend-date">${escapeHtml(entry.date)}</span><span class="rate">${entry.rate}%</span></div>`,
        )
        .join("");
      return `<article class="trend-card"><h3>${escapeHtml(clubName)}</h3>${rows}</article>`;
    })
    .join("");
}

function exportCsv() {
  const logs = loadLogs();
  if (logs.length === 0) return;

  const header = [
    "log_id",
    "date",
    "template",
    "location",
    "condition",
    "overall_memo",
    "club_id",
    "club_name",
    "club_memo",
    "success_rate",
    "metric_key",
    "metric_label",
    "metric_kind",
    "metric_value",
    "created_at",
  ];

  const rows = logs.flatMap((log) =>
    log.clubs.flatMap((club) =>
      club.metrics.map((item) => [
        log.id,
        log.date,
        log.templateName,
        log.location,
        log.condition,
        log.overallMemo,
        club.clubId,
        club.clubName,
        club.memo,
        club.successRate,
        item.key,
        item.label,
        item.kind,
        item.value,
        log.createdAt,
      ]),
    ),
  );

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `golf-practice-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function clearAllLogs() {
  const ok = confirm("保存済みの練習ログをすべて削除しますか？");
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  todaySummary.classList.add("hidden");
  renderTrends();
}

function loadLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
