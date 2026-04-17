const { bootstrapParticipant } = require("../lib/data");
const { methodNotAllowed, sendError, sendOk } = require("../lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const participantId = req.query.participantId || "";
    const state = await bootstrapParticipant(participantId);
    return sendOk(res, state);
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

