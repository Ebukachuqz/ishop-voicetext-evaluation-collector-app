import { strToU8, unzipSync, zip } from "fflate";
import { getAllAudio, saveAudio, saveRecord } from "./storage";
import type { CollectionRecord } from "./types";
export async function exportCollection(records: CollectionRecord[], packetVersion: string, participant: string) {
  const ids = new Set(records.flatMap(record => Object.values(record.turns).flatMap(turn => turn.recordings.map(item => item.audioId))));
  const assets = ids.size ? (await getAllAudio()).filter(asset => ids.has(asset.id)) : [];
  if (assets.length !== ids.size) throw new Error("Some recordings are missing locally. Keep this browser open and report the missing audio before exporting.");
  if (assets.reduce((bytes, asset) => bytes + asset.blob.size, 0) > 250 * 1024 * 1024) throw new Error("This backup exceeds 250 MB. Use ‘Download this conversation’ to export smaller private backups.");
  const manifest = { schemaVersion: "collection-export-v1", exportedAt: new Date().toISOString(), packetVersion,
    privateExport: true, participant, recordCount: records.length, recordIds: records.map(record => record.id), audioCount: assets.length };
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "records.json": strToU8(JSON.stringify(records, null, 2)),
    "audio-index.json": strToU8(JSON.stringify(assets.map(asset => ({ id: asset.id, filename: asset.filename, createdAt: asset.createdAt, mime: asset.blob.type })), null, 2))
  };
  for (const asset of assets) files["audio/" + asset.filename] = new Uint8Array(await asset.blob.arrayBuffer());
  const bytes = await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 0 }, (error, data) => error ? reject(error) : resolve(data)));
  return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}
export async function importCollection(file: File, packetVersion: string, allowedScenarios: Set<string>) {
  if (file.size > 300 * 1024 * 1024) throw new Error("Backup exceeds the 300 MB import limit; use the original browser.");
  let unpackedBytes = 0; let unpackedFiles = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
    unpackedBytes += entry.originalSize; unpackedFiles += 1;
    if (entry.originalSize > 64 * 1024 * 1024 || unpackedBytes > 300 * 1024 * 1024 || unpackedFiles > 2500) throw new Error("Backup exceeds the safe unpacking limits.");
    return true;
  } });
  const decode = (name: string) => {
    if (!files[name]) throw new Error("Backup is missing " + name);
    return JSON.parse(new TextDecoder().decode(files[name]));
  };
  const manifest = decode("manifest.json");
  if (manifest.schemaVersion !== "collection-export-v1" || manifest.packetVersion !== packetVersion) throw new Error("Backup belongs to a different collection version.");
  const records = decode("records.json") as CollectionRecord[];
  if (!Array.isArray(records) || records.length > 1200) throw new Error("Invalid backup records.");
  for (const record of records) {
    if (!allowedScenarios.has(record.scenarioId) || !["en", "pcm", "en_pcm"].includes(record.language) || !/^[a-zA-Z0-9_-]{2,40}$/.test(record.participant)
      || record.id !== `${record.packetVersion}:${record.participant}|${record.scenarioId}_${record.language}` || !record.turns || record.packetVersion !== packetVersion || typeof record.contextConfirmed !== "boolean"
      || !record.consent || [record.consent.processing, record.consent.publicText, record.consent.publicAudio].some(value => typeof value !== "boolean")) throw new Error("Invalid record in backup.");
    for (const turn of Object.values(record.turns)) {
      if (typeof turn.editedTranscript !== "string" || typeof turn.originalTranscript !== "string" || typeof turn.verified !== "boolean" || typeof turn.unresolved !== "boolean"
        || !Array.isArray(turn.recordings) || !Array.isArray(turn.transcriptions) || !Array.isArray(turn.edits) || !["recording", "manual"].includes(turn.source)) throw new Error("Invalid turn in backup.");
    }
  }
  const index = decode("audio-index.json") as { id: string; filename: string; createdAt: string; mime: string }[];
  if (!Array.isArray(index)) throw new Error("Invalid audio index.");
  for (const item of index) {
    if (!/^[\w.-]+$/.test(item.filename) || !files["audio/" + item.filename]) throw new Error("Backup audio is missing or invalid.");
  }
  for (const item of index) await saveAudio({ id: item.id, filename: item.filename, createdAt: item.createdAt, blob: new Blob([new Uint8Array(files["audio/" + item.filename])], { type: item.mime }) });
  for (const record of records) await saveRecord(record);
  return records;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
