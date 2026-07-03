const STORAGE_KEY = "golf-practice-logs-v1";
const DEFAULT_LOCATION = "zenゴルフレンジ";

const METRIC_KIND_OPTIONS = [
  { value: "count", label: "数値" },
  { value: "percent", label: "成功率" },
  { value: "distance", label: "飛距離" },
];

function metric(key, label, kind = "count", defaultValue = key === "balls" ? 20 : 0, options = {}) {
  return {
    key,
    label,
    kind,
    defaultValue,
    locked: options.locked ?? key === "balls",
  };
}

function club(clubId, clubName, metrics, options = {}) {
  return {
    clubId,
    clubName,
    metrics: metrics.map((item) => ({ ...item })),
    editableName: options.editableName ?? false,
    allowMetricEdit: options.allowMetricEdit ?? false,
    allowRemove: options.allowRemove ?? true,
  };
}

const commonMetrics = {
  iron7: [
    metric("balls", "球数"),
    metric("success_130y", "130y成功数"),
    metric("success_140y", "140y成功数"),
    metric("success_150y", "150y成功数"),
  ],
  driver: [
    metric("balls", "球数"),
    metric("success_180y", "180y成功数"),
    metric("success_190y", "190y成功数"),
    metric("success_200y", "200y成功数"),
    metric("max_distance", "最大飛距離", "distance"),
    metric("miss", "ミス数"),
  ],
  successRateOnly: [metric("balls", "球数"), metric("success_rate", "成功率", "percent", "")],
  quick: [metric("balls", "球数"), metric("success", "成功数"), metric("miss", "ミス数")],
};

const clubPresets = {
  iron7: () => club("iron7", "7番アイアン", commonMetrics.iron7),
  driver: () => club("driver", "ドライバー", commonMetrics.driver),
  sw60y: () => club("sw60y", "SW60y", commonMetrics.successRateOnly),
  ut: () =>
    club("ut", "UT", [
      metric("balls", "球数"),
      metric("success_150y", "150y成功数"),
      metric("success_160y", "160y成功数"),
      metric("miss", "ミス数"),
    ]),
  pw90y: () => club("pw90y", "PW90y", commonMetrics.quick),
  wood5: () =>
    club("wood5", "5W", [
      metric("balls", "球数"),
      metric("success_170y", "170y成功数"),
      metric("success_180y", "180y成功数"),
      metric("success_190y", "190y成功数"),
      metric("max_distance", "最大飛距離", "distance"),
      metric("miss", "ミス数"),
    ]),
  putter10y: () => club("putter10y", "パター10y", commonMetrics.successRateOnly),
  pw20y: () => club("pw20y", "PW20y", commonMetrics.successRateOnly),
};

const templates = {
  "A練": [clubPresets.iron7(), clubPresets.driver(), clubPresets.sw60y(), clubPresets.ut()],
  "B練": [clubPresets.iron7(), clubPresets.pw90y(), clubPresets.wood5(), clubPresets.putter10y(), clubPresets.pw20y()],
  "屋外練": [clubPresets.iron7(), clubPresets.driver()],
  "自由入力": [createCustomClub("自由入力")],
};

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
  state.clubs = cloneTemplateClubs(templates[name]);
  if (name === "A練" || name === "B練") {
    locationInput.value = DEFAULT_LOCATION;
  }
  activeTemplateLabel.textContent = name;
  document.querySelectorAll(".template-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.template === name);
  });
  renderCards();
}

function cloneTemplateClubs(clubs) {
  return structuredClone(clubs).map(prepareClubForInput);
}

function prepareClubForInput(sourceClub) {
  return {
    ...sourceClub,
    instanceId: createId(),
    values: Object.fromEntries(sourceClub.metrics.map((item) => [item.key, item.defaultValue])),
    memo: "",
  };
}

function renderCards() {
  clubCards.innerHTML = "";
  state.clubs.forEach((clubItem, clubIndex) => {
    const node = cardTemplate.content.firstElementChild.cloneNode(true);
    renderClubTitle(node, clubItem, clubIndex);
    renderRemoveButton(node, clubItem, clubIndex);

    const metricList = node.querySelector(".metric-list");
    clubItem.metrics.forEach((item, metricIndex) => {
      metricList.append(createMetricRow(clubIndex, metricIndex, item));
    });

    if (clubItem.allowMetricEdit) {
      const addMetricButton = document.createElement("button");
      addMetricButton.type = "button";
      addMetricButton.className = "text-button add-metric";
      addMetricButton.textContent = "項目追加";
      addMetricButton.addEventListener("click", () => addMetric(clubIndex));
      metricList.append(addMetricButton);
    }

    const memo = node.querySelector("textarea");
    memo.value = clubItem.memo;
    memo.addEventListener("input", (event) => {
      state.clubs[clubIndex].memo = event.target.value;
    });

    clubCards.append(node);
  });

  const addClubButton = document.createElement("button");
  addClubButton.type = "button";
  addClubButton.className = "add-club-button";
  addClubButton.textContent = "クラブ追加";
  addClubButton.addEventListener("click", addCustomClub);
  clubCards.append(addClubButton);
}

function renderClubTitle(node, clubItem, clubIndex) {
  const title = node.querySelector("h3");
  if (!clubItem.editableName) {
    title.textContent = clubItem.clubName;
    return;
  }

  const label = document.createElement("label");
  label.className = "club-name-field";
  label.textContent = "クラブ名";

  const input = document.createElement("input");
  input.type = "text";
  input.value = clubItem.clubName;
  input.placeholder = "クラブ名";
  input.addEventListener("input", (event) => {
    state.clubs[clubIndex].clubName = event.target.value.trim() || "未設定クラブ";
  });

  label.append(input);
  title.replaceWith(label);
}

function renderRemoveButton(node, clubItem, clubIndex) {
  const button = node.querySelector(".remove-card");
  if (clubItem.allowRemove === false) {
    button.classList.add("hidden");
    return;
  }

  button.addEventListener("click", () => {
    state.clubs.splice(clubIndex, 1);
    renderCards();
  });
}

function createMetricRow(clubIndex, metricIndex, item) {
  const row = document.createElement("div");
  row.className = `metric-row${isMetricEditable(clubIndex, item) ? " editable-metric" : ""}`;

  const name = createMetricNameControl(clubIndex, metricIndex, item);
  const counter = createCounter(clubIndex, item);

  if (isMetricEditable(clubIndex, item)) {
    row.append(name, createMetricKindSelect(clubIndex, metricIndex, item), counter, createMetricDeleteButton(clubIndex, metricIndex));
    return row;
  }

  row.append(name, counter);
  return row;
}

function createMetricNameControl(clubIndex, metricIndex, item) {
  if (!isMetricEditable(clubIndex, item)) {
    const name = document.createElement("div");
    name.className = "metric-name";
    name.textContent = item.label;
    return name;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "metric-name-input";
  input.value = item.label;
  input.placeholder = "項目名";
  input.setAttribute("aria-label", "項目名");
  input.addEventListener("input", (event) => {
    state.clubs[clubIndex].metrics[metricIndex].label = event.target.value.trim() || "未設定項目";
  });
  return input;
}

function createMetricKindSelect(clubIndex, metricIndex, item) {
  const select = document.createElement("select");
  select.className = "metric-kind-select";
  select.setAttribute("aria-label", "種類");
  METRIC_KIND_OPTIONS.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === item.kind;
    select.append(node);
  });
  select.addEventListener("change", (event) => {
    state.clubs[clubIndex].metrics[metricIndex].kind = event.target.value;
  });
  return select;
}

function createMetricDeleteButton(clubIndex, metricIndex) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-metric";
  button.textContent = "×";
  button.setAttribute("aria-label", "項目を削除");
  button.addEventListener("click", () => {
    const metricItem = state.clubs[clubIndex].metrics[metricIndex];
    delete state.clubs[clubIndex].values[metricItem.key];
    state.clubs[clubIndex].metrics.splice(metricIndex, 1);
    renderCards();
  });
  return button;
}

function createCounter(clubIndex, item) {
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
  return counter;
}

function isMetricEditable(clubIndex, item) {
  return state.clubs[clubIndex].allowMetricEdit && !item.locked;
}

function addMetric(clubIndex) {
  const newMetric = metric(`custom_${Date.now()}_${state.clubs[clubIndex].metrics.length}`, "成功数", "count", 0, {
    locked: false,
  });
  state.clubs[clubIndex].metrics.push(newMetric);
  state.clubs[clubIndex].values[newMetric.key] = newMetric.defaultValue;
  renderCards();
}

function addCustomClub() {
  state.clubs.push(prepareClubForInput(createCustomClub("追加クラブ")));
  renderCards();
}

function createCustomClub(clubName) {
  return club(`custom_${Date.now()}_${Math.random().toString(16).slice(2)}`, clubName, commonMetrics.quick, {
    editableName: true,
    allowMetricEdit: true,
  });
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
    schemaVersion: 2,
    templateName: state.activeTemplate,
    date: dateInput.value,
    location: locationInput.value.trim(),
    condition: conditionInput.value,
    overallMemo: overallMemoInput.value.trim(),
    createdAt: new Date().toISOString(),
    clubs: state.clubs.map((clubItem) => ({
      clubId: clubItem.clubId,
      clubName: clubItem.clubName,
      memo: clubItem.memo.trim(),
      metrics: clubItem.metrics.map((item) => ({
        key: item.key,
        label: item.label,
        kind: item.kind,
        value: normalizeMetricValue(clubItem.values[item.key]),
      })),
      successRate: calculateSuccessRate(clubItem),
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

function calculateSuccessRate(clubItem) {
  const balls = cleanNumber(clubItem.values.balls);
  const explicitRate = clubItem.metrics.find((item) => item.kind === "percent");
  if (explicitRate && clubItem.values[explicitRate.key] !== "") {
    return clamp(cleanNumber(clubItem.values[explicitRate.key]), 0, 100);
  }

  const successTotal = clubItem.metrics.filter(isSuccessMetric).reduce((sum, item) => {
    return sum + cleanNumber(clubItem.values[item.key]);
  }, 0);

  if (!balls || !successTotal) return 0;
  return Math.min(100, Math.round((successTotal / balls) * 100));
}

function isSuccessMetric(item) {
  return item.key.startsWith("success") || item.label.includes("成功");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function showSummary(log) {
  const totalBalls = log.clubs.reduce((sum, clubItem) => {
    const balls = clubItem.metrics.find((item) => item.key === "balls");
    return sum + (balls ? cleanNumber(balls.value) : 0);
  }, 0);

  todaySummary.classList.remove("hidden");
  todaySummary.innerHTML = `
    <div class="summary-head">
      <h2>今日の記録サマリー</h2>
      <button class="text-button copy-summary" type="button">コピー</button>
    </div>
    <div class="summary-grid">
      <div class="summary-item"><span>${log.date} / ${escapeHtml(log.templateName)}</span><strong>${totalBalls}球</strong></div>
      ${log.clubs
        .map(
          (clubItem) =>
            `<div class="summary-item"><span>${escapeHtml(clubItem.clubName)}</span><span class="rate">${clubItem.successRate}%</span></div>`,
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

  log.clubs.forEach((clubItem) => {
    lines.push(`■ ${clubItem.clubName}`);
    clubItem.metrics.forEach((item) => {
      const value = item.value === "" ? "未入力" : item.value;
      lines.push(`- ${item.label}: ${value}`);
    });
    lines.push(`- 成功率: ${clubItem.successRate}%`);
    if (clubItem.memo) lines.push(`- メモ: ${clubItem.memo}`);
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
    log.clubs.forEach((clubItem) => {
      if (!byClub.has(clubItem.clubName)) byClub.set(clubItem.clubName, []);
      byClub.get(clubItem.clubName).push({ date: log.date, rate: clubItem.successRate });
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
    log.clubs.flatMap((clubItem) =>
      clubItem.metrics.map((item) => [
        log.id,
        log.date,
        log.templateName,
        log.location,
        log.condition,
        log.overallMemo,
        clubItem.clubId,
        clubItem.clubName,
        clubItem.memo,
        clubItem.successRate,
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

