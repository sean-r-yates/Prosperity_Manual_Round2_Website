const { getAdminOverview } = require("../lib/data");
const { methodNotAllowed, sendError, sendOk } = require("../lib/http");
const { isAdminAuthenticated } = require("../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  if (!isAdminAuthenticated(req)) {
    return sendError(res, 401, "Admin authentication required.");
  }

  try {
    const overview = await getAdminOverview();
    return sendOk(res, overview);
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

