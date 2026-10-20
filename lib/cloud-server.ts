import { createHash } from "node:crypto";
import { authorizeRequest, CollectionError } from "./transcription";
import { validateCloudRecord } from "./cloud-validation";
import type { CollectionRecord } from "./types";
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type StorePut = (path: string, content: Buffer, options: {access:"private";token:string;addRandomSuffix:false;allowOverwrite:true;contentType:string}) => Promise<unknown>;
export async function saveCloudRequest(request: Request, env: Record<string,string|undefined>, put: StorePut) {
  try {
    authorizeRequest(request, env);
    if (!env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "storage_not_configured" }, { status: 503 });
    const device = request.headers.get("x-device-secret") ?? "";
    if (!/^[a-f0-9-]{72}$/.test(device)) return Response.json({error:"invalid_device"},{status:400});
    // Read the stream with a hard cap; Content-Length alone is not trustworthy.
    const reader = request.body?.getReader(); if (!reader) throw new Error("empty");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 4 * 1024 * 1024) { await reader.cancel(); return Response.json({error:"too_large"},{status:413}); } chunks.push(part.value); }
    const bytes = Buffer.concat(chunks);
    const form = await new Response(bytes, {headers:{"content-type":request.headers.get("content-type") ?? ""}}).formData();
    const raw = form.get("record");
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error("record");
    const record = JSON.parse(raw) as CollectionRecord;
    validateCloudRecord(record);
    const prefix = `collection/${digest(device)}/`;
    const kind = form.get("kind");
    let path: string; let content: Buffer; let contentType: string;
    if (kind === "audio") {
      if (record.consent.privateCloud !== true) return Response.json({error:"consent_required"},{status:403});
      const audio = form.get("audio"); const id = form.get("audioId");
      if (!(audio instanceof File) || audio.size > 3 * 1024 * 1024 || !audio.size || typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)
        || !Object.values(record.turns).some(turn => turn.recordings.some(item => item.audioId === id))) throw new Error("audio");
      const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
      content = Buffer.from(await audio.arrayBuffer()); contentType = audio.type || "application/octet-stream";
      path = `${prefix}audio/${id}.${ext}`;
    } else if (kind === "record") {
      // A withdrawn cloud choice updates consent without sending the previous words again.
      const value = record.consent.privateCloud === true ? record : {id:record.id, participant:record.participant, packetVersion:record.packetVersion, consent:record.consent, updatedAt:record.updatedAt, withdrawn:true};
      content = Buffer.from(JSON.stringify(value)); contentType = "application/json";
      path = `${prefix}records/${digest(record.id)}/${record.updatedAt.replaceAll(":","-")}-${digest(content)}.json`;
    } else throw new Error("kind");
    await put(path, content, {access:"private", token:env.BLOB_READ_WRITE_TOKEN, addRandomSuffix:false, allowOverwrite:true, contentType});
    return Response.json({saved:true}, {headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    if (error instanceof CollectionError) return Response.json({error:error.code},{status:error.status});
    return Response.json({error:"save_failed"},{status:400});
  }
}
