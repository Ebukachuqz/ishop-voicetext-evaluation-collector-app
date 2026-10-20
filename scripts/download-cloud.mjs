// Run locally with the store token; never expose this token to participants.
import { list, get } from "@vercel/blob";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zipSync, strToU8 } from "fflate";
const destination = process.argv[2];
if (!destination || !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Usage: node --env-file=.env scripts/download-cloud.mjs NEW_PRIVATE_DIRECTORY");
const root = resolve(destination); await mkdir(root, {recursive:false});
const blobs = []; let cursor;
do { const page = await list({prefix:"collection/",cursor,limit:1000}); blobs.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined; } while(cursor);
async function read(pathname) {
  const item = await get(pathname, {access:"private",useCache:false});
  if (!item || item.statusCode !== 200) throw new Error("Missing cloud object; export incomplete");
  return new Uint8Array(await new Response(item.stream).arrayBuffer());
}
const latest = new Map();
for (const blob of blobs.filter(item => item.pathname.includes("/records/"))) {
  const bytes = await read(blob.pathname); const record = JSON.parse(new TextDecoder().decode(bytes));
  const session = blob.pathname.split("/")[1]; const key = session + ":" + record.id;
  const old = latest.get(key);
  if (!old || record.updatedAt > old.record.updatedAt) latest.set(key,{record,session});
}
const groups = new Map(); let withdrawn = 0;
for (const {record,session} of latest.values()) {
  if (record.withdrawn || !record.consent.privateCloud) { withdrawn++; continue; }
  const key = session + "_" + record.packetVersion + "_" + record.participant;
  if (!groups.has(key)) groups.set(key, {records:[],session}); groups.get(key).records.push(record);
}
let count = 0;
for (const [key,{records,session}] of groups) {
  const audio = new Map();
  for (const record of records) for (const turn of Object.values(record.turns)) for (const item of turn.recordings) audio.set(item.audioId,item);
  const files = {}; const index = []; let total = 0;
  for (const [id,item] of audio) {
    const candidates = blobs.filter(blob => blob.pathname.startsWith(`collection/${session}/audio/${id}.`));
    if (candidates.length !== 1) throw new Error("Missing or ambiguous recording; export incomplete");
    const blob = candidates[0]; const bytes = await read(blob.pathname); total += bytes.length;
    if (total > 250*1024*1024) throw new Error("Export exceeds 250 MB; ask the organiser to split this session.");
    const filename = blob.pathname.split("/").at(-1);
    files["audio/"+filename] = bytes;
    index.push({id,filename,createdAt:item.createdAt,mime:item.mime});
  }
  const manifest = {schemaVersion:"collection-export-v1",exportedAt:new Date().toISOString(),packetVersion:records[0].packetVersion,privateExport:true,participant:records[0].participant,recordCount:records.length,recordIds:records.map(r=>r.id),audioCount:index.length,source:"private-cloud"};
  files["manifest.json"] = strToU8(JSON.stringify(manifest,null,2)); files["records.json"] = strToU8(JSON.stringify(records,null,2)); files["audio-index.json"] = strToU8(JSON.stringify(index,null,2));
  await writeFile(resolve(root, key+".zip"), zipSync(files,{level:0})); count++;
}
await writeFile(resolve(root,"export-summary.json"),JSON.stringify({exportedAt:new Date().toISOString(),archives:count,withdrawnRecordsExcluded:withdrawn},null,2));
console.log(`Saved ${count} private archives. Excluded ${withdrawn} withdrawn records. Keep this directory private.`);
