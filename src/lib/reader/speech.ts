// Reads selected English text aloud with the device's own voices (Web Speech API).
// Free, no key, works offline. One reading at a time, for the whole app.

export const SPEECH_RATES = [0.75, 1, 1.25] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

export type SpeechState = { speaking: boolean };

const RATE_KEY = "pata:speech-rate";
/**
 * Desktop Chrome silently stops a single utterance after ~15 seconds, so long text is read
 * as a queue of short pieces, split at sentence ends (or commas/spaces in very long sentences).
 */
const MAX_PIECE = 220;

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Chrome fills the voice list in the background; asking early means the nicer voice is
// ready by the first tap on the speaker.
if (speechSupported()) window.speechSynthesis.getVoices();

let state: SpeechState = { speaking: false };
const listeners = new Set<() => void>();
function setState(next: SpeechState) {
  state = next;
  listeners.forEach((l) => l());
}

/** For useSyncExternalStore. */
export const speech = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => state,
  getServerSnapshot: () => state,
};

// Where the reading is, so changing speed carries on from the current word, not the start.
let current: { text: string; offset: number } | null = null;
let run = 0; // bumps on every stop/start, so callbacks from an older reading are ignored

/**
 * Start reading `text` (stops anything already playing). Call it straight from a tap/click:
 * iPhone only allows speech that starts in direct response to the user.
 */
export function speak(text: string, rate: SpeechRate = loadRate(), from = 0) {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  const busy = synth.speaking || synth.pending;
  // Only cancel real playback: in Chrome a cancel() right before speak() can clip the next start.
  if (busy) synth.cancel();
  const id = ++run;
  current = { text, offset: from };
  setState({ speaking: true });

  const queue = () => {
    if (id !== run) return; // stopped while the audio was waking up
    const voice = englishVoice();
    const pieces = splitText(text.slice(from));
    if (!pieces.length) return finish();
    pieces.forEach((piece, i) => {
      const u = new SpeechSynthesisUtterance(piece.text);
      u.lang = voice?.lang ?? "en-US";
      if (voice) u.voice = voice;
      u.rate = rate;
      const start = from + piece.start;
      u.onboundary = (e) => {
        if (id === run && current) current.offset = start + e.charIndex;
      };
      if (i === pieces.length - 1) {
        u.onend = () => id === run && finish();
      }
      u.onerror = (e) => {
        // "interrupted"/"canceled" is us calling cancel(); anything else ends the reading.
        if (id === run && e.error !== "interrupted" && e.error !== "canceled") finish();
      };
      synth.speak(u);
    });
  };

  if (!busy && wakeAudioOutput()) {
    // An empty utterance inside the tap keeps iPhone's "started by the user" permission
    // for the real speech, which starts once the audio output is awake.
    synth.speak(new SpeechSynthesisUtterance(""));
    setTimeout(queue, WAKE_MS);
  } else {
    queue();
  }
}

export function stopSpeaking() {
  run++;
  current = null;
  if (speechSupported()) window.speechSynthesis.cancel();
  if (state.speaking) {
    lastSoundAt = Date.now();
    setState({ speaking: false });
  }
}

// ─── Waking the audio output ──────────────────────────────────────────────────
// Speakers, sound drivers and especially Bluetooth headphones go to sleep after a few seconds
// of silence and take ~0.3–0.8 s to wake, swallowing whatever plays meanwhile: the first word
// or two (Google Translate's speaker has the same problem). So after a quiet spell we first play
// an inaudible sound to wake the output, and start the voice once it's awake.

/** How long we give the output to wake up. */
const WAKE_MS = 450;
/** After this much silence the output may be asleep again. */
const QUIET_MS = 3000;
let lastSoundAt = 0;
let audio: AudioContext | null = null;

/** Starts the wake-up sound if the output may be asleep. Returns false when no wait is needed. */
function wakeAudioOutput() {
  if (Date.now() - lastSoundAt < QUIET_MS) return false;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const seconds = (WAKE_MS + 400) / 1000;
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
    // Not pure zeros: some systems skip all-silent output, which wouldn't wake anything.
    // ±0.0001 is about −80 dB, far below hearing.
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = i % 2 ? 0.0001 : -0.0001;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.start();
    return true;
  } catch {
    return false; // no Web Audio: just speak right away
  }
}

/** Saves the speed and, if reading, continues from the current word at the new speed. */
export function changeRate(rate: SpeechRate) {
  saveRate(rate);
  if (state.speaking && current) speak(current.text, rate, backToWordStart(current.text, current.offset));
}

function finish() {
  current = null;
  lastSoundAt = Date.now();
  setState({ speaking: false });
}

export function loadRate(): SpeechRate {
  try {
    const saved = Number(localStorage.getItem(RATE_KEY));
    return (SPEECH_RATES as readonly number[]).includes(saved) ? (saved as SpeechRate) : 1;
  } catch {
    return 1;
  }
}

function saveRate(rate: SpeechRate) {
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    // private mode: the speed just isn't remembered
  }
}

/**
 * The best English voice on this device: one marked natural/enhanced/premium if there is one
 * (they sound far less robotic), else the device's default English voice, else any English one.
 * Chrome loads voices late, so this can be undefined at first; then lang="en-US" picks one.
 */
function englishVoice() {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!voices.length) return undefined;
  const nice = /natural|neural|enhanced|premium|google|samantha|siri/i;
  const local = (v: SpeechSynthesisVoice) => (navigator.language.startsWith("en") ? v.lang === navigator.language : true);
  return (
    voices.find((v) => nice.test(v.name) && local(v)) ??
    voices.find((v) => nice.test(v.name)) ??
    voices.find((v) => v.default) ??
    voices.find((v) => v.lang === "en-US") ??
    voices[0]
  );
}

/** Pieces of at most MAX_PIECE characters, with where each starts in `text`. */
function splitText(text: string) {
  const pieces: { text: string; start: number }[] = [];
  const re = /[^.!?;:]+[.!?;:]*\s*/g; // sentences, keeping their punctuation
  let m: RegExpExecArray | null;
  let buf = "";
  let bufStart = 0;
  const push = () => {
    if (buf.trim()) pieces.push({ text: buf, start: bufStart });
    buf = "";
  };
  while ((m = re.exec(text))) {
    let sentence = m[0];
    let start = m.index;
    // A sentence that's too long on its own: cut at the last comma or space before the limit.
    while (sentence.length > MAX_PIECE) {
      const cut = Math.max(sentence.lastIndexOf(", ", MAX_PIECE), sentence.lastIndexOf(" ", MAX_PIECE)) + 1 || MAX_PIECE;
      push();
      pieces.push({ text: sentence.slice(0, cut), start });
      sentence = sentence.slice(cut);
      start += cut;
    }
    if (buf.length + sentence.length > MAX_PIECE) push();
    if (!buf) bufStart = start;
    buf += sentence;
  }
  push();
  return pieces;
}

function backToWordStart(text: string, i: number) {
  while (i > 0 && !/\s/.test(text[i - 1])) i--;
  return i;
}
