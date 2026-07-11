const SESSION_SHEET = 'sessions';
const CLUB_RESULT_SHEET = 'club_results';
const SESSION_HEADERS = [
  'session_id', 'date', 'template', 'location', 'condition', 'memo',
  'created_at', 'updated_at', 'payload_json'
];
const CLUB_RESULT_HEADERS = [
  'result_id', 'session_id', 'club', 'balls', 'success_count', 'miss_count',
  'success_rate', 'max_distance', 'memo', 'created_at', 'updated_at', 'metrics_json'
];
const LIMITS = {
  requestBytes: 250000,
  sessionsPerResponse: 1000,
  clubsPerSession: 50,
  metricsPerClub: 50,
  shortText: 200,
  memo: 4000
};

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    verifyToken_(params.token);
    if (params.action !== 'listSessions') throw new Error('Unsupported action');
    return jsonResponse_({ ok: true, data: { sessions: listSessions_() } });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: safeError_(error) });
  }
}

function doPost(e) {
  try {
    const bodyText = e && e.postData && e.postData.contents ? e.postData.contents : '';
    if (!bodyText || bodyText.length > LIMITS.requestBytes) throw new Error('Invalid request size');
    const body = JSON.parse(bodyText);
    verifyToken_(body.token);

    if (body.action === 'upsertSession') {
      const saved = upsertSession_(body.payload);
      return jsonResponse_({ ok: true, data: saved });
    }
    if (body.action === 'listSessions') {
      return jsonResponse_({ ok: true, data: { sessions: listSessions_() } });
    }
    throw new Error('Unsupported action');
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: safeError_(error) });
  }
}

function setupSheets() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, SESSION_SHEET, SESSION_HEADERS);
  ensureSheet_(spreadsheet, CLUB_RESULT_SHEET, CLUB_RESULT_HEADERS);
  return 'sessions と club_results を準備しました。';
}

function upsertSession_(payload) {
  const session = validateSession_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const spreadsheet = getSpreadsheet_();
    const sessionsSheet = requireSheet_(spreadsheet, SESSION_SHEET, SESSION_HEADERS);
    const clubSheet = requireSheet_(spreadsheet, CLUB_RESULT_SHEET, CLUB_RESULT_HEADERS);
    const existingSessionRows = indexRowsByKey_(sessionsSheet, 1);
    const existing = existingSessionRows[session.id];

    if (existing) {
      const storedUpdatedAt = String(sessionsSheet.getRange(existing.row, 8).getValue() || '');
      if (Date.parse(storedUpdatedAt) > Date.parse(session.updatedAt)) {
        return { session_id: session.id, status: 'unchanged', updated_at: storedUpdatedAt };
      }
    }

    const sessionRow = [
      session.id,
      session.date,
      session.templateName,
      session.location,
      session.condition,
      session.overallMemo,
      session.createdAt,
      session.updatedAt,
      JSON.stringify(session)
    ].map(escapeSpreadsheetValue_);
    writeRow_(sessionsSheet, existing && existing.row, sessionRow);

    const resultRows = indexRowsByKey_(clubSheet, 1);
    session.clubs.forEach(function(clubItem) {
      const values = summarizeMetrics_(clubItem.metrics);
      const resultRow = [
        clubItem.resultId,
        session.id,
        clubItem.clubName,
        values.balls,
        values.successCount,
        values.missCount,
        clubItem.successRate,
        values.maxDistance,
        clubItem.memo,
        session.createdAt,
        session.updatedAt,
        JSON.stringify(clubItem.metrics)
      ].map(escapeSpreadsheetValue_);
      const current = resultRows[clubItem.resultId];
      writeRow_(clubSheet, current && current.row, resultRow);
    });

    return { session_id: session.id, status: existing ? 'updated' : 'created', updated_at: session.updatedAt };
  } finally {
    lock.releaseLock();
  }
}

function listSessions_() {
  const spreadsheet = getSpreadsheet_();
  const sheet = requireSheet_(spreadsheet, SESSION_SHEET, SESSION_HEADERS);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, SESSION_HEADERS.length).getValues();
  return values
    .map(function(row) {
      try {
        const parsed = JSON.parse(String(row[8] || ''));
        parsed.updatedAt = String(row[7] || parsed.updatedAt || '');
        return parsed;
      } catch (error) {
        console.error('Invalid payload_json for session ' + row[0], error);
        return null;
      }
    })
    .filter(Boolean)
    .sort(function(a, b) {
      return String(b.date || '').localeCompare(String(a.date || '')) ||
        String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    })
    .slice(0, LIMITS.sessionsPerResponse);
}

function validateSession_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid payload');
  const id = requireText_(input.id, 'session_id', 120);
  const date = requireText_(input.date, 'date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
  const clubs = Array.isArray(input.clubs) ? input.clubs : [];
  if (clubs.length > LIMITS.clubsPerSession) throw new Error('Too many clubs');
  const createdAt = normalizeIsoDate_(input.createdAt, 'created_at');
  const updatedAt = normalizeIsoDate_(input.updatedAt || input.createdAt, 'updated_at');

  return {
    id: id,
    schemaVersion: 3,
    templateName: optionalText_(input.templateName, LIMITS.shortText),
    date: date,
    location: optionalText_(input.location, LIMITS.shortText),
    condition: optionalText_(input.condition, LIMITS.shortText),
    overallMemo: optionalText_(input.overallMemo, LIMITS.memo),
    createdAt: createdAt,
    updatedAt: updatedAt,
    clubs: clubs.map(function(clubItem, index) {
      return validateClub_(clubItem, id, index);
    })
  };
}

function validateClub_(input, sessionId, index) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid club result');
  const metrics = Array.isArray(input.metrics) ? input.metrics : [];
  if (metrics.length > LIMITS.metricsPerClub) throw new Error('Too many metrics');
  return {
    resultId: requireText_(input.resultId || sessionId + '-' + index, 'result_id', 180),
    clubId: optionalText_(input.clubId, 120),
    clubName: requireText_(input.clubName, 'club', LIMITS.shortText),
    memo: optionalText_(input.memo, LIMITS.memo),
    successRate: boundedNumber_(input.successRate, 0, 100),
    metrics: metrics.map(validateMetric_)
  };
}

function validateMetric_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid metric');
  const kind = requireText_(input.kind, 'metric kind', 20);
  if (['count', 'distance', 'percent'].indexOf(kind) === -1) throw new Error('Invalid metric kind');
  const value = input.value === '' ? '' : boundedNumber_(input.value, 0, 1000000);
  return {
    key: requireText_(input.key, 'metric key', 120),
    label: requireText_(input.label, 'metric label', LIMITS.shortText),
    kind: kind,
    value: value
  };
}

function summarizeMetrics_(metrics) {
  const result = { balls: 0, successCount: 0, missCount: 0, maxDistance: 0 };
  metrics.forEach(function(metric) {
    const value = metric.value === '' ? 0 : Number(metric.value) || 0;
    const key = String(metric.key || '').toLowerCase();
    const label = String(metric.label || '');
    if (key === 'balls') result.balls = value;
    if ((key.indexOf('success') === 0 || label.indexOf('成功') !== -1) && metric.kind !== 'percent') result.successCount += value;
    if (key.indexOf('miss') !== -1 || label.indexOf('ミス') !== -1) result.missCount += value;
    if (key === 'max_distance' || label.indexOf('最大飛距離') !== -1) result.maxDistance = value;
  });
  return result;
}

function verifyToken_(received) {
  const expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!expected) throw new Error('SYNC_TOKEN is not configured');
  if (!received || String(received) !== expected) throw new Error('Invalid token');
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID is not configured');
  return SpreadsheetApp.openById(id);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  validateHeaders_(sheet, headers);
  sheet.setFrozenRows(1);
  return sheet;
}

function requireSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  validateHeaders_(sheet, headers);
  return sheet;
}

function validateHeaders_(sheet, headers) {
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(header, index) {
    if (String(actual[index] || '') !== header) throw new Error('Invalid column: ' + sheet.getName() + '.' + header);
  });
}

function indexRowsByKey_(sheet, keyColumn) {
  const index = {};
  if (sheet.getLastRow() < 2) return index;
  const values = sheet.getRange(2, keyColumn, sheet.getLastRow() - 1, 1).getValues();
  values.forEach(function(row, offset) {
    const key = String(row[0] || '');
    if (key) index[key] = { row: offset + 2 };
  });
  return index;
}

function writeRow_(sheet, rowNumber, values) {
  const row = rowNumber || sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, values.length).setValues([values]);
}

function escapeSpreadsheetValue_(value) {
  if (typeof value !== 'string') return value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function requireText_(value, name, maxLength) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > maxLength) throw new Error('Invalid ' + name);
  return text;
}

function optionalText_(value, maxLength) {
  const text = String(value == null ? '' : value);
  if (text.length > maxLength) throw new Error('Text is too long');
  return text;
}

function boundedNumber_(value, min, max) {
  const number = Number(value);
  if (!isFinite(number) || number < min || number > max) throw new Error('Invalid number');
  return number;
}

function normalizeIsoDate_(value, name) {
  const text = requireText_(value, name, 40);
  if (isNaN(Date.parse(text))) throw new Error('Invalid ' + name);
  return new Date(text).toISOString();
}

function safeError_(error) {
  const message = String(error && error.message ? error.message : error);
  return message.slice(0, 200);
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
