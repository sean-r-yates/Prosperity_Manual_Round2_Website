const { methodNotAllowed, sendOk } = require("../lib/http");
const { clearAdminSession } = require("../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  clearAdminSession(res);
  return sendOk(res, { ok: true });
};

