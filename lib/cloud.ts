import { getAudio, getRecords } from "./storage";
import type { AudioAsset, CollectionRecord } from "./types";
type SyncDependencies = { readRecords: () => Promise<CollectionRecord[]>; readAudio: (id:string) => Promise<AudioAsset|undefined>; storage: Pick<Storage,"getItem"|"setItem">; send: typeof fetch };
let running = false;
export async function syncCloud(token: string, participant: string, report: (message: string) => void, dependencies?: SyncDependencies) {
  const {readRecords,readAudio,storage,send:fetcher} = dependencies ?? {readRecords:getRecords,readAudio:getAudio,storage:localStorage,send:fetch};
  if (running || !participant) return;
  if (!token) { report("Saved on this device · invitation code needed for private saving"); return; }
  running = true;
  try {
    let device = storage.getItem("collection-cloud-device");
    if (!device) { device = crypto.randomUUID() + crypto.randomUUID(); storage.setItem("collection-cloud-device", device); }
    const send = async (body: FormData) => {
      const response = await fetcher("/api/save", { method: "POST", headers: { "x-collection-token": token, "x-device-secret": device! }, body, signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error("upload failed");
    };
    const rows = (await readRecords()).filter(row => row.participant === participant);
    let uploaded = 0;
    for (const row of rows) {
      const serialized = JSON.stringify(row);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized)))).map(n => n.toString(16).padStart(2,"0")).join("");
      const key = "cloud-saved:" + device + ":" + row.id;
      const previous = storage.getItem(key);
      if (!row.consent.privateCloud && !previous) continue;
      if (previous === hash) { uploaded++; continue; }
      report("Saved on this device · sending private copy…");
      if (row.consent.privateCloud) {
        const ids = new Set(Object.values(row.turns).flatMap(turn => turn.recordings.map(item => item.audioId)));
        for (const id of ids) {
          const audioKey = "cloud-audio:" + device + ":" + id;
          if (storage.getItem(audioKey)) continue;
          const asset = await readAudio(id);
          if (!asset) throw new Error("missing recording");
          const body = new FormData(); body.set("kind", "audio"); body.set("record", serialized);
          body.set("audio", asset.blob, asset.filename); body.set("audioId", id); body.set("createdAt", asset.createdAt);
          await send(body); storage.setItem(audioKey, "saved");
        }
      }
      const body = new FormData(); body.set("kind", "record"); body.set("record", serialized);
      await send(body); storage.setItem(key, hash); uploaded++;
    }
    const latest = (await readRecords()).filter(row => row.participant === participant);
    if (JSON.stringify(rows) !== JSON.stringify(latest)) { report("Saved on this device · latest changes waiting to send"); return; }
    report(uploaded ? "Private copy saved for the organiser" : "Saved on this device · cloud sharing is off");
  } catch { report("Saved on this device · cloud copy waiting. Keep this browser or download a backup."); }
  finally { running = false; }
}
