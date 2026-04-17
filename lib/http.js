function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(payload));
}

function sendOk(res, payload) {
  sendJson(res, 200, payload);
}

function sendError(res, statusCode, message, details) {
  const payload = { error: message };
  if (details) {
    payload.details = details;
  }
  sendJson(res, statusCode, payload);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const raw = await new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Invalid JSON payload.");
  }
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  return sendError(res, 405, "Method not allowed.");
}

module.exports = {
  methodNotAllowed,
  readJsonBody,
  sendError,
  sendJson,
  sendOk,
};

