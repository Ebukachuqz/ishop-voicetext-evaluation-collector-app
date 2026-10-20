import { authorizeRequest, CollectionError, MAX_AUDIO_BYTES, transcribeAudio, type LanguageVariety, type Provider } from "../../../lib/transcription";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";
const active = new Set<string>();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function POST(request: Request) {
  let activeId: string | undefined;
  try {
    authorizeRequest(request, process.env);
    const size = Number(request.headers.get("content-length"));
    if (Number.isFinite(size) && size > MAX_AUDIO_BYTES + 65536) throw new CollectionError("invalid_audio_size", "Audio must be no larger than 3 MiB.", 413);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new CollectionError("invalid_request", "Submit an audio recording from the collection page.");
    const form = await request.formData();
    const audio = form.get("audio");
    if (!audio || typeof audio === "string" || typeof audio.arrayBuffer !== "function") throw new CollectionError("audio_required", "Select or record audio first.");
    const recordId = String(form.get("recordId") ?? "");
    if (active.has(recordId) || active.size >= 2) throw new CollectionError("collection_busy", "A transcription is already running. Wait for it to finish before submitting another.", 429);
    active.add(recordId);
    activeId = recordId;
    const result = await transcribeAudio({
      audio, filename: audio.name, recordId,
      provider: String(form.get("provider")) as Provider,
      language: String(form.get("language")) as LanguageVariety,
      processingConsent: form.get("processingConsent") === "true",
      durationSeconds: Number(form.get("durationSeconds")),
    }, process.env);
    return json(result);
  } catch (error) {
    if (error instanceof CollectionError) return json({ error: error.code, message: error.message, ...(error.providerFileId ? { providerFileId: error.providerFileId } : {}) }, error.status);
    return json({ error: "invalid_request", message: "The recording request could not be read. Keep your recording and try again from this page." }, 400);
  } finally { if (activeId !== undefined) active.delete(activeId); }
}
