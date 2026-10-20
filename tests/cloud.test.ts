import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {saveCloudRequest} from "../lib/cloud-server";
import {validateCloudRecord} from "../lib/cloud-validation";
import type {CollectionRecord} from "../lib/types";
const env = {COLLECTION_ACCESS_TOKEN:"a".repeat(32),BLOB_READ_WRITE_TOKEN:"test-private-token"};
const device = "a".repeat(72);
const record = (): CollectionRecord => ({id:"2.1:Sunny|F01_en",scenarioId:"F01",language:"en",participant:"Sunny",packetVersion:"2.1",consent:{privateCloud:true,processing:false,publicText:false,publicAudio:false},turns:{},contextConfirmed:false,updatedAt:"2026-10-19T12:00:00.001Z"});
function request(row=record(), kind="record", secret=device) {
  const body = new FormData(); body.set("kind",kind);body.set("record",JSON.stringify(row));
  if(kind==="audio") {body.set("audio",new Blob(["audio"],{type:"audio/webm"}),"test.webm");body.set("audioId","b".repeat(36));}
  return new Request("https://study.example/api/save",{method:"POST",headers:{origin:"https://study.example","x-collection-token":env.COLLECTION_ACCESS_TOKEN,"x-device-secret":secret},body});
}
test("private saving persists exact record and isolates device namespaces",async()=>{
  const calls: {path:string;content:Buffer;options:unknown}[]=[];
  const store=async(path:string,content:Buffer,options:unknown)=>{calls.push({path,content,options});};
  assert.equal((await saveCloudRequest(request(),env,store)).status,200);
  assert.deepEqual(JSON.parse(calls[0].content.toString()),record());
  assert.equal((calls[0].options as {access:string}).access,"private");
  assert.equal((await saveCloudRequest(request(record(),"record","b".repeat(72)),env,store)).status,200);
  assert.notEqual(calls[0].path.split("/")[1],calls[1].path.split("/")[1]);
});
test("bad invitation, foreign origin, absent store and malformed records cannot write",async()=>{
  let writes=0;const store=async()=>{writes++;};
  const denied=request();denied.headers.set("x-collection-token","wrong");
  assert.equal((await saveCloudRequest(denied,env,store)).status,401);
  const foreign=request();foreign.headers.set("origin","https://other.example");
  assert.equal((await saveCloudRequest(foreign,env,store)).status,403);
  assert.equal((await saveCloudRequest(request(),{...env,BLOB_READ_WRITE_TOKEN:undefined},store)).status,503);
  assert.equal((await saveCloudRequest(request({...record(),id:"another-speaker"}),env,store)).status,400);
  assert.equal(writes,0);
});
test("withdrawal saves consent notice without words and rejects audio",async()=>{
  const row=record(); row.consent.privateCloud=false;
  const stored:Buffer[]=[];const store=async(_path:string,content:Buffer)=>{stored.push(content);};
  assert.equal((await saveCloudRequest(request(row),env,store)).status,200);
  assert.equal(JSON.parse(stored[0].toString()).withdrawn,true);
  assert.equal("turns" in JSON.parse(stored[0].toString()),false);
  assert.equal((await saveCloudRequest(request(row,"audio"),env,store)).status,403);
});
test("all public scenario slots satisfy cloud schema",()=>{
  const packet=JSON.parse(readFileSync("public/scenarios.json","utf8"));
  for(const scenario of packet.scenarios) {
    const row=record(); row.scenarioId=scenario.id;row.id=`2.1:Sunny|${scenario.id}_en`;
    for(const slot of scenario.dialogue_slots.filter((s:{role:string})=>s.role==="user")) row.turns[slot.slot_id]={slotId:slot.slot_id,editedTranscript:"human words",originalTranscript:"",verified:false,unresolved:false,recordings:[],transcriptions:[],edits:[]} as never;
    assert.doesNotThrow(()=>validateCloudRecord(row));
  }
});

// Retry tests use in-memory stores and HTTP fixtures; no cloud or transcription calls.
import {syncCloud} from "../lib/cloud";
test("failed cloud writes retry from the browser copy and acknowledge only after success",async()=>{
  const row=record();const values=new Map<string,string>();
  const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const messages:string[]=[];let fail=true;let calls=0;
  const send=async()=>{calls++;return new Response("{}",{status:fail?503:200});};
  const dependencies={readRecords:async()=>[row],readAudio:async()=>undefined,storage,send:send as typeof fetch};
  await syncCloud("invitation","Sunny",message=>messages.push(message),dependencies);
  assert.match(messages.at(-1)!,/waiting/);
  assert.equal([...values.keys()].some(key=>key.startsWith("cloud-saved:")),false);
  fail=false;await syncCloud("invitation","Sunny",message=>messages.push(message),dependencies);
  assert.match(messages.at(-1)!,/Private copy saved/);
  const count=calls;await syncCloud("invitation","Sunny",()=>{},dependencies);assert.equal(calls,count);
  row.consent.privateCloud=false;await syncCloud("invitation","Sunny",()=>{},dependencies);assert.equal(calls,count+1);
});
test("cloud saving stays off without separate consent",async()=>{
  const row=record();row.consent.privateCloud=false;let calls=0;
  await syncCloud("invitation","Sunny",()=>{}, {readRecords:async()=>[row],readAudio:async()=>undefined,storage:{getItem:()=>null,setItem:()=>{}},send:(async()=>{calls++;return new Response("{}");}) as typeof fetch});
  assert.equal(calls,0);
});

test("all retained recordings upload before their answer snapshot",async()=>{
  const row=record();const id="b".repeat(36);
  row.turns.F01_u1={slotId:"F01_u1",recordings:[{audioId:id,mime:"audio/webm",durationSeconds:1,createdAt:row.updatedAt}],editedTranscript:"my words",originalTranscript:"",verified:true,unresolved:false,transcriptions:[],edits:[]} as never;
  const values=new Map<string,string>(); const kinds:string[]=[];
  const send=async(_url:unknown,options?:RequestInit)=>{kinds.push(String((options!.body as FormData).get("kind")));return new Response("{}");};
  await syncCloud("invitation","Sunny",()=>{}, {readRecords:async()=>[row],readAudio:async()=>({id,blob:new Blob(["audio"],{type:"audio/webm"}),createdAt:row.updatedAt,filename:id+".webm"}),storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}},send:send as typeof fetch});
  assert.deepEqual(kinds,["audio","record"]);
  const stored:Buffer[]=[];
  assert.equal((await saveCloudRequest(request(row,"audio"),env,async(_path,content)=>{stored.push(content);})).status,200);
  assert.equal(stored[0].toString(),"audio");
});
