import { supabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

// Translates selected book text into Bangla with Google Gemini (free tier, AI Studio key).
// The key stays here on the server; the reader calls this route instead of Gemini directly.

/** Longest text we translate at once: a long paragraph. Keeps each call fast and saves free quota. */
const MAX_CHARS = 2000;
/** "-latest" always points at Google's newest Flash-Lite: fast, and the highest free limits. */
const DEFAULT_MODEL = "gemini-flash-lite-latest";

const INSTRUCTION =
  "Translate the text into natural, fluent Bangla (Bengali), as a careful human translator would. " +
  "Keep names, numbers and technical terms accurate, and keep paragraph breaks. " +
  "Output only the translation, with no notes or explanations. If the text is already Bangla, return it unchanged.";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { code: number; message: string; status?: string };
};

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fail(503, "Translation isn't set up yet.");

  // Signed-in users only, so strangers can't spend the free quota.
  if (supabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return fail(401, "You're signed out. Please sign in again.");
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return fail(400, "Select some text to translate.");
  if (text.length > MAX_CHARS) return fail(413, "That's too long to translate at once. Select a shorter part.");

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTION }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error("Gemini request failed", error);
    return fail(502, "Couldn't reach the translator. Check your connection and try again.");
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    console.error("Gemini error", res.status, data.error?.message);
    if (res.status === 429) return fail(429, "Translation limit reached for now. Try again in a minute, or tomorrow.");
    return fail(502, "Translation isn't available right now.");
  }

  const translated = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!translated) return fail(422, "Couldn't translate this text.");
  return Response.json({ text: translated });
}
