const elements = {
  adminAttemptsBody: document.getElementById("admin-attempts-body"),
  adminDashboard: document.getElementById("admin-dashboard"),
  adminMessage: document.getElementById("admin-message"),
  adminMixedSize: document.getElementById("admin-mixed-size"),
  adminMixedTime: document.getElementById("admin-mixed-time"),
  adminPassword: document.getElementById("admin-password"),
  adminTotalAttempts: document.getElementById("admin-total-attempts"),
  adminTotalUsers: document.getElementById("admin-total-users"),
  authPanel: document.getElementById("admin-auth-panel"),
  downloadLink: document.getElementById("download-link"),
  loginForm: document.getElementById("admin-login-form"),
  logoutButton: document.getElementById("logout-button"),
  mixedAveragesLine: document.getElementById("mixed-averages-line"),
  mixedResearchChart: document.getElementById("mixed-research-chart"),
  mixedScaleChart: document.getElementById("mixed-scale-chart"),
  mixedSpeedChart: document.getElementById("mixed-speed-chart"),
  realAveragesLine: document.getElementById("real-averages-line"),
  realResearchChart: document.getElementById("real-research-chart"),
  realScaleChart: document.getElementById("real-scale-chart"),
  realSpeedChart: document.getElementById("real-speed-chart"),
};

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(Number(value || 0));
}

function formatPnl(value) {
  const numeric = Number(value || 0);
  const prefix = numeric >= 0 ? "+" : "";
  return `${prefix}${formatNumber(numeric, 2)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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

function setMessage(message, type = "muted") {
  elements.adminMessage.textContent = message || "";
  elements.adminMessage.style.color =
    type === "error" ? "var(--red)" : type === "success" ? "var(--green)" : "var(--muted)";
}

function renderHistogram(target, title, bins) {
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  target.innerHTML = `
    <h3 class="mini-chart-title">${title}</h3>
    <div class="histogram">
      ${bins
        .map(
          (bin) => `
            <div class="histogram-row">
              <span class="histogram-label">${bin.label}</span>
              <div class="histogram-bar">
                <div class="histogram-fill" style="width:${(bin.count / max) * 100}%"></div>
              </div>
              <span class="histogram-value">${bin.count}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderAttempts(records) {
  if (!records.length) {
    elements.adminAttemptsBody.innerHTML =
      '<tr><td colspan="6" class="empty-table">No attempt data yet.</td></tr>';
    return;
  }

  elements.adminAttemptsBody.innerHTML = records
    .map(
      (attempt) => `
        <tr>
          <td>${attempt.participantId}</td>
          <td>#${attempt.attemptNumber}</td>
          <td>R ${attempt.researchPct} / S ${attempt.scalePct} / V ${attempt.speedPct}</td>
          <td>${formatPnl(attempt.pnl)}</td>
          <td>${formatPnl(attempt.expectedPnl)}</td>
          <td>${formatDate(attempt.submittedAt)}</td>
        </tr>
      `
    )
    .join("");
}

function renderDashboard(payload) {
  const { realSummary, mixedSummary } = payload;

  elements.adminTotalUsers.textContent = formatNumber(realSummary.totalUsers);
  elements.adminTotalAttempts.textContent = formatNumber(realSummary.attempts);
  elements.adminMixedSize.textContent = formatNumber(mixedSummary.activeParticipants);
  elements.adminMixedTime.textContent = mixedSummary.generatedAt ? formatDate(mixedSummary.generatedAt) : "--";
  elements.realAveragesLine.textContent = `Research ${realSummary.averageResearch}% | Scale ${realSummary.averageScale}% | Speed ${realSummary.averageSpeed}%`;
  elements.mixedAveragesLine.textContent = `Research ${mixedSummary.averageResearch}% | Scale ${mixedSummary.averageScale}% | Speed ${mixedSummary.averageSpeed}%`;

  renderHistogram(elements.realResearchChart, "Research", realSummary.histograms.research);
  renderHistogram(elements.realScaleChart, "Scale", realSummary.histograms.scale);
  renderHistogram(elements.realSpeedChart, "Speed", realSummary.histograms.speed);
  renderHistogram(elements.mixedResearchChart, "Research", mixedSummary.histograms.research);
  renderHistogram(elements.mixedScaleChart, "Scale", mixedSummary.histograms.scale);
  renderHistogram(elements.mixedSpeedChart, "Speed", mixedSummary.histograms.speed);
  renderAttempts(realSummary.recentAttempts);

  elements.authPanel.classList.add("hidden");
  elements.adminDashboard.classList.remove("hidden");
}

async function loadDashboard() {
  const payload = await apiRequest("/api/admin-overview");
  renderDashboard(payload);
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    setMessage("Checking password...");
    await apiRequest("/api/admin-login", {
      body: JSON.stringify({
        password: elements.adminPassword.value,
      }),
      method: "POST",
    });

    await loadDashboard();
    setMessage("Admin dashboard opened.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

elements.logoutButton.addEventListener("click", async () => {
  try {
    await apiRequest("/api/admin-logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    elements.adminDashboard.classList.add("hidden");
    elements.authPanel.classList.remove("hidden");
    setMessage("Logged out.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
});

loadDashboard().catch(() => {
  setMessage("Enter the admin password to continue.");
});

