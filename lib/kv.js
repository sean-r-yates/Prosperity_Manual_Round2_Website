function getKvCredentials() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing KV_REST_API_URL or KV_REST_API_TOKEN. Connect Vercel KV or Upstash Redis before using the API."
    );
  }

  return { url, token };
}

async function callKv(path, options = {}) {
  const { url, token } = getKvCredentials();
  const response = await fetch(`${url}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
    body: options.body,
  });

  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `KV request failed with status ${response.status}.`);
  }

  return payload.result;
}

function encodePart(value) {
  return encodeURIComponent(String(value));
}

function parseJsonSafely(raw, context) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Unable to parse stored JSON for ${context}.`, error);
    return null;
  }
}

async function setString(key, value) {
  return callKv(`/set/${encodePart(key)}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: value,
  });
}

async function getString(key) {
  return callKv(`/get/${encodePart(key)}`);
}

async function setJson(key, value) {
  return setString(key, JSON.stringify(value));
}

async function getJson(key) {
  const raw = await getString(key);
  return parseJsonSafely(raw, key);
}

async function increment(key) {
  return callKv(`/incr/${encodePart(key)}`);
}

async function addToSet(key, value) {
  return callKv(`/sadd/${encodePart(key)}/${encodePart(value)}`);
}

async function getSetMembers(key) {
  const result = await callKv(`/smembers/${encodePart(key)}`);
  return Array.isArray(result) ? result : [];
}

async function pushToList(key, value) {
  return callKv(`/rpush/${encodePart(key)}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: value,
  });
}

async function getListRange(key, start = 0, end = -1) {
  const result = await callKv(`/lrange/${encodePart(key)}/${encodePart(start)}/${encodePart(end)}`);
  return Array.isArray(result) ? result : [];
}

async function runPipeline(commands) {
  const { url, token } = getKvCredentials();
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`KV pipeline failed with status ${response.status}.`);
  }

  return payload.map((entry) => {
    if (entry.error) {
      throw new Error(entry.error);
    }
    return entry.result;
  });
}

async function getManyJson(keys) {
  if (!keys.length) {
    return [];
  }

  const results = await runPipeline(keys.map((key) => ["GET", key]));
  return results.map((raw, index) => parseJsonSafely(raw, keys[index]));
}

module.exports = {
  addToSet,
  getJson,
  getListRange,
  getManyJson,
  getSetMembers,
  getString,
  increment,
  pushToList,
  runPipeline,
  setJson,
  setString,
};

