const {
  BASE_ATTEMPTS,
  EXTENSION_ATTEMPTS,
  MARKET_REFRESH_MS,
  PARTICIPANT_TTL_MS,
} = require("./config");
const {
  addToSet,
  getJson,
  getListRange,
  getManyJson,
  getSetMembers,
  increment,
  pushToList,
  setJson,
} = require("./kv");
const {
  buildCompetitionEntries,
  createInitialMarket,
  refreshMarketState,
  sampleHalfRealUsers,
  scoreAgainstMarket,
  simulateScenarioBand,
} = require("./fake-market");
const { roundTo } = require("./math");

const KEY_PREFIX = "signal-outpost";

function keys(participantId) {
  return {
    allAttempts: `${KEY_PREFIX}:attempts:all`,
    attemptCounter: `${KEY_PREFIX}:attempt-counter`,
    latestAttempt: `${KEY_PREFIX}:user:${participantId}:latest`,
    market: `${KEY_PREFIX}:market`,
    userAttempts: `${KEY_PREFIX}:user:${participantId}:attempts`,
    userProfile: `${KEY_PREFIX}:user:${participantId}:profile`,
    users: `${KEY_PREFIX}:users`,
  };
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isValidParticipantAllocation(record) {
  return Boolean(
    record &&
    toFiniteNumber(record.researchPct) !== null &&
    toFiniteNumber(record.scalePct) !== null &&
    toFiniteNumber(record.speedPct) !== null
  );
}

function normalizeAttemptRecord(record) {
  if (!record || typeof record !== "object" || !record.participantId || !isValidParticipantAllocation(record)) {
    return null;
  }

  const normalized = {
    ...record,
    researchPct: toFiniteNumber(record.researchPct),
    scalePct: toFiniteNumber(record.scalePct),
    speedPct: toFiniteNumber(record.speedPct),
    totalPct: toFiniteNumber(record.totalPct)
      ?? toFiniteNumber(record.researchPct) + toFiniteNumber(record.scalePct) + toFiniteNumber(record.speedPct),
  };

  [
    "activeParticipants",
    "adversePnl",
    "basePnl",
    "budgetUsed",
    "bullishPnl",
    "expectedPnl",
    "fakeParticipants",
    "grossPnl",
    "lowerBand",
    "percentile",
    "pnl",
    "rank",
    "researchValue",
    "sampledRealParticipants",
    "scaleValue",
    "scorePercentile",
    "scoreRank",
    "speedMultiplier",
    "speedPercentile",
    "speedRank",
    "upperBand",
  ].forEach((field) => {
    const numeric = toFiniteNumber(record[field]);
    if (numeric !== null) {
      normalized[field] = numeric;
    }
  });

  return normalized;
}

function isValidMarketState(market) {
  return Boolean(
    market &&
    typeof market === "object" &&
    Array.isArray(market.participants) &&
    market.participants.length &&
    market.participants.every(isValidParticipantAllocation)
  );
}

function parseAttemptList(list) {
  return list.reduce((records, entry, index) => {
    try {
      const parsed = JSON.parse(entry);
      const normalized = normalizeAttemptRecord(parsed);

      if (normalized) {
        records.push(normalized);
      } else {
        console.warn(`Skipping malformed attempt record at index ${index}.`);
      }
    } catch (error) {
      console.warn(`Unable to parse attempt record at index ${index}.`, error);
    }

    return records;
  }, []);
}

function hasScoreMetrics(record) {
  return [
    "budgetUsed",
    "grossPnl",
    "pnl",
    "researchValue",
    "scaleValue",
    "speedMultiplier",
  ].every((field) => toFiniteNumber(record[field]) !== null);
}

function hasScenarioMetrics(record) {
  return [
    "adversePnl",
    "basePnl",
    "bullishPnl",
    "expectedPnl",
    "lowerBand",
    "upperBand",
  ].every((field) => toFiniteNumber(record[field]) !== null);
}

function hasCompleteSubmissionMetrics(currentScore, scenarios) {
  return (
    hasScoreMetrics(currentScore) &&
    hasScenarioMetrics({
      adversePnl: scenarios.adverse,
      basePnl: scenarios.base,
      bullishPnl: scenarios.bullish,
      expectedPnl: scenarios.expectedPnl,
      lowerBand: scenarios.lowerBand,
      upperBand: scenarios.upperBand,
    })
  );
}

function repairAttemptRecord(record, market, latestRealAttempts) {
  if (!record || !isValidMarketState(market)) {
    return record;
  }

  const needsRepair =
    !hasScoreMetrics(record) ||
    !hasScenarioMetrics(record) ||
    toFiniteNumber(record.scorePercentile) === null ||
    toFiniteNumber(record.scoreRank) === null;

  if (!needsRepair) {
    return record;
  }

  const candidate = {
    id: `repair_${record.attemptId || `${record.participantId}_${record.attemptNumber || "attempt"}`}`,
    participantId: record.participantId,
    researchPct: record.researchPct,
    scalePct: record.scalePct,
    speedPct: record.speedPct,
    totalPct: record.totalPct,
  };
  const sampledRealAttempts = sampleHalfRealUsers(
    latestRealAttempts,
    record.participantId,
    market.generatedAt || record.submittedAt || new Date().toISOString()
  );
  const currentScore = scoreAgainstMarket(candidate, market.participants, sampledRealAttempts);
  const scenarios = simulateScenarioBand(candidate, market, latestRealAttempts);
  const competitionSize = buildCompetitionEntries(candidate, market.participants, sampledRealAttempts).length;

  return {
    ...record,
    activeParticipants: competitionSize,
    adversePnl: scenarios.adverse,
    basePnl: scenarios.base,
    budgetUsed: currentScore.budgetUsed,
    bullishPnl: scenarios.bullish,
    expectedPnl: scenarios.expectedPnl,
    fakeParticipants: market.participants.length,
    grossPnl: currentScore.grossPnl,
    lowerBand: scenarios.lowerBand,
    percentile: currentScore.scorePercentile,
    pnl: currentScore.pnl,
    rank: currentScore.scoreRank,
    researchValue: currentScore.researchValue,
    sampledRealParticipants: sampledRealAttempts.length,
    scaleValue: currentScore.scaleValue,
    scorePercentile: currentScore.scorePercentile,
    scoreRank: currentScore.scoreRank,
    speedMultiplier: currentScore.speedMultiplier,
    speedPercentile: currentScore.speedPercentile,
    speedRank: currentScore.speedRank,
    upperBand: scenarios.upperBand,
  };
}

function buildParticipantState(profile, history) {
  const attemptCount = history.length;
  const extensionGranted = Boolean(profile && profile.extensionGranted);
  const maxAttempts = BASE_ATTEMPTS + (extensionGranted ? EXTENSION_ATTEMPTS : 0);
  const attemptsRemaining = Math.max(0, maxAttempts - attemptCount);

  return {
    attemptCount,
    attemptsRemaining,
    canSubmit: attemptsRemaining > 0,
    extensionGranted,
    extensionOffered: attemptCount >= BASE_ATTEMPTS && !extensionGranted,
    extensionRemaining: extensionGranted ? Math.max(0, maxAttempts - BASE_ATTEMPTS - Math.max(0, attemptCount - BASE_ATTEMPTS)) : 0,
    maxAttempts,
  };
}

async function getParticipantProfile(participantId) {
  if (!participantId) {
    return null;
  }
  return getJson(keys(participantId).userProfile);
}

async function getParticipantHistory(participantId) {
  if (!participantId) {
    return [];
  }

  const result = await getListRange(keys(participantId).userAttempts, 0, -1);
  return parseAttemptList(result);
}

async function ensureMarketState() {
  const current = await getJson(keys("shared").market);
  if (!isValidMarketState(current)) {
    const created = createInitialMarket();
    await setJson(keys("shared").market, created);
    return created;
  }

  const generatedAt = Date.parse(current.generatedAt || 0);
  if (Number.isNaN(generatedAt) || Date.now() - generatedAt >= MARKET_REFRESH_MS) {
    const realUserIds = await getSetMembers(keys("shared").users);
    const refreshed = refreshMarketState(current, realUserIds.length);
    await setJson(keys("shared").market, refreshed);
    return refreshed;
  }

  return current;
}

async function getLatestRealAttempts() {
  const participantIds = await getSetMembers(keys("shared").users);
  if (!participantIds.length) {
    return [];
  }

  const latestAttempts = await getManyJson(
    participantIds.map((participantId) => keys(participantId).latestAttempt)
  );
  return latestAttempts
    .map(normalizeAttemptRecord)
    .filter(Boolean);
}

async function bootstrapParticipant(participantId) {
  const market = await ensureMarketState();
  if (!participantId) {
    return {
      marketSummary: {
        activeParticipants: market.participants.length,
        generatedAt: market.generatedAt,
      },
      participant: null,
    };
  }

  const [profile, history, latestRealAttempts] = await Promise.all([
    getParticipantProfile(participantId),
    getParticipantHistory(participantId),
    getLatestRealAttempts(),
  ]);

  if (profile && Date.now() > Date.parse(profile.expiresAt)) {
    return {
      marketSummary: {
        activeParticipants: market.participants.length,
        generatedAt: market.generatedAt,
      },
      resetRequired: true,
    };
  }

  const participantState = buildParticipantState(profile, history);
  const repairedHistory = history.map((record) => repairAttemptRecord(record, market, latestRealAttempts));
  const latestAttempt = repairedHistory.length ? repairedHistory[repairedHistory.length - 1] : null;

  return {
    history: repairedHistory,
    latestAttempt,
    marketSummary: {
      activeParticipants: market.participants.length,
      generatedAt: market.generatedAt,
    },
    participant: {
      ...(profile || {
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + PARTICIPANT_TTL_MS).toISOString(),
        extensionGranted: false,
        participantId,
      }),
      ...participantState,
    },
  };
}

function buildAttemptRecord(participantId, allocation, currentScore, scenarios, meta, attemptNumber) {
  return {
    attemptId: `${participantId}-${attemptNumber}`,
    attemptNumber,
    participantId,
    submittedAt: new Date().toISOString(),
    researchPct: allocation.researchPct,
    scalePct: allocation.scalePct,
    speedPct: allocation.speedPct,
    totalPct: allocation.totalPct,
    researchValue: currentScore.researchValue,
    scaleValue: currentScore.scaleValue,
    speedMultiplier: currentScore.speedMultiplier,
    budgetUsed: currentScore.budgetUsed,
    grossPnl: currentScore.grossPnl,
    pnl: currentScore.pnl,
    percentile: currentScore.scorePercentile,
    rank: currentScore.scoreRank,
    scorePercentile: currentScore.scorePercentile,
    scoreRank: currentScore.scoreRank,
    speedPercentile: currentScore.speedPercentile,
    speedRank: currentScore.speedRank,
    expectedPnl: scenarios.expectedPnl,
    bullishPnl: scenarios.bullish,
    basePnl: scenarios.base,
    adversePnl: scenarios.adverse,
    lowerBand: scenarios.lowerBand,
    upperBand: scenarios.upperBand,
    activeParticipants: meta.activeParticipants,
    fakeParticipants: meta.fakeParticipants,
    sampledRealParticipants: meta.sampledRealParticipants,
  };
}

async function submitAttempt(participantId, allocation) {
  const [profile, history, market, latestRealAttempts] = await Promise.all([
    getParticipantProfile(participantId),
    getParticipantHistory(participantId),
    ensureMarketState(),
    getLatestRealAttempts(),
  ]);

  if (profile && Date.now() > Date.parse(profile.expiresAt)) {
    return { resetRequired: true };
  }

  const participantProfile =
    profile ||
    {
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + PARTICIPANT_TTL_MS).toISOString(),
      extensionGranted: false,
      participantId,
    };

  const participantState = buildParticipantState(participantProfile, history);
  if (!participantState.canSubmit) {
    throw new Error("This participant has used all available attempts.");
  }

  const sampledRealAttempts = sampleHalfRealUsers(
    latestRealAttempts,
    participantId,
    market.generatedAt || new Date().toISOString()
  );
  const candidate = {
    id: `candidate_${participantId}`,
    participantId,
    researchPct: allocation.researchPct,
    scalePct: allocation.scalePct,
    speedPct: allocation.speedPct,
    totalPct: allocation.totalPct,
  };

  const currentScore = scoreAgainstMarket(candidate, market.participants, sampledRealAttempts);
  const scenarios = simulateScenarioBand(candidate, market, latestRealAttempts);

  if (!hasCompleteSubmissionMetrics(currentScore, scenarios)) {
    throw new Error("Unable to score this submission right now. Refresh and try again.");
  }

  const attemptNumber = history.length + 1;
  const record = buildAttemptRecord(
    participantId,
    allocation,
    currentScore,
    scenarios,
    {
      activeParticipants: buildCompetitionEntries(candidate, market.participants, sampledRealAttempts).length,
      fakeParticipants: market.participants.length,
      sampledRealParticipants: sampledRealAttempts.length,
    },
    attemptNumber
  );

  await Promise.all([
    addToSet(keys("shared").users, participantId),
    setJson(keys(participantId).userProfile, participantProfile),
    setJson(keys(participantId).latestAttempt, record),
    pushToList(keys(participantId).userAttempts, JSON.stringify(record)),
    pushToList(keys("shared").allAttempts, JSON.stringify(record)),
    increment(keys("shared").attemptCounter),
  ]);

  const nextHistory = [...history, record];
  return {
    history: nextHistory,
    latestAttempt: record,
    marketSummary: {
      activeParticipants: record.activeParticipants,
      generatedAt: market.generatedAt,
    },
    participant: {
      ...participantProfile,
      ...buildParticipantState(participantProfile, nextHistory),
    },
  };
}

async function extendParticipantAttempts(participantId) {
  const [profile, history] = await Promise.all([
    getParticipantProfile(participantId),
    getParticipantHistory(participantId),
  ]);

  if (!profile) {
    throw new Error("Participant record not found yet.");
  }

  if (Date.now() > Date.parse(profile.expiresAt)) {
    return { resetRequired: true };
  }

  if (profile.extensionGranted) {
    throw new Error("This participant has already used the extension.");
  }

  if (history.length < BASE_ATTEMPTS) {
    throw new Error("The extension unlocks after the first 20 attempts are used.");
  }

  const nextProfile = {
    ...profile,
    extensionGranted: true,
    extensionGrantedAt: new Date().toISOString(),
  };

  await setJson(keys(participantId).userProfile, nextProfile);

  return {
    history,
    latestAttempt: history.length ? history[history.length - 1] : null,
    participant: {
      ...nextProfile,
      ...buildParticipantState(nextProfile, history),
    },
  };
}

async function getAllAttempts() {
  const attempts = await getListRange(keys("shared").allAttempts, 0, -1);
  return parseAttemptList(attempts);
}

function createFieldHistogram(records, fieldName) {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    count: 0,
    label: `${index * 10 + 1}-${index === 9 ? 100 : (index + 1) * 10}`,
  }));

  records.forEach((record) => {
    const value = record[fieldName];
    const binIndex = Math.min(9, Math.max(0, Math.floor((value - 1) / 10)));
    bins[binIndex].count += 1;
  });

  return bins;
}

function summarizeAverage(records, fieldName) {
  if (!records.length) {
    return 0;
  }

  const total = records.reduce((sum, record) => sum + record[fieldName], 0);
  return roundTo(total / records.length, 1);
}

async function getAdminOverview() {
  const [allAttempts, realUserIds, market, latestAttempts] = await Promise.all([
    getAllAttempts(),
    getSetMembers(keys("shared").users),
    ensureMarketState(),
    getLatestRealAttempts(),
  ]);

  const realSummary = {
    attempts: allAttempts.length,
    averageResearch: summarizeAverage(allAttempts, "researchPct"),
    averageScale: summarizeAverage(allAttempts, "scalePct"),
    averageSpeed: summarizeAverage(allAttempts, "speedPct"),
    histograms: {
      research: createFieldHistogram(allAttempts, "researchPct"),
      scale: createFieldHistogram(allAttempts, "scalePct"),
      speed: createFieldHistogram(allAttempts, "speedPct"),
    },
    recentAttempts: [...allAttempts].slice(-20).reverse(),
    totalUsers: realUserIds.length,
  };

  const sampledReal = sampleHalfRealUsers(latestAttempts, "__admin__", market.generatedAt || Date.now());
  const mixedRecords = [
    ...market.participants.map((participant) => ({
      researchPct: participant.researchPct,
      scalePct: participant.scalePct,
      speedPct: participant.speedPct,
    })),
    ...sampledReal.map((attempt) => ({
      researchPct: attempt.researchPct,
      scalePct: attempt.scalePct,
      speedPct: attempt.speedPct,
    })),
  ];

  const mixedSummary = {
    activeParticipants: mixedRecords.length,
    averageResearch: summarizeAverage(mixedRecords, "researchPct"),
    averageScale: summarizeAverage(mixedRecords, "scalePct"),
    averageSpeed: summarizeAverage(mixedRecords, "speedPct"),
    fakeParticipants: market.participants.length,
    sampledRealParticipants: sampledReal.length,
    generatedAt: market.generatedAt,
    histograms: {
      research: createFieldHistogram(mixedRecords, "researchPct"),
      scale: createFieldHistogram(mixedRecords, "scalePct"),
      speed: createFieldHistogram(mixedRecords, "speedPct"),
    },
  };

  return {
    mixedSummary,
    realSummary,
  };
}

async function exportAttemptsCsv() {
  const attempts = await getAllAttempts();
  const header = [
    "participant_id",
    "attempt_number",
    "submitted_at",
    "research_pct",
    "scale_pct",
    "speed_pct",
    "total_pct",
    "research_value",
    "scale_value",
    "speed_multiplier",
    "budget_used",
    "gross_pnl",
    "pnl",
    "percentile",
    "rank",
    "expected_pnl",
    "bullish_pnl",
    "base_pnl",
    "adverse_pnl",
    "lower_band",
    "upper_band",
  ];

  const rows = attempts.map((attempt) =>
    [
      attempt.participantId,
      attempt.attemptNumber,
      attempt.submittedAt,
      attempt.researchPct,
      attempt.scalePct,
      attempt.speedPct,
      attempt.totalPct,
      attempt.researchValue,
      attempt.scaleValue,
      attempt.speedMultiplier,
      attempt.budgetUsed,
      attempt.grossPnl,
      attempt.pnl,
      attempt.percentile,
      attempt.rank,
      attempt.expectedPnl,
      attempt.bullishPnl,
      attempt.basePnl,
      attempt.adversePnl,
      attempt.lowerBand,
      attempt.upperBand,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );

  return [header.join(","), ...rows].join("\n");
}

module.exports = {
  bootstrapParticipant,
  exportAttemptsCsv,
  extendParticipantAttempts,
  getAdminOverview,
  submitAttempt,
};
