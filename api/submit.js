const { submitAttempt } = require("../lib/data");
const { methodNotAllowed, readJsonBody, sendError, sendOk } = require("../lib/http");
const { validateAllocations } = require("../lib/math");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const participantId = body.participantId;

    if (!participantId || typeof participantId !== "string") {
      return sendError(res, 400, "A participant ID is required.");
    }

    const validation = validateAllocations(body);
    if (!validation.ok) {
      return sendError(res, 400, validation.message);
    }

    const state = await submitAttempt(participantId, validation.values);
    if (state.resetRequired) {
      return sendOk(res, state);
    }

    return sendOk(res, state);
  } catch (error) {
    return sendError(res, 400, error.message);
  }
};

