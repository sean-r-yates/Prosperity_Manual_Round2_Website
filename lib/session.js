const crypto = require("crypto");
const { COOKIE_NAME } = require("./config");

function parseCookies(header) {
  const cookieHeader = header || "";
  return cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = pair.slice(0, separatorIndex);
      const value = pair.slice(separatorIndex + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "signal-outpost-fallback-secret";
}

function buildAdminToken() {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update("signal-outpost-admin-session-v1")
    .digest("hex");
}

function setAdminSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "Secure; " : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${buildAdminToken()}; HttpOnly; Path=/; SameSite=Strict; ${secure}Max-Age=28800`
  );
}

function clearAdminSession(res) {
  const secure = process.env.NODE_ENV === "production" ? "Secure; " : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; ${secure}Max-Age=0`
  );
}

function isAdminAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] === buildAdminToken();
}

module.exports = {
  clearAdminSession,
  isAdminAuthenticated,
  parseCookies,
  setAdminSession,
};

