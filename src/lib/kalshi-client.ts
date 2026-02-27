import crypto from "crypto";
import fs from "fs";
import path from "path";

const KALSHI_API_BASE = "https://api.elections.kalshi.com/trade-api/v2";
const SIGNING_PATH_PREFIX = "/trade-api/v2";

let cachedPrivateKey: string | null = null;

function getPrivateKey(): string {
  if (cachedPrivateKey) return cachedPrivateKey;

  const keyContent = process.env.KALSHI_PRIVATE_KEY;
  if (keyContent) {
    cachedPrivateKey = keyContent;
    return cachedPrivateKey;
  }

  const keyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
  if (!keyPath) throw new Error("KALSHI_PRIVATE_KEY or KALSHI_PRIVATE_KEY_PATH must be set");

  const resolved = path.resolve(keyPath);
  cachedPrivateKey = fs.readFileSync(resolved, "utf8");
  return cachedPrivateKey;
}

function getApiKey(): string {
  const key = process.env.KALSHI_API_KEY;
  if (!key) throw new Error("KALSHI_API_KEY is not set");
  return key;
}

function signRequest(
  privateKeyPem: string,
  timestamp: string,
  method: string,
  pathWithoutQuery: string
): string {
  const message = timestamp + method + pathWithoutQuery;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(message);
  sign.end();
  const signature = sign.sign({
    key: privateKeyPem,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  });
  return signature.toString("base64");
}

export async function kalshiFetch(
  method: string,
  apiPath: string,
  body?: unknown
): Promise<Response> {
  const privateKey = getPrivateKey();
  const apiKey = getApiKey();

  const timestamp = Date.now().toString();
  const signingPath = SIGNING_PATH_PREFIX + apiPath.split("?")[0];
  const signature = signRequest(privateKey, timestamp, method.toUpperCase(), signingPath);

  const headers: Record<string, string> = {
    "KALSHI-ACCESS-KEY": apiKey,
    "KALSHI-ACCESS-TIMESTAMP": timestamp,
    "KALSHI-ACCESS-SIGNATURE": signature,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const url = KALSHI_API_BASE + apiPath;

  return fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
