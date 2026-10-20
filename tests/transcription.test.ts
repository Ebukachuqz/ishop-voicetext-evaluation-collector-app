import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeRequest, CollectionError, MAX_AUDIO_BYTES, providerConfiguration, transcribeAudio, validateInput, type TranscriptionInput } from "../lib/transcription";
import { POST } from "../app/api/transcribe/route";

const env = { COLLECTION_ACCESS_TOKEN: "test-access-code-with-32-characters", ELEVENLABS_API_KEY: "test-eleven-secret", SAHARA_API_TOKEN: "test-sahara-secret" };
const clip = (changes: Partial<TranscriptionInput> = {}): TranscriptionInput => ({ audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), filename: "clip.webm", provider: "elevenlabs", language: "en_pcm", recordId: "F01A_en_pcm_u1", durationSeconds: 10, processingConsent: true, ...changes });
const fails = (code: string) => (error: unknown) => error instanceof CollectionError && error.code === code;

test("collection access is separate from provider credentials and requires same origin", () => {
  const request = (origin = "https://collection.example", token = env.COLLECTION_ACCESS_TOKEN) => new Request("https://collection.example/api/transcribe", { headers: { origin, "x-collection-token": token } });
  authorizeRequest(request(), env);
  assert.throws(() => authorizeRequest(request("https://elsewhere.example"), env), fails("origin_denied"));
  assert.throws(() => authorizeRequest(request(undefined, "wrong"), env), fails("access_denied"));
  assert.throws(() => authorizeRequest(request(), {}), fails("collection_not_configured"));
});

test("consent, duration, file size and extension are validated before billing", () => {
  validateInput(clip());
  assert.throws(() => validateInput(clip({ processingConsent: false })), fails("consent_required"));
  assert.throws(() => validateInput(clip({ durationSeconds: 121 })), fails("invalid_duration"));
  assert.throws(() => validateInput(clip({ audio: new Blob([new Uint8Array(MAX_AUDIO_BYTES + 1)]) })), fails("invalid_audio_size"));
  assert.throws(() => validateInput(clip({ filename: "script.html" })), fails("invalid_audio_type"));
});

test("providers preserve disfluency and language varieties", () => {
  const eleven = providerConfiguration("elevenlabs", "en_pcm", env);
  assert.equal(eleven.fields.no_verbatim, "false");
  assert.equal(eleven.fields.language_code, undefined);
  assert.equal(eleven.fields.transcript_edit, undefined);
  const sahara = providerConfiguration("sahara", "pcm", env);
  assert.equal(sahara.fields.use_language_asr_input, "pcm");
  assert.equal(sahara.fields.use_disable_llm_corrections, "TRUE");
  assert.equal(sahara.requestedModel, null);
  assert.equal(providerConfiguration("sahara", "en_pcm", env).providerLanguage, "pcm");
});

test("ElevenLabs preserves exact machine text and raw response with unverified metadata", async () => {
  const raw = { text: "Um, one—one black shirt. ", language_code: "en", words: [] };
  let calls = 0;
  const fetcher = (async (url, init) => {
    calls++;
    assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal((init!.body as FormData).get("no_verbatim"), "false");
    assert.equal(init!.redirect, "error");
    return Response.json(raw, { headers: { "request-id": "req_123" } });
  }) as typeof fetch;
  const result = await transcribeAudio(clip(), env, fetcher);
  assert.equal(result.transcript, raw.text);
  assert.deepEqual(result.rawResponse, raw);
  assert.equal(result.metadata.humanVerified, false);
  assert.equal(result.metadata.requestId, "req_123");
  assert.equal(result.metadata.returnedModel, null);
  assert.equal(result.metadata.audioSha256.length, 64);
  assert.equal(JSON.stringify(result).includes("test-eleven-secret"), false);
  assert.equal(calls, 1);
});

test("Sahara extracts only audio_transcript and records actual returned model", async () => {
  const result = await transcribeAudio(clip({ provider: "sahara", language: "pcm" }), env, (async (_url, init) => {
    const form = init!.body as FormData;
    assert.equal(form.get("use_disable_llm_corrections"), "TRUE");
    assert.equal(form.get("use_language_asr_input"), "pcm");
    assert.ok(form.get("audio_file_blob") instanceof Blob);
    return Response.json({ data: { audio_transcript: "Abeg, no, no add am.", file_id: "file_1", model_id: "returned-version" } });
  }) as typeof fetch);
  assert.equal(result.transcript, "Abeg, no, no add am.");
  assert.equal(result.metadata.returnedModel, "returned-version");
  assert.equal(result.metadata.providerFileId, "file_1");
});

test("provider failures do not echo sensitive payloads and never auto retry", async () => {
  let calls = 0;
  await assert.rejects(() => transcribeAudio(clip(), env, (async () => { calls++; return Response.json({ detail: "a-secret-provider-payload" }, { status: 429 }); }) as typeof fetch), fails("provider_rate_limited"));
  assert.equal(calls, 1);
  await assert.rejects(() => transcribeAudio(clip(), env, (async () => { throw new Error("private network details"); }) as typeof fetch), (error: unknown) => fails("provider_connection_uncertain")(error) && !(error as Error).message.includes("private network"));
});

test("Sahara pending file ID is retained without raw error response", async () => {
  await assert.rejects(() => transcribeAudio(clip({ provider: "sahara" }), env, (async () => Response.json({ data: { file_id: "file_pending" }, private: "secret" }, { status: 503 })) as typeof fetch), (error: unknown) => error instanceof CollectionError && error.code === "provider_pending" && error.providerFileId === "file_pending" && !error.message.includes("secret"));
});

test("blank or malformed responses are not treated as successful transcription", async () => {
  await assert.rejects(() => transcribeAudio(clip(), env, (async () => Response.json({ text: " " })) as typeof fetch), fails("empty_transcript"));
  await assert.rejects(() => transcribeAudio(clip(), env, (async () => new Response("not json")) as typeof fetch), fails("invalid_provider_response"));
});

test("route rejects unauthorised and unconsented requests before the mocked provider", async () => {
  const previousToken = process.env.COLLECTION_ACCESS_TOKEN;
  const previousKey = process.env.ELEVENLABS_API_KEY;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let rateLimited = false;
  process.env.COLLECTION_ACCESS_TOKEN = env.COLLECTION_ACCESS_TOKEN;
  process.env.ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;
  globalThis.fetch = (async () => {
    calls++;
    return rateLimited ? Response.json({ secret: "private-provider-error" }, { status: 429 }) : Response.json({ text: "no, no add am" });
  }) as typeof fetch;
  const request = (consent: string, token = env.COLLECTION_ACCESS_TOKEN) => {
    const form = new FormData();
    form.set("audio", new Blob(["fixture"], { type: "audio/webm" }), "clip.webm");
    for (const [key, value] of Object.entries({ recordId: "route_test_en_u1", provider: "elevenlabs", language: "en", durationSeconds: "10", processingConsent: consent })) form.set(key, value);
    return new Request("https://collection.example/api/transcribe", { method: "POST", headers: { origin: "https://collection.example", "x-collection-token": token }, body: form });
  };
  try {
    assert.equal((await POST(request("true", "wrong"))).status, 401);
    assert.equal((await POST(request("true", ""))).status, 401);
    assert.equal((await POST(request("false"))).status, 400);
    const oversized = request("true");
    oversized.headers.set("content-length", String(MAX_AUDIO_BYTES + 100000));
    assert.equal((await POST(oversized)).status, 413);
    assert.equal((await POST(new Request("https://collection.example/api/transcribe", { method: "POST", headers: { origin: "https://collection.example", "x-collection-token": env.COLLECTION_ACCESS_TOKEN, "content-type": "text/plain" }, body: "not multipart" }))).status, 400);
    assert.equal(calls, 0);
    const result = await POST(request("true"));
    assert.equal(result.status, 200);
    const payload = await result.json();
    assert.equal(payload.transcript, "no, no add am");
    assert.equal(payload.metadata.humanVerified, false);
    assert.equal(calls, 1);
    rateLimited = true;
    const denied = await POST(request("true"));
    assert.equal(denied.status, 429);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.error, "provider_rate_limited");
    assert.equal(JSON.stringify(deniedBody).includes("private-provider-error"), false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.COLLECTION_ACCESS_TOKEN; else process.env.COLLECTION_ACCESS_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = previousKey;
  }
});
