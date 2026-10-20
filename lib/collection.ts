import type { CollectionRecord, Scenario } from "./types";
export function providerRecordId(record: Pick<CollectionRecord, "participant" | "scenarioId" | "language">, slotId: string) {
  const value = `${record.participant}_${record.scenarioId}_${record.language}_${slotId}`;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error("Invalid pseudonymous recording ID.");
  return value;
}
export function isComplete(record: CollectionRecord | undefined, scenario: Scenario) {
  const slots = scenario.dialogue_slots.filter(slot => slot.role === "user");
  return !!record?.contextConfirmed && slots.length > 0 && slots.every(slot => {
    if (slot.role !== "user") return true;
    const turn = record.turns[slot.slot_id];
    return !!turn?.verified && !!turn.editedTranscript.trim() && !turn.unresolved;
  });
}

export function collectionRecordKey(version: string, participant: string, scenario: string, language: string) {
  return `${version}:${participant}|${scenario}_${language}`;
}
