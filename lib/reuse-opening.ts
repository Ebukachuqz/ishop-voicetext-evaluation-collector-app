import { collectionRecordKey } from "./collection";
import { contextForLanguage } from "./scenario-context";
import type { CollectionRecord, Consent, Language, Scenario, ScenarioPacket } from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}
export function openingSignature(scenario: Scenario, language: Language) {
  const first = scenario.dialogue_slots[0];
  if (first?.role !== "user") return null;
  const next = scenario.dialogue_slots.findIndex((slot,i) => i > 0 && slot.role === "user");
  if (next < 0) return null;
  return canonical({setting:scenario.setting[language], brief:first.brief[language], state:scenario.initial_state, visibleContext:contextForLanguage(scenario.id,language),
    assistantContext:scenario.dialogue_slots.slice(1,next)});
}

export function prefillOpening(packet: ScenarioPacket, scenario: Scenario, language: Language, participant: string,
  records: Record<string, CollectionRecord>, consent: Consent, now: string): CollectionRecord | undefined {
  const targetId = collectionRecordKey(packet.schema_version,participant,scenario.id,language);
  const target = records[targetId];
  const slot = scenario.dialogue_slots[0];
  // Preserve even an unfinished destination turn. Never replace a contributor's work.
  if (slot?.role !== "user" || target?.turns[slot.slot_id]) return;
  const signature = openingSignature(scenario,language);
  if (!signature) return;
  for (const other of packet.scenarios) {
    if (other.id === scenario.id || openingSignature(other,language) !== signature) continue;
    const sourceId = collectionRecordKey(packet.schema_version,participant,other.id,language);
    const source = records[sourceId]; const sourceSlot = other.dialogue_slots[0];
    if (!source || sourceSlot.role !== "user" || source.participant !== participant || source.language !== language || source.packetVersion !== packet.schema_version) continue;
    const turn = source.turns[sourceSlot.slot_id];
    if (!turn?.verified || turn.unresolved || !turn.editedTranscript.trim() || turn.reusedFrom) continue;
    const copy = structuredClone(turn);
    copy.slotId = slot.slot_id; copy.verified = false; copy.unresolved = false;
    copy.reusedFrom = {recordId:sourceId,scenarioId:other.id,slotId:sourceSlot.slot_id,sourceUpdatedAt:source.updatedAt,reusedAt:now,contextSignature:signature};
    copy.edits.push({at:now,previous:"",next:copy.editedTranscript,kind:"reused-opening"});
    return {...(target ?? {id:targetId,scenarioId:scenario.id,language,participant,packetVersion:packet.schema_version,consent:{...consent},turns:{},updatedAt:now}),
      contextConfirmed:false,turns:{...target?.turns,[slot.slot_id]:copy}};
  }
}
