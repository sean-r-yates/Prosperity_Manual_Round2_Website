const { DEFAULT_FAKE_MARKET_SIZE, MARKET_REFRESH_MS } = require("./config");
const { buildRankings, roundTo, scoreAllocation } = require("./math");

const PERSONAS = [
  "balanced",
  "research-heavy",
  "scale-heavy",
  "speed-heavy",
  "measured",
  "aggressive",
];

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedInput) {
  let seed = hashString(String(seedInput)) || 123456789;
  return function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function randomInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function choose(random, list) {
  return list[randomInt(random, 0, list.length - 1)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildAllocation(persona, random) {
  const total = randomInt(random, 72, 100);
  let researchPct = 20;
  let scalePct = 20;
  let speedPct = 20;

  switch (persona) {
    case "research-heavy":
      researchPct = randomInt(random, 38, 62);
      speedPct = randomInt(random, 8, 26);
      break;
    case "scale-heavy":
      scalePct = randomInt(random, 34, 58);
      speedPct = randomInt(random, 8, 28);
      break;
    case "speed-heavy":
      speedPct = randomInt(random, 35, 62);
      researchPct = randomInt(random, 8, 28);
      break;
    case "measured":
      researchPct = randomInt(random, 18, 34);
      scalePct = randomInt(random, 18, 34);
      speedPct = randomInt(random, 14, 30);
      break;
    case "aggressive":
      researchPct = randomInt(random, 14, 38);
      scalePct = randomInt(random, 14, 38);
      speedPct = randomInt(random, 18, 42);
      break;
    default:
      researchPct = randomInt(random, 20, 36);
      scalePct = randomInt(random, 20, 36);
      speedPct = randomInt(random, 20, 36);
      break;
  }

  const rawTotal = researchPct + scalePct + speedPct;
  const scaleFactor = total / rawTotal;

  researchPct = Math.max(1, Math.round(researchPct * scaleFactor));
  scalePct = Math.max(1, Math.round(scalePct * scaleFactor));
  speedPct = Math.max(1, total - researchPct - scalePct);

  if (speedPct < 1) {
    speedPct = 1;
    scalePct = Math.max(1, total - researchPct - speedPct);
  }

  const correctedTotal = researchPct + scalePct + speedPct;
  if (correctedTotal > 100) {
    const overflow = correctedTotal - 100;
    const reducible = scalePct > researchPct ? "scalePct" : "researchPct";
    if (reducible === "scalePct") {
      scalePct = Math.max(1, scalePct - overflow);
    } else {
      researchPct = Math.max(1, researchPct - overflow);
    }
  }

  return { researchPct, scalePct, speedPct };
}

function createFakeParticipant(seedKey, overridePersona) {
  const random = createSeededRandom(seedKey);
  const persona = overridePersona || choose(random, PERSONAS);
  const allocation = buildAllocation(persona, random);

  return {
    id: `bot_${hashString(`${seedKey}:${persona}`)}`,
    persona,
    ...allocation,
  };
}

function createInitialMarket(size = DEFAULT_FAKE_MARKET_SIZE, seedKey = Date.now()) {
  const participants = [];
  for (let index = 0; index < size; index += 1) {
    participants.push(createFakeParticipant(`${seedKey}:${index}`));
  }

  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    nextRefreshAt: new Date(Date.now() + MARKET_REFRESH_MS).toISOString(),
    participants,
  };
}

function mutateParticipant(participant, random) {
  const personaShift = random() > 0.88 ? choose(random, PERSONAS) : participant.persona;
  const base = buildAllocation(personaShift, random);

  return {
    ...participant,
    persona: personaShift,
    researchPct: clamp(
      participant.researchPct + randomInt(random, -6, 6) + Math.round((base.researchPct - participant.researchPct) * 0.25),
      1,
      98
    ),
    scalePct: clamp(
      participant.scalePct + randomInt(random, -6, 6) + Math.round((base.scalePct - participant.scalePct) * 0.25),
      1,
      98
    ),
    speedPct: clamp(
      participant.speedPct + randomInt(random, -6, 6) + Math.round((base.speedPct - participant.speedPct) * 0.25),
      1,
      98
    ),
  };
}

function normalizeParticipant(participant, random) {
  const targetTotal = clamp(
    participant.researchPct + participant.scalePct + participant.speedPct + randomInt(random, -6, 6),
    68,
    100
  );

  let researchPct = clamp(participant.researchPct, 1, 98);
  let scalePct = clamp(participant.scalePct, 1, 98);
  let speedPct = clamp(participant.speedPct, 1, 98);
  const rawTotal = researchPct + scalePct + speedPct;
  const factor = targetTotal / rawTotal;

  researchPct = Math.max(1, Math.round(researchPct * factor));
  scalePct = Math.max(1, Math.round(scalePct * factor));
  speedPct = Math.max(1, targetTotal - researchPct - scalePct);

  if (researchPct + scalePct + speedPct > 100) {
    const overflow = researchPct + scalePct + speedPct - 100;
    scalePct = Math.max(1, scalePct - overflow);
  }

  return {
    ...participant,
    researchPct,
    scalePct,
    speedPct,
  };
}

function mutateMarketSnapshot(previousState, seedKey, options = {}) {
  const random = createSeededRandom(seedKey);
  const participants = [...previousState.participants];
  const changeIntensity = options.light ? 0.18 : 0.32;
  const mutableCount = Math.max(1, Math.round(participants.length * changeIntensity));

  for (let index = 0; index < mutableCount; index += 1) {
    const targetIndex = randomInt(random, 0, participants.length - 1);
    participants[targetIndex] = normalizeParticipant(mutateParticipant(participants[targetIndex], random), random);
  }

  const removeCount = options.light ? randomInt(random, 0, 1) : randomInt(random, 0, 3);
  for (let index = 0; index < removeCount && participants.length > 24; index += 1) {
    participants.splice(randomInt(random, 0, participants.length - 1), 1);
  }

  const addCount = options.light ? randomInt(random, 0, 2) : randomInt(random, 1, 4);
  for (let index = 0; index < addCount; index += 1) {
    participants.push(createFakeParticipant(`${seedKey}:new:${index}`));
  }

  return {
    generatedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + MARKET_REFRESH_MS).toISOString(),
    participants,
  };
}

function refreshMarketState(previousState, realSignalCount = 0) {
  if (!previousState || !Array.isArray(previousState.participants) || !previousState.participants.length) {
    const initialSize = DEFAULT_FAKE_MARKET_SIZE + Math.max(-4, Math.min(6, Math.floor(realSignalCount / 3)));
    return createInitialMarket(initialSize);
  }

  return mutateMarketSnapshot(previousState, `${Date.now()}:${realSignalCount}`);
}

function sampleHalfRealUsers(realAttempts, currentParticipantId, seedKey) {
  const eligible = realAttempts.filter((attempt) => attempt.participantId !== currentParticipantId);
  if (!eligible.length) {
    return [];
  }

  const count = Math.ceil(eligible.length / 2);
  return eligible
    .map((attempt) => ({
      attempt,
      score: hashString(`${seedKey}:${currentParticipantId || "anon"}:${attempt.participantId}`),
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, count)
    .map((entry) => entry.attempt);
}

function buildCompetitionEntries(candidate, fakeParticipants, sampledRealAttempts) {
  const fakeEntries = fakeParticipants.map((participant) => ({
    id: participant.id,
    researchPct: participant.researchPct,
    scalePct: participant.scalePct,
    speedPct: participant.speedPct,
    totalPct: participant.researchPct + participant.scalePct + participant.speedPct,
  }));

  const realEntries = sampledRealAttempts.map((attempt) => ({
    id: `real_${attempt.participantId}`,
    researchPct: attempt.researchPct,
    scalePct: attempt.scalePct,
    speedPct: attempt.speedPct,
    totalPct: attempt.totalPct || attempt.researchPct + attempt.scalePct + attempt.speedPct,
  }));

  return [
    ...fakeEntries,
    ...realEntries,
    {
      id: candidate.id,
      speedPct: candidate.speedPct,
    },
  ];
}

function rankEntriesByMetric(entries, metricName) {
  const sorted = [...entries].sort((left, right) => {
    if (right[metricName] !== left[metricName]) {
      return right[metricName] - left[metricName];
    }

    return String(left.id).localeCompare(String(right.id));
  });

  const maxRank = sorted.length;
  let previousValue = null;
  let currentRank = 0;

  return sorted.map((entry, index) => {
    if (previousValue !== entry[metricName]) {
      currentRank = index + 1;
      previousValue = entry[metricName];
    }

    const percentile = Math.round(((maxRank - currentRank + 1) / maxRank) * 100);

    return {
      ...entry,
      percentile,
      rank: currentRank,
    };
  });
}

function scoreAgainstMarket(candidate, fakeParticipants, sampledRealAttempts) {
  const competitionEntries = buildCompetitionEntries(candidate, fakeParticipants, sampledRealAttempts);
  const speedRankings = buildRankings(
    competitionEntries.map((entry) => ({
      id: entry.id,
      speedPct: entry.speedPct,
    }))
  );
  const speedRankingMap = new Map(speedRankings.map((entry) => [entry.id, entry]));

  const scoredEntries = competitionEntries.map((entry) => {
    const speedMeta = speedRankingMap.get(entry.id);
    const score = scoreAllocation(
      {
        researchPct: entry.researchPct,
        scalePct: entry.scalePct,
        totalPct: entry.totalPct,
      },
      speedMeta
    );

    return {
      ...entry,
      ...score,
      speedPercentile: speedMeta.percentile,
      speedRank: speedMeta.rank,
    };
  });

  const scoreRankings = rankEntriesByMetric(scoredEntries, "pnl");
  const scoredCandidate = scoreRankings.find((entry) => entry.id === candidate.id);

  return {
    ...scoredCandidate,
    scorePercentile: scoredCandidate.percentile,
    scoreRank: scoredCandidate.rank,
  };
}

function percentileValue(sortedValues, percentile) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * percentile))
  );

  return sortedValues[index];
}

function simulateScenarioBand(candidate, marketState, realLatestAttempts, scenarioCount = 36) {
  const results = [];

  for (let index = 0; index < scenarioCount; index += 1) {
    const projection = mutateMarketSnapshot(marketState, `projection:${marketState.generatedAt}:${index}`, {
      light: true,
    });
    const sampledReal = sampleHalfRealUsers(
      realLatestAttempts,
      candidate.participantId || candidate.id,
      `projection:${marketState.generatedAt}:${index}`
    );

    const score = scoreAgainstMarket(candidate, projection.participants, sampledReal);
    results.push(score.pnl);
  }

  const sorted = [...results].sort((left, right) => left - right);
  const expectedPnl = results.reduce((sum, value) => sum + value, 0) / results.length;

  return {
    adverse: roundTo(percentileValue(sorted, 0.2), 2),
    base: roundTo(percentileValue(sorted, 0.5), 2),
    bullish: roundTo(percentileValue(sorted, 0.8), 2),
    expectedPnl: roundTo(expectedPnl, 2),
    lowerBand: roundTo(percentileValue(sorted, 0.1), 2),
    upperBand: roundTo(percentileValue(sorted, 0.9), 2),
  };
}

module.exports = {
  buildCompetitionEntries,
  createInitialMarket,
  refreshMarketState,
  sampleHalfRealUsers,
  scoreAgainstMarket,
  simulateScenarioBand,
};
