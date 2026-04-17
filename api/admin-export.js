const { exportAttemptsCsv } = require("../lib/data");
const { methodNotAllowed, sendError } = require("../lib/http");
const { isAdminAuthenticated } = require("../lib/session");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  if (!isAdminAuthenticated(req)) {
    return sendError(res, 401, "Admin authentication required.");
  }

  try {
    const csv = await exportAttemptsCsv();
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Content-Disposition", 'attachment; filename="signal-outpost-real-attempts.csv"');
    return res.end(csv);
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

