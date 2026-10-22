import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionRecordKey, isComplete, providerRecordId } from "../lib/collection";
import { validateInput } from "../lib/transcription";
import type { CollectionRecord, Scenario, Turn } from "../lib/types";
import { readFileSync } from "node:fs";
import { prefillOpening, openingSignature } from "../lib/reuse-opening";
import type { ScenarioPacket } from "../lib/types";
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

const packet = JSON.parse(readFileSync("public/scenarios.json", "utf8")) as ScenarioPacket;
const consent = {processing:true, publicText:false, publicAudio:false};
const when = "2026-10-22T12:00:00.000Z";
function sourceFor(sid="F01", language: "en"|"pcm"|"en_pcm"="en"): CollectionRecord {
  return {id:collectionRecordKey(packet.schema_version,"Sunny",sid,language),scenarioId:sid,language,participant:"Sunny",packetVersion:packet.schema_version,consent,
    contextConfirmed:true,updatedAt:when,turns:{[sid+"_u1"]:{slotId:sid+"_u1",provider:"elevenlabs",source:"recording",editedTranscript:"My checked opening",originalTranscript:"My raw opening",verified:true,unresolved:false,humanNote:"",audioId:"source-audio",recordings:[{audioId:"source-audio",mime:"audio/webm",durationSeconds:2,createdAt:when}],edits:[],transcriptions:[]}}};
}
function reuse(source=sourceFor(), targetId="F02", destination?:CollectionRecord) {
  const rows = {[source.id]:source,...(destination?{[destination.id]:destination}:{})};
  return prefillOpening(packet,packet.scenarios.find(s=>s.id===targetId)!,source.language,"Sunny",rows,consent,when);
}
test("matching openings reuse one source recording with unconfirmed provenance and no source mutation",()=>{
  for(const language of ["en","pcm","en_pcm"] as const) {
    const source=sourceFor("F01",language);const before=structuredClone(source);const copy=reuse(source)!;
    assert.equal(copy.turns.F02_u1.editedTranscript,source.turns.F01_u1.editedTranscript);
    assert.equal(copy.turns.F02_u1.audioId,"source-audio");
    assert.equal(copy.turns.F02_u1.recordings.length,1);
    assert.equal(copy.turns.F02_u1.verified,false);assert.equal(copy.contextConfirmed,false);
    assert.equal(copy.turns.F02_u1.reusedFrom?.recordId,source.id);
    assert.equal(copy.turns.F02_u1.reusedFrom?.slotId,"F01_u1");
    assert.deepEqual(source,before);
    copy.turns.F02_u1.editedTranscript="Edited for this story";
    assert.equal(source.turns.F01_u1.editedTranscript,"My checked opening");
  }
});
test("existing destination answers, even unfinished ones, are never replaced",()=>{
  const existing=sourceFor("F02");const before=structuredClone(existing);
  assert.equal(reuse(sourceFor(),"F02",existing),undefined);
  existing.turns.F02_u1.editedTranscript="";existing.turns.F02_u1.verified=false;
  assert.equal(reuse(sourceFor(),"F02",existing),undefined);
  assert.equal(before.turns.F02_u1.editedTranscript,"My checked opening");
});
test("filling an opening preserves an independently completed second answer",()=>{
  const destination=sourceFor("F02");const second={...destination.turns.F02_u1,slotId:"F02_u2",editedTranscript:"My final decision"};
  destination.turns={F02_u2:second};
  const copy=reuse(sourceFor(),"F02",destination)!;
  assert.deepEqual(copy.turns.F02_u2,second);
  assert.equal(copy.turns.F02_u1.verified,false);
});
test("different briefs or state block reuse, including stories 25/26 and 33/34",()=>{
  for(const language of ["en","pcm","en_pcm"] as const) {
    assert.equal(reuse(sourceFor("F25",language),"F26"),undefined);
    assert.equal(reuse(sourceFor("F33",language),"F34"),undefined);
    assert.equal(reuse(sourceFor("F34",language),"F33"),undefined);
  }
  const original=packet.scenarios[0];
  const changed=structuredClone(original);changed.dialogue_slots[1]={role:"assistant",content:"Different assistant context"};
  assert.notEqual(openingSignature(original,"en"),openingSignature(changed,"en"));
  changed.dialogue_slots=structuredClone(original.dialogue_slots);changed.setting.en="Different setting";
  assert.notEqual(openingSignature(original,"en"),openingSignature(changed,"en"));
});
test("unchecked, flagged, cross-speaker, cross-language and older-version openings are ineligible",()=>{
  const source=sourceFor();source.turns.F01_u1.verified=false;assert.equal(reuse(source),undefined);
  source.turns.F01_u1.verified=true;source.turns.F01_u1.unresolved=true;assert.equal(reuse(source),undefined);
  source.turns.F01_u1.unresolved=false;
  const target=packet.scenarios[1];
  assert.equal(prefillOpening(packet,target,"pcm","Sunny",{[source.id]:source},consent,when),undefined);
  assert.equal(prefillOpening(packet,target,"en","SomeoneElse",{[source.id]:source},consent,when),undefined);
  source.packetVersion="old";assert.equal(reuse(source),undefined);
});
test("a reused opening does not cascade or refresh a destination after source edits",()=>{
  const source=sourceFor();const destination=reuse(source)!;
  destination.turns.F02_u1.verified=true;
  assert.equal(reuse(destination,"F01"),undefined);
  source.turns.F01_u1.editedTranscript="Changed source";
  assert.equal(reuse(source,"F02",destination),undefined);
  assert.equal(destination.turns.F02_u1.editedTranscript,"My checked opening");
});
