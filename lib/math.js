const {
  FIELD_MAX,
  FIELD_MIN,
  RESEARCH_CAP,
  SCALE_CAP,
  TOTAL_BUDGET,
} = require("./config");

function toInteger(value) {
  if (value === "" || value === null || value === undefined) {
    return NaN;
  }

  return Number.parseInt(value, 10);
}

function isWholeNumber(value) {
  return Number.isInteger(value);
}

function validateAllocations(input) {
  const researchPct = toInteger(input.researchPct);
  const scalePct = toInteger(input.scalePct);
  const speedPct = toInteger(input.speedPct);

  const values = { researchPct, scalePct, speedPct };

  for (const [field, value] of Object.entries(values)) {
    if (!isWholeNumber(value)) {
      return { ok: false, message: `${field} must be a whole number.` };
    }

    if (value < FIELD_MIN || value > FIELD_MAX) {
      return {
        ok: false,
        message: `${field} must be between ${FIELD_MIN} and ${FIELD_MAX}.`,
      };
    }
  }

  const totalPct = researchPct + scalePct + speedPct;

  if (totalPct > 100) {
    return { ok: false, message: "Budget usage cannot exceed 100%." };
  }

  return {
    ok: true,
    values: {
      researchPct,
      scalePct,
      speedPct,
      totalPct,
    },
  };
}

function calculateResearchValue(researchPct) {
  return RESEARCH_CAP * Math.log(1 + researchPct) / Math.log(101);
}

function calculateScaleValue(scalePct) {
  return SCALE_CAP * (scalePct / 100);
}

function calculateBudgetUsed(totalPct) {
  return TOTAL_BUDGET * (totalPct / 100);
}

function roundTo(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildRankings(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.speedPct !== a.speedPct) {
      return b.speedPct - a.speedPct;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  const maxRank = sorted.length;
  let previousSpeed = null;
  let currentRank = 0;

  return sorted.map((entry, index) => {
    if (previousSpeed !== entry.speedPct) {
      currentRank = index + 1;
      previousSpeed = entry.speedPct;
    }

    const multiplier =
      maxRank <= 1 ? 0.9 : 0.9 - ((currentRank - 1) * 0.8) / (maxRank - 1);
    const percentile = Math.round(((maxRank - currentRank + 1) / maxRank) * 100);

    return {
      ...entry,
      percentile,
      rank: currentRank,
      speedMultiplier: roundTo(multiplier, 4),
    };
  });
}

function scoreAllocation(allocation, rankMeta) {
  const researchValue = calculateResearchValue(allocation.researchPct);
  const scaleValue = calculateScaleValue(allocation.scalePct);
  const budgetUsed = calculateBudgetUsed(allocation.totalPct);
  const grossPnl = researchValue * scaleValue * rankMeta.speedMultiplier;
  const pnl = grossPnl - budgetUsed;

  return {
    budgetUsed: roundTo(budgetUsed, 0),
    grossPnl: roundTo(grossPnl, 2),
    percentile: rankMeta.percentile,
    pnl: roundTo(pnl, 2),
    rank: rankMeta.rank,
    researchValue: roundTo(researchValue, 0),
    scaleValue: roundTo(scaleValue, 2),
    speedMultiplier: rankMeta.speedMultiplier,
  };
}

module.exports = {
  buildRankings,
  calculateBudgetUsed,
  calculateResearchValue,
  calculateScaleValue,
  roundTo,
  scoreAllocation,
  validateAllocations,
};

