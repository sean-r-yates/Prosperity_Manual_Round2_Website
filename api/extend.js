const { extendParticipantAttempts } = require("../lib/data");
const { methodNotAllowed, readJsonBody, sendError, sendOk } = require("../lib/http");

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

    const state = await extendParticipantAttempts(participantId);
    return sendOk(res, state);
  } catch (error) {
    return sendError(res, 400, error.message);
  }
};

