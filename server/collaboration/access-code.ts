import crypto from "node:crypto";

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export const SHARE_ACCESS_CODE_PATTERN = /^\d{6}$/u;
export const SHARE_ACCESS_COOKIE = "cofound_lite_access";
export const SHARE_ACCESS_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function scrypt(code: string, salt: Buffer, cost = SCRYPT_COST) {
  return crypto.scryptSync(code, salt, SCRYPT_KEY_LENGTH, {
    N: cost,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
}

export function hashShareAccessCode(code: string) {
  if (!SHARE_ACCESS_CODE_PATTERN.test(code))
    throw new Error("访问码必须是 6 位数字");
  const salt = crypto.randomBytes(16);
  const digest = scrypt(code, salt);
  return [
    "scrypt",
    "v1",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

export function isShareAccessCodeHash(encodedHash: string) {
  const parts = encodedHash.split("$");
  const cost = Number(parts[2]);
  return (
    parts.length === 7 &&
    parts[0] === "scrypt" &&
    parts[1] === "v1" &&
    Number.isInteger(cost) &&
    cost >= 2 ** 14 &&
    cost <= 2 ** 18 &&
    Number(parts[3]) === SCRYPT_BLOCK_SIZE &&
    Number(parts[4]) === SCRYPT_PARALLELIZATION &&
    Boolean(parts[5] && parts[6])
  );
}

export function verifyShareAccessCode(code: string, encodedHash: string) {
  if (!SHARE_ACCESS_CODE_PATTERN.test(code)) return false;
  if (!isShareAccessCodeHash(encodedHash)) return false;
  const [
    algorithm,
    version,
    costValue,
    blockSize,
    parallelization,
    salt,
    hash,
  ] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    version !== "v1" ||
    Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelization) !== SCRYPT_PARALLELIZATION ||
    !salt ||
    !hash
  )
    return false;
  const cost = Number(costValue);
  if (!Number.isInteger(cost) || cost < 2 ** 14 || cost > 2 ** 18) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = scrypt(code, Buffer.from(salt, "base64url"), cost);
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

export function createShareAccessSession(
  shareToken: string,
  accessCodeHash: string,
  issuedAtSeconds = Math.floor(Date.now() / 1000)
) {
  const expiresAt = issuedAtSeconds + SHARE_ACCESS_SESSION_MAX_AGE_SECONDS;
  const payload = `${shareToken}.${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", accessCodeHash)
    .update(payload)
    .digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyShareAccessSession(
  shareToken: string,
  accessCodeHash: string,
  session: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!session) return false;
  const separator = session.indexOf(".");
  if (separator < 1) return false;
  const expiresAtValue = session.slice(0, separator);
  const suppliedSignature = session.slice(separator + 1);
  const expiresAt = Number(expiresAtValue);
  if (!Number.isInteger(expiresAt) || expiresAt <= nowSeconds) return false;
  const expectedSignature = crypto
    .createHmac("sha256", accessCodeHash)
    .update(`${shareToken}.${expiresAt}`)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}
