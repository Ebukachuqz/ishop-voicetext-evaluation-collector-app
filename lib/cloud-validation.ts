import type { CollectionRecord } from "./types";
export function validateCloudRecord(record: CollectionRecord): void {
  if (!record || !/^[a-zA-Z0-9_-]{2,40}$/.test(record.participant) || !/^F(0[1-9]|[1-3][0-9]|40)$/.test(record.scenarioId)
    || !["en","pcm","en_pcm"].includes(record.language) || !/^[a-zA-Z0-9._-]{1,60}$/.test(record.packetVersion)
    || record.id !== `${record.packetVersion}:${record.participant}|${record.scenarioId}_${record.language}`
    || !record.consent || !record.turns || Array.isArray(record.turns) || typeof record.contextConfirmed !== "boolean"
    || [record.consent.processing,record.consent.publicText,record.consent.publicAudio].some(v=>typeof v !== "boolean")
    || typeof record.consent.privateCloud !== "boolean" || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("invalid record");
  for (const [slot,turn] of Object.entries(record.turns)) {
    if (![`${record.scenarioId}_u1`,`${record.scenarioId}_u2`].includes(slot) || turn.slotId !== slot
      || typeof turn.editedTranscript !== "string" || typeof turn.originalTranscript !== "string"
      || typeof turn.verified !== "boolean" || typeof turn.unresolved !== "boolean"
      || !Array.isArray(turn.recordings) || !Array.isArray(turn.transcriptions) || !Array.isArray(turn.edits)) throw new Error("invalid turn");
  }
}
