import { createHash, timingSafeEqual } from "node:crypto";

export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 120;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 125_000;

export type Provider = "elevenlabs" | "sahara";
export type LanguageVariety = "en" | "pcm" | "en_pcm";
export type Environment = Record<string, string | undefined>;
export type TranscriptionInput = {
  audio: Blob;
  filename: string;
  provider: Provider;
  language: LanguageVariety;
  recordId: string;
  durationSeconds: number;
  processingConsent: boolean;
};

export class CollectionError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public providerFileId?: string,
  ) {
    super(message);
    this.name = "CollectionError";
  }
}

export function authorizeRequest(request: Request, env: Environment): void {
  const expected = env.COLLECTION_ACCESS_TOKEN;
  if (!expected || expected.length < 24) {
    throw new CollectionError("collection_not_configured", "The collection owner must configure its access token.", 503);
  }
  const supplied = request.headers.get("x-collection-token") ?? "";
  const digest = (text: string) => createHash("sha256").update(text).digest();
  if (!timingSafeEqual(digest(expected), digest(supplied))) {
    throw new CollectionError("access_denied", "Enter the collection access code supplied by the researcher.", 401);
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new CollectionError("origin_denied", "Open the collection page and submit from that page.", 403);
  }
}

export function validateInput(input: TranscriptionInput): void {
  if (!input.processingConsent) throw new CollectionError("consent_required", "Consent to processing by the selected provider is required.");
  if (!["elevenlabs", "sahara"].includes(input.provider)) throw new CollectionError("invalid_provider", "Choose ElevenLabs or Sahara.");
  if (!["en", "pcm", "en_pcm"].includes(input.language)) throw new CollectionError("invalid_language", "Choose English, Nigerian Pidgin or code-switched speech.");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.recordId)) throw new CollectionError("invalid_record_id", "The recording identifier is invalid.");
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > MAX_DURATION_SECONDS) {
    throw new CollectionError("invalid_duration", "Record or upload a clip between 0 and 120 seconds. Split longer conversations into shopper turns.");
  }
  if (input.audio.size === 0 || input.audio.size > MAX_AUDIO_BYTES) throw new CollectionError("invalid_audio_size", "Audio must be nonempty and no larger than 3 MiB.", 413);
  const allowed = /\.(webm|wav|mp3|m4a|mp4|ogg|flac)$/i.test(input.filename);
  if (!allowed) throw new CollectionError("invalid_audio_type", "Use WebM, WAV, MP3, M4A, MP4, OGG or FLAC audio.");
}

export function providerConfiguration(provider: Provider, language: LanguageVariety, env: Environment): {
  endpoint: string; headers: Record<string, string>; fields: Record<string, string>;
  fileField: string; requestedModel: string | null; providerLanguage: string;
} {
  if (provider === "elevenlabs") {
    if (!env.ELEVENLABS_API_KEY) throw new CollectionError("provider_not_configured", "ElevenLabs is not configured. Choose Sahara or ask the researcher.", 503);
    const fields: Record<string, string> = {
      model_id: "scribe_v2", no_verbatim: "false", diarize: "false", tag_audio_events: "false",
      timestamps_granularity: "word", file_format: "other",
    };
    if (language === "en") fields.language_code = "en";
    return { endpoint: "https://api.elevenlabs.io/v1/speech-to-text", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, fields, fileField: "file", requestedModel: "scribe_v2", providerLanguage: language === "en" ? "en" : "auto" };
  }
  const key = env.SAHARA_API_TOKEN || env.SAHARA_API_KEY || env.INTRON_API_KEY;
  if (!key) throw new CollectionError("provider_not_configured", "Sahara is not configured. Choose ElevenLabs or ask the researcher.", 503);
  return {
    endpoint: "https://infer.voice.intron.io/file/v1/upload/sync",
    headers: { Authorization: `Bearer ${key}` },
    fields: { use_language_asr_input: language === "en" ? "en" : "pcm", use_disable_llm_corrections: "TRUE", use_category: "file_category_general", use_diarization: "FALSE", get_answer: "FALSE", get_summary: "FALSE" } as Record<string, string>,
    fileField: "audio_file_blob", requestedModel: null, providerLanguage: language === "en" ? "en" : "pcm",
  };
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : undefined;
}

export function extractTranscript(provider: Provider, payload: unknown): string {
  const body = object(payload);
  const text = provider === "sahara" ? object(body.data).audio_transcript : body.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new CollectionError("empty_transcript", "No speech transcript was returned. Keep the recording, review it, and choose whether to transcribe again or type its exact words.", 422);
  }
  return text;
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new CollectionError("invalid_provider_response", "The provider returned an unreadable response. No automatic retry was made.", 502);
  const pieces: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new CollectionError("provider_response_too_large", "The provider response exceeded the collection limit. No automatic retry was made.", 502);
    }
    pieces.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const piece of pieces) { bytes.set(piece, position); position += piece.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new CollectionError("invalid_provider_response", "The provider returned an unreadable response. No automatic retry was made.", 502); }
}

export async function transcribeAudio(input: TranscriptionInput, env: Environment, fetcher: typeof fetch = fetch) {
  validateInput(input);
  const config = providerConfiguration(input.provider, input.language, env);
  const bytes = Buffer.from(await input.audio.arrayBuffer());
  const extension = input.filename.split(".").pop()!.toLowerCase();
  const uploadName = `${input.recordId}.${extension}`;
  const fields = { ...config.fields };
  if (input.provider === "sahara") fields.audio_file_name = uploadName;
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set(config.fileField, input.audio, uploadName);
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(config.endpoint, { method: "POST", headers: config.headers, body: form, signal: controller.signal, redirect: "error", cache: "no-store" });
    let payload: unknown;
    try { payload = await boundedJson(response); }
    catch (error) {
      if (response.ok) throw error;
      payload = {};
    }
    const data = object(object(payload).data);
    const providerFileId = safeIdentifier(data.file_id);
    if (!response.ok) {
      if (input.provider === "sahara" && response.status === 503 && providerFileId) {
        throw new CollectionError("provider_pending", "Sahara accepted the file but transcription is still pending. Save the file ID; check its status before submitting again, which may incur another charge.", 503, providerFileId);
      }
      const code = response.status === 429 ? "provider_rate_limited" : "provider_error";
      throw new CollectionError(code, response.status === 429 ? "The provider is rate limited. No automatic retry was made; keep your recording and try later." : "The provider could not complete transcription. Keep the recording. No automatic retry was made.", response.status === 429 ? 429 : 502);
    }
    const transcript = extractTranscript(input.provider, payload);
    const body = object(payload);
    return {
      transcript,
      rawResponse: payload,
      metadata: {
        provider: input.provider, requestedModel: config.requestedModel,
        returnedModel: safeIdentifier(body.model_id ?? body.model ?? data.model_id ?? data.model) ?? null,
        providerFileId: providerFileId ?? null,
        requestId: safeIdentifier(body.request_id ?? response.headers.get("request-id") ?? response.headers.get("x-request-id")) ?? null,
        audioSha256: createHash("sha256").update(bytes).digest("hex"),
        audioBytes: bytes.length, recordId: input.recordId, languageVariety: input.language,
        providerLanguage: config.providerLanguage, requestFields: fields, startedAt,
        elapsedMs: Date.now() - start, durationSeconds: input.durationSeconds,
        transcriptionPurpose: "collection_assistance_not_asr_evaluation", humanVerified: false,
      },
    };
  } catch (error) {
    if (error instanceof CollectionError) throw error;
    throw new CollectionError("provider_connection_uncertain", "The connection ended before a result was confirmed. The provider may have processed this file. Keep the recording and check the provider dashboard before retrying.", 504);
  } finally { clearTimeout(timeout); }
}
