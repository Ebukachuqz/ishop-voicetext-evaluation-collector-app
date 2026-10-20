import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionRecordKey, isComplete, providerRecordId } from "../lib/collection";
import { validateInput } from "../lib/transcription";
import type { CollectionRecord, Scenario, Turn } from "../lib/types";
const scenario = { dialogue_slots: [{ role: "user", slot_id: "F01_u1" }, { role: "assistant", content: "Fixed context" }, { role: "user", slot_id: "F01_u2" }] } as Scenario;
const turn = { editedTranscript: "My own words", verified: true, unresolved: false } as Turn;
test("collection IDs satisfy the provider route contract for every language", () => {
  for (const language of ["en", "pcm", "en_pcm"] as const) {
    const id = providerRecordId({ participant: "speaker-" + "a".repeat(32), scenarioId: "F40", language }, "F40_u2");
    assert.match(id, /^[A-Za-z0-9_-]{1,100}$/);
    const input = { audio: new Blob(["test"], { type: "audio/webm" }), filename: "test.webm", provider: "elevenlabs" as const, recordId: id, language, processingConsent: true, durationSeconds: 1 };
    assert.doesNotThrow(() => validateInput(input));
  }
});
test("verification requires all shopper turns, text, no unresolved flag and speaker attestation", () => {
  const record = { contextConfirmed: true, turns: { F01_u1: turn, F01_u2: turn } } as unknown as CollectionRecord;
  assert.equal(isComplete(record, scenario), true);
  assert.equal(isComplete({ ...record, contextConfirmed: false }, scenario), false);
  assert.equal(isComplete({ ...record, turns: { F01_u1: turn } }, scenario), false);
  assert.equal(isComplete({ ...record, turns: { ...record.turns, F01_u2: { ...turn, unresolved: true } } }, scenario), false);
  assert.equal(isComplete({ ...record, turns: { ...record.turns, F01_u2: { ...turn, editedTranscript: " " } } }, scenario), false);
  assert.equal(isComplete({ ...record, turns: { ...record.turns, F01_u2: { ...turn, verified: false } } }, scenario), false);
});

test("new catalogue versions cannot overwrite earlier contributor records", () => {
  assert.notEqual(collectionRecordKey("1.0", "speaker", "F01", "en"), collectionRecordKey("2.0", "speaker", "F01", "en"));
});
