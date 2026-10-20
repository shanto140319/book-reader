// Bangla translation of selected text, through our /api/translate route (Gemini on the server).

// Same text, same answer: translating it again this session costs no request or free quota.
const cache = new Map<string, string>();

/** Throws an Error with a message that can be shown to the reader. */
export async function translateToBangla(text: string): Promise<string> {
  const key = text.trim();
  const hit = cache.get(key);
  if (hit) return hit;

  let res: Response;
  try {
    res = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: key }),
    });
  } catch {
    throw new Error("You seem to be offline. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || !data.text) throw new Error(data.error ?? "Couldn't translate this text.");

  cache.set(key, data.text);
  return data.text;
}
