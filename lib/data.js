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

function parseAttemptList(list) {
  return list.map((entry) => JSON.parse(entry));
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
  if (!current) {
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
  return latestAttempts.filter(Boolean);
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

  const [profile, history] = await Promise.all([
    getParticipantProfile(participantId),
    getParticipantHistory(participantId),
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
  const latestAttempt = history.length ? history[history.length - 1] : null;

  return {
    history,
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
