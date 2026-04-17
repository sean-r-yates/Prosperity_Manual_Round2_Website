const STORAGE_KEY = "signal-outpost-participant";
const PARTICIPANT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const TOTAL_BUDGET = 50_000;
const RESEARCH_CAP = 200_000;
const SCALE_CAP = 7;

const elements = {
  activeFieldCount: document.getElementById("active-field-count"),
  allocationForm: document.getElementById("allocation-form"),
  attemptCounter: document.getElementById("attempt-counter"),
  attemptNote: document.getElementById("attempt-note"),
  attemptsLeftLabel: document.getElementById("attempts-left-label"),
  budgetFill: document.getElementById("budget-fill"),
  budgetHelper: document.getElementById("budget-helper"),
  budgetUsedLabel: document.getElementById("budget-used-label"),
  budgetUsedNumber: document.getElementById("budget-used-number"),
  budgetUsedPercent: document.getElementById("budget-used-percent"),
  extendButton: document.getElementById("extend-button"),
  formMessage: document.getElementById("form-message"),
  historyChartWrap: document.getElementById("history-chart-wrap"),
  historyMeta: document.getElementById("history-meta"),
  historyTableBody: document.getElementById("history-table-body"),
  historyTitle: document.getElementById("history-title"),
  participantExpiry: document.getElementById("participant-expiry"),
  participantId: document.getElementById("participant-id"),
  researchAmount: document.getElementById("research-amount"),
  researchForecast: document.getElementById("research-forecast"),
  researchInput: document.getElementById("research-input"),
  resultExpected: document.getElementById("result-expected"),
  resultField: document.getElementById("result-field"),
  resultMultiplier: document.getElementById("result-multiplier"),
  resultPercentile: document.getElementById("result-percentile"),
  resultPnl: document.getElementById("result-pnl"),
  resultRange: document.getElementById("result-range"),
  resultRank: document.getElementById("result-rank"),
  resultRefresh: document.getElementById("result-refresh"),
  scaleAmount: document.getElementById("scale-amount"),
  scaleForecast: document.getElementById("scale-forecast"),
  scaleInput: document.getElementById("scale-input"),
  scenarioAdverse: document.getElementById("scenario-adverse"),
  scenarioBase: document.getElementById("scenario-base"),
  scenarioBullish: document.getElementById("scenario-bullish"),
  speedAmount: document.getElementById("speed-amount"),
  speedInput: document.getElementById("speed-input"),
  submitButton: document.getElementById("submit-button"),
};

const state = {
  history: [],
  latestAttempt: null,
  marketSummary: null,
  participant: null,
  participantIdentity: null,
};

function formatInteger(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value));
}

function formatPnl(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }

  const rounded = Number(value);
  const prefix = rounded >= 0 ? "+" : "";
  return `${prefix}${formatDecimal(rounded, 2)}`;
}

function formatDate(value) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function timeUntilExpiry(isoString) {
  const delta = Date.parse(isoString) - Date.now();
  if (delta <= 0) {
    return "Expires soon";
  }

  const hours = Math.floor(delta / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return days > 0 ? `${days}d ${remainingHours}h remaining` : `${remainingHours}h remaining`;
}

function generateParticipantId() {
  const token = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `so_${token}`;
}

function saveIdentity(identity) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

function getOrCreateIdentity(forceReset = false) {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!forceReset && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.id && parsed.expiresAt && Date.now() < Date.parse(parsed.expiresAt)) {
        return parsed;
      }
    } catch (error) {
      console.warn("Unable to parse saved participant identity.", error);
    }
  }

  const createdAt = new Date().toISOString();
  return saveIdentity({
    createdAt,
    expiresAt: new Date(Date.now() + PARTICIPANT_TTL_MS).toISOString(),
    id: generateParticipantId(),
  });
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function calculateResearchValue(researchPct) {
  return RESEARCH_CAP * Math.log(1 + researchPct) / Math.log(101);
}

function calculateScaleValue(scalePct) {
  return SCALE_CAP * (scalePct / 100);
}

function readCurrentAllocation() {
  const researchPct = Number.parseInt(elements.researchInput.value, 10);
  const scalePct = Number.parseInt(elements.scaleInput.value, 10);
  const speedPct = Number.parseInt(elements.speedInput.value, 10);

  return {
    researchPct,
    scalePct,
    speedPct,
  };
}

function setFormMessage(message, type = "muted") {
  elements.formMessage.textContent = message || "";
  elements.formMessage.style.color =
    type === "error" ? "var(--red)" : type === "success" ? "var(--green)" : "var(--muted)";
}

function renderPreview() {
  const { researchPct, scalePct, speedPct } = readCurrentAllocation();
  const values = [researchPct, scalePct, speedPct];
  const hasAnyValue = values.some((value) => Number.isFinite(value));

  const totalPct = values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const budgetUsed = TOTAL_BUDGET * (totalPct / 100);

  elements.researchAmount.textContent = Number.isFinite(researchPct)
    ? formatInteger(TOTAL_BUDGET * (researchPct / 100))
    : "--";
  elements.scaleAmount.textContent = Number.isFinite(scalePct)
    ? formatInteger(TOTAL_BUDGET * (scalePct / 100))
    : "--";
  elements.speedAmount.textContent = Number.isFinite(speedPct)
    ? formatInteger(TOTAL_BUDGET * (speedPct / 100))
    : "--";

  elements.researchForecast.textContent = Number.isFinite(researchPct)
    ? formatInteger(calculateResearchValue(researchPct))
    : "--";
  elements.scaleForecast.textContent = Number.isFinite(scalePct)
    ? `x ${formatDecimal(calculateScaleValue(scalePct), 2)}`
    : "--";

  elements.budgetUsedLabel.textContent = `${Math.max(0, totalPct)}%`;
  elements.budgetUsedPercent.textContent = `${Math.max(0, totalPct)}%`;
  elements.budgetUsedNumber.textContent = `${formatInteger(budgetUsed)} / 50,000`;
  elements.budgetFill.style.width = `${Math.min(100, Math.max(0, totalPct))}%`;

  if (!hasAnyValue) {
    elements.budgetHelper.textContent =
      "Fields accept whole numbers only. Each pillar must be at least 1%. Unused budget stays unused.";
    return;
  }

  if (totalPct > 100) {
    elements.budgetHelper.textContent = "The total cannot exceed 100%.";
    return;
  }

  if (values.some((value) => Number.isFinite(value) && value < 1)) {
    elements.budgetHelper.textContent = "Each pillar must be at least 1%.";
    return;
  }

  elements.budgetHelper.textContent = `Unused budget: ${formatInteger(TOTAL_BUDGET - budgetUsed)} XIRECs`;
}

function renderIdentity() {
  const identity = state.participantIdentity;
  const participant = state.participant;
  elements.participantId.textContent = identity?.id || "--";
  elements.participantExpiry.textContent = identity
    ? `ID auto-refreshes in ${timeUntilExpiry(identity.expiresAt)}`
    : "ID refreshes after 3 days";

  if (!participant) {
    elements.attemptCounter.textContent = "--";
    elements.attemptsLeftLabel.textContent = "--";
    return;
  }

  elements.attemptCounter.textContent = `${participant.attemptCount} / ${participant.maxAttempts}`;
  elements.attemptsLeftLabel.textContent = formatInteger(participant.attemptsRemaining);

  if (participant.extensionGranted) {
    elements.attemptNote.textContent = `Extension active. ${participant.extensionRemaining} extra attempts remain.`;
  } else if (participant.extensionOffered) {
    elements.attemptNote.textContent = "Base attempts are used. You can unlock 5 more.";
  } else {
    elements.attemptNote.textContent = "Tracked privately per browser";
  }

  elements.extendButton.classList.toggle("hidden", !participant.extensionOffered);
  elements.submitButton.disabled = !participant.canSubmit;
  elements.submitButton.textContent = participant.canSubmit ? "Run Simulation" : "Attempts Exhausted";
}

function renderMarketSummary() {
  elements.activeFieldCount.textContent = state.marketSummary
    ? formatInteger(state.marketSummary.activeParticipants)
    : "--";
}

function renderResults() {
  const attempt = state.latestAttempt;
  if (!attempt) {
    elements.resultPnl.textContent = "--";
    elements.resultExpected.textContent = "--";
    elements.resultPercentile.textContent = "--";
    elements.resultField.textContent = state.marketSummary
      ? `${formatInteger(state.marketSummary.activeParticipants)} participants`
      : "--";
    elements.resultRank.textContent = "Submit an attempt to score against the current field.";
    elements.resultMultiplier.textContent = "Hit-rate multiplier appears after submit";
    elements.resultRange.textContent = "Future field movement estimate";
    elements.resultRefresh.textContent = state.marketSummary?.generatedAt
      ? `Last snapshot: ${formatDate(state.marketSummary.generatedAt)}`
      : "Refreshes on visit after 20 minutes";
    elements.scenarioBullish.textContent = "--";
    elements.scenarioBase.textContent = "--";
    elements.scenarioAdverse.textContent = "--";
    return;
  }

  elements.resultPnl.textContent = formatPnl(attempt.pnl);
  elements.resultExpected.textContent = formatPnl(attempt.expectedPnl);
  elements.resultPercentile.textContent = `${attempt.percentile}th`;
  elements.resultField.textContent = `${attempt.activeParticipants} participants`;
  elements.resultRank.textContent = `Private rank: #${attempt.rank} of ${attempt.activeParticipants}`;
  elements.resultMultiplier.textContent = `Speed multiplier x ${formatDecimal(attempt.speedMultiplier, 4)}`;
  elements.resultRange.textContent = `Expected band ${formatPnl(attempt.lowerBand)} to ${formatPnl(attempt.upperBand)}`;
  elements.resultRefresh.textContent = `Snapshot scored at ${formatDate(attempt.submittedAt)}`;
  elements.scenarioBullish.textContent = formatPnl(attempt.bullishPnl);
  elements.scenarioBase.textContent = formatPnl(attempt.basePnl);
  elements.scenarioAdverse.textContent = formatPnl(attempt.adversePnl);
}

function renderHistoryChart() {
  if (!state.history.length) {
    elements.historyChartWrap.innerHTML = '<div class="chart-empty">Your PnL history will appear here once you submit an attempt.</div>';
    elements.historyTitle.textContent = "No attempts yet";
    elements.historyMeta.textContent = "Submit your first simulation to start the series.";
    return;
  }

  const width = 760;
  const height = 230;
  const paddingX = 28;
  const paddingTop = 22;
  const paddingBottom = 28;
  const values = state.history.map((attempt) => attempt.pnl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = state.history.map((attempt, index) => {
    const x = paddingX + ((width - paddingX * 2) * index) / Math.max(1, state.history.length - 1);
    const y =
      height -
      paddingBottom -
      ((attempt.pnl - min) / range) * (height - paddingTop - paddingBottom);
    return { attempt, x, y };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const y = paddingTop + ((height - paddingTop - paddingBottom) * index) / 3;
    return `<line class="chart-grid-line" x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" />`;
  }).join("");

  const dots = points
    .map(
      (point) =>
        `<circle class="chart-dot" cx="${point.x}" cy="${point.y}" r="4"><title>Attempt ${point.attempt.attemptNumber}: ${formatPnl(point.attempt.pnl)}</title></circle>`
    )
    .join("");

  elements.historyChartWrap.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="PnL history chart">
      <defs>
        <linearGradient id="historyGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#366be8"></stop>
          <stop offset="100%" stop-color="#6bd2ff"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="chart-path" d="${path}" />
      ${dots}
    </svg>
  `;

  const latest = state.history[state.history.length - 1];
  elements.historyTitle.textContent = `${state.history.length} attempts logged`;
  elements.historyMeta.textContent = `Latest PnL ${formatPnl(latest.pnl)} on ${formatDate(latest.submittedAt)}`;
}

function renderHistoryTable() {
  if (!state.history.length) {
    elements.historyTableBody.innerHTML =
      '<tr><td colspan="6" class="empty-table">No attempts logged yet.</td></tr>';
    return;
  }

  const rows = [...state.history]
    .reverse()
    .map(
      (attempt) => `
        <tr>
          <td>#${attempt.attemptNumber}</td>
          <td>R ${attempt.researchPct} / S ${attempt.scalePct} / V ${attempt.speedPct}</td>
          <td>${formatPnl(attempt.pnl)}</td>
          <td>${formatPnl(attempt.expectedPnl)}</td>
          <td>${attempt.percentile}th</td>
          <td><button class="table-action duplicate-attempt" data-attempt="${attempt.attemptNumber}" type="button">Duplicate</button></td>
        </tr>
      `
    )
    .join("");

  elements.historyTableBody.innerHTML = rows;
}

function renderAll() {
  renderPreview();
  renderIdentity();
  renderMarketSummary();
  renderResults();
  renderHistoryChart();
  renderHistoryTable();
}

function hydrateState(payload) {
  state.history = payload.history || [];
  state.latestAttempt = payload.latestAttempt || null;
  state.marketSummary = payload.marketSummary || null;
  state.participant = payload.participant || null;
  renderAll();
}

async function bootstrap() {
  state.participantIdentity = getOrCreateIdentity();
  const payload = await apiRequest(`/api/bootstrap?participantId=${encodeURIComponent(state.participantIdentity.id)}`);

  if (payload.resetRequired) {
    state.participantIdentity = getOrCreateIdentity(true);
    const fresh = await apiRequest(`/api/bootstrap?participantId=${encodeURIComponent(state.participantIdentity.id)}`);
    hydrateState(fresh);
    return;
  }

  hydrateState(payload);
}

function validateBeforeSubmit() {
  const { researchPct, scalePct, speedPct } = readCurrentAllocation();
  const values = [researchPct, scalePct, speedPct];

  if (values.some((value) => !Number.isInteger(value))) {
    return "All three fields are required and must be whole numbers.";
  }

  if (values.some((value) => value < 1 || value > 100)) {
    return "Each field must be between 1 and 100.";
  }

  if (researchPct + scalePct + speedPct > 100) {
    return "The total budget used cannot exceed 100%.";
  }

  return null;
}

async function handleSubmit(event) {
  event.preventDefault();
  const validationError = validateBeforeSubmit();

  if (validationError) {
    setFormMessage(validationError, "error");
    return;
  }

  try {
    elements.submitButton.disabled = true;
    setFormMessage("Running the field simulation...");

    const allocation = readCurrentAllocation();
    const payload = await apiRequest("/api/submit", {
      body: JSON.stringify({
        participantId: state.participantIdentity.id,
        ...allocation,
      }),
      method: "POST",
    });

    if (payload.resetRequired) {
      state.participantIdentity = getOrCreateIdentity(true);
      await bootstrap();
      setFormMessage("Your 3-day ID expired, so a fresh anonymous ID was created.", "success");
      return;
    }

    hydrateState(payload);
    setFormMessage("Attempt logged and scored against the current field.", "success");
  } catch (error) {
    setFormMessage(error.message, "error");
  } finally {
    if (state.participant?.canSubmit) {
      elements.submitButton.disabled = false;
    }
  }
}

async function handleExtension() {
  try {
    elements.extendButton.disabled = true;
    setFormMessage("Unlocking 5 more attempts...");

    const payload = await apiRequest("/api/extend", {
      body: JSON.stringify({
        participantId: state.participantIdentity.id,
      }),
      method: "POST",
    });

    if (payload.resetRequired) {
      state.participantIdentity = getOrCreateIdentity(true);
      await bootstrap();
      setFormMessage("Your 3-day ID expired, so a fresh anonymous ID was created.", "success");
      return;
    }

    hydrateState({
      ...payload,
      marketSummary: state.marketSummary,
    });
    setFormMessage("Five extra attempts unlocked for this participant.", "success");
  } catch (error) {
    setFormMessage(error.message, "error");
  } finally {
    elements.extendButton.disabled = false;
  }
}

function populateAttempt(attemptNumber) {
  const match = state.history.find((attempt) => attempt.attemptNumber === attemptNumber);
  if (!match) {
    return;
  }

  elements.researchInput.value = String(match.researchPct);
  elements.scaleInput.value = String(match.scalePct);
  elements.speedInput.value = String(match.speedPct);
  renderPreview();
  document.getElementById("invest-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  setFormMessage(`Attempt #${attemptNumber} copied into the form.`, "success");
}

elements.allocationForm.addEventListener("submit", handleSubmit);
elements.extendButton.addEventListener("click", handleExtension);
elements.historyTableBody.addEventListener("click", (event) => {
  const button = event.target.closest(".duplicate-attempt");
  if (!button) {
    return;
  }

  populateAttempt(Number.parseInt(button.dataset.attempt || "", 10));
});

[elements.researchInput, elements.scaleInput, elements.speedInput].forEach((input) => {
  input.addEventListener("input", renderPreview);
});

bootstrap().catch((error) => {
  setFormMessage(error.message, "error");
});

