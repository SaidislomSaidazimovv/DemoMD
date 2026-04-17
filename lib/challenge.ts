// Challenge code helpers shared by the issue + verify endpoints and the
// admin "new project" form. Keeping the alphabet and length in one place
// means the server-issued codes match what the UI renders.

import crypto from "node:crypto";

// 32-char Crockford-ish alphabet — excludes 0/O/1/I/L to stay unambiguous
// on paper. Matches the client-side generator in the admin page.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CHALLENGE_LENGTH = 4;

// Cryptographically secure code — server path only. The admin form's
// `generateChallenge()` uses Math.random because it runs in the browser
// before the workflow exists; once issued server-side, we upgrade.
export function generateChallengeCode(): string {
  let out = "";
  for (let i = 0; i < CHALLENGE_LENGTH; i++) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
}

// Window during which a submitted code is considered fresh. Must match
// CHALLENGE_VALID_WINDOW_MS in lib/fraud.ts — both consult this.
export const CHALLENGE_VALID_WINDOW_MS = 30 * 1000;

export interface ChallengeVerification {
  match: boolean;
  expired: boolean;
  age_seconds: number;
  passed: boolean;
}

export function verifyChallengeCode(args: {
  submitted: string;
  expected: string;
  issuedAt: Date;
  capturedAt: Date;
}): ChallengeVerification {
  const match =
    args.submitted.trim().toUpperCase() === args.expected.trim().toUpperCase();
  const age_seconds = Math.max(
    0,
    (args.capturedAt.getTime() - args.issuedAt.getTime()) / 1000
  );
  const expired = age_seconds * 1000 > CHALLENGE_VALID_WINDOW_MS;
  return { match, expired, age_seconds, passed: match && !expired };
}
