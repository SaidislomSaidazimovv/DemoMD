// Shared Gemini client + prompt templates for the Tasdiq AI features.
//
// Two features live here per AI_INTEGRATION_SPEC.md:
//   1. NARRATOR — takes a FLAGGED photo + list of failed fraud layers,
//      returns a 2-sentence plain-English summary for the bank officer.
//   2. CLASSIFIER — takes a photo + claimed milestone description,
//      returns { verdict: YES|NO|UNCLEAR, visible, reasoning } so we can
//      treat it as Layer 6 in the fraud pipeline.
//
// We use Gemini instead of Claude (spec's default) because the user chose
// the Google path. Same prompts, different SDK. Flash is vision-capable
// and fits the Google AI free tier — perfect for pilot scale.

import { GoogleGenerativeAI } from "@google/generative-ai";

const KEY = process.env.GOOGLE_CLOUD_GEMINI_API_KEY;
if (!KEY && process.env.NODE_ENV !== "test") {
  // Don't throw at import time — some routes might never call AI. The
  // functions below throw when they need the key but it's missing, so
  // callers can try/catch and degrade gracefully.
}

let cached: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  if (!KEY) {
    throw new Error(
      "GOOGLE_CLOUD_GEMINI_API_KEY is not set in the environment. " +
        "Add it to .env.local (local) or Vercel → Settings → Environment " +
        "Variables (production). Get a key at https://aistudio.google.com/apikey"
    );
  }
  if (!cached) cached = new GoogleGenerativeAI(KEY);
  return cached;
}

export const MODELS = {
  // Same model for both — Gemini 2.5 Flash is vision-capable, fast, and
  // sits in the free tier at 15 rpm. Upgrade to "gemini-2.5-pro" if you
  // want stronger narration at pilot scale.
  narrator: "gemini-2.5-flash",
  classifier: "gemini-2.5-flash",
} as const;

// ===========================================================
// NARRATOR
// ===========================================================
export interface NarrateInput {
  photoBase64: string;
  photoMimeType: string; // e.g. "image/jpeg"
  projectLabel: string;
  developer: string;
  milestone: string;
  failedLayers: Array<{ name: string; details: string; score: number }>;
}

/**
 * Call the narrator on a FLAGGED capture. Returns the narration text (2
 * sentences, ≤50 words). Throws on API failure; callers should catch and
 * degrade (the narration is advisory — the fraud pipeline's verdict
 * stands on its own).
 */
export async function narrateFlag(input: NarrateInput): Promise<string> {
  const model = client().getGenerativeModel({ model: MODELS.narrator });

  const failedLayerText =
    input.failedLayers.length === 0
      ? "(No specific layer failures — review holistically)"
      : input.failedLayers
          .map((l) => `- ${l.name}: ${l.details} (score: ${l.score})`)
          .join("\n");

  // Prompt text ported verbatim from AI_INTEGRATION_SPEC.md §"The API route".
  const prompt = `You are a construction fraud auditor reviewing evidence submitted to a bank.

CONTEXT:
- Project: ${input.projectLabel}
- Developer: ${input.developer}
- Claimed milestone: "${input.milestone}"
- Location: Tashkent, Uzbekistan

OUR AUTOMATED CHECKS FOUND THESE ISSUES:
${failedLayerText}

YOUR TASK:
Explain in exactly 2 sentences (maximum 50 words total) what looks suspicious and what a human reviewer should check. Write for a bank officer who is not a construction expert. Reference specific visual elements in the photo when possible. Be direct, not hedging.

Respond with ONLY the 2 sentences, no preamble, no labels.`;

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: input.photoMimeType,
              data: input.photoBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.4,
    },
  });

  const text = result.response.text().trim();
  if (!text) throw new Error("Gemini returned empty narration");
  return text;
}

// ===========================================================
// CLASSIFIER (Layer 6 in the fraud pipeline)
// ===========================================================
export interface ClassifierResult {
  verdict: "YES" | "NO" | "UNCLEAR";
  visible: string;
  reasoning: string;
  score: number;
  passed: boolean;
}

/**
 * Visually verify the photo matches the claimed milestone. Returns a
 * structured verdict. On any error (API failure, rate limit, key missing,
 * parse failure) returns `UNCLEAR` with `passed: true` — the AI is
 * advisory only, it must not block uploads when it's unreachable.
 */
export async function classifyProgress(
  photoBase64: string,
  photoMimeType: string,
  milestoneDescription: string
): Promise<ClassifierResult> {
  try {
    const model = client().getGenerativeModel({ model: MODELS.classifier });

    const prompt = `Does this photo show construction progress consistent with "${milestoneDescription}"?

Consider what stage of construction is visibly depicted and whether the claimed milestone would typically look like this.

Respond in EXACTLY this format (no extra text, no preamble):

VERDICT: YES | NO | UNCLEAR
VISIBLE: (one sentence, max 20 words, describing what you see)
REASONING: (one sentence, max 25 words, explaining the verdict)`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: photoMimeType,
                data: photoBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.2,
      },
    });

    const text = result.response.text();
    const verdict = (text.match(/VERDICT:\s*(YES|NO|UNCLEAR)/i)?.[1]?.toUpperCase() ??
      "UNCLEAR") as "YES" | "NO" | "UNCLEAR";
    const visible = text.match(/VISIBLE:\s*(.+)/i)?.[1]?.trim() ?? "";
    const reasoning = text.match(/REASONING:\s*(.+)/i)?.[1]?.trim() ?? "";

    const score = verdict === "YES" ? 1.0 : verdict === "UNCLEAR" ? 0.5 : 0.0;
    const passed = verdict === "YES";

    return { verdict, visible, reasoning, score, passed };
  } catch (err) {
    // Non-blocking: advisory layer must not fail uploads.
    // eslint-disable-next-line no-console
    console.warn("AI classifier unavailable:", (err as Error).message);
    return {
      verdict: "UNCLEAR",
      visible: "",
      reasoning: "AI classifier unavailable",
      score: 0.5,
      passed: true,
    };
  }
}
