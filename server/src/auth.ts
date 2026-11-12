// Password hashing and username normalization for the coach backend.
//
// Uses Node's built-in `crypto.scrypt` (salt + derived key) so the Docker build
// never needs a native addon. Stored format is hex salt + hex hash; verification
// is constant-time via `timingSafeEqual`.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** scrypt parameters: N=16384 is the Node default cost, key length 64 bytes. */
const SCRYPT_KEY_LENGTH = 64;

/** Usernames are compared case-insensitively but displayed as entered. */
export function normalizeUsername(raw: string): string {
  return raw.trim();
}

/** The unique lookup key: trimmed + lowercased. */
export function usernameKey(raw: string): string {
  return normalizeUsername(raw).toLowerCase();
}

/**
 * Returns a Hungarian validation message, or null when the username is valid.
 * Allowed: letters (any script), digits, dot, hyphen and underscore, 3-32 chars.
 */
export function validateUsername(username: string): string | null {
  const value = normalizeUsername(username);
  if (value.length < 3 || value.length > 32) {
    return 'A felhasználónév 3-32 karakter hosszú legyen.';
  }
  if (!/^[\p{L}\p{N}._-]+$/u.test(value)) {
    return 'A felhasználónév csak betűket, számokat, pontot, kötőjelet és alávonást tartalmazhat.';
  }
  return null;
}

/** Returns a Hungarian validation message, or null when the password is valid. */
export function validatePassword(password: string): string | null {
  if (password.length < 6) {
    return 'A jelszó legalább 6 karakter legyen.';
  }
  if (password.length > 128) {
    return 'A jelszó legfeljebb 128 karakter lehet.';
  }
  return null;
}

export interface PasswordHash {
  salt: string;
  hash: string;
}

/** Derives a salted scrypt hash for a new password. */
export function hashPassword(password: string): PasswordHash {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return { salt, hash };
}

/** Constant-time password check against a stored salt + hash pair. */
export function verifyPassword(password: string, salt: string, hash: string): boolean {
  let stored: Buffer;
  try {
    stored = Buffer.from(hash, 'hex');
  } catch {
    return false;
  }
  if (stored.length !== SCRYPT_KEY_LENGTH) {
    return false;
  }
  const candidate = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return timingSafeEqual(candidate, stored);
}

/** Opaque bearer token (32 random bytes, hex-encoded). */
export function createAuthToken(): string {
  return randomBytes(32).toString('hex');
}

/** Constant-time comparison for two opaque tokens. */
export function tokensMatch(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  return timingSafeEqual(left, right);
}