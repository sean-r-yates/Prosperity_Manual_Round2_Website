const { methodNotAllowed, readJsonBody, sendError, sendOk } = require("../lib/http");
const { setAdminSession } = require("../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const password = body.password || "";

    if (!process.env.ADMIN_PASSWORD) {
      return sendError(res, 500, "ADMIN_PASSWORD is not configured.");
    }

    if (password !== process.env.ADMIN_PASSWORD) {
      return sendError(res, 401, "Incorrect password.");
    }

    setAdminSession(res);
    return sendOk(res, { ok: true });
  } catch (error) {
    return sendError(res, 400, error.message);
  }
};

