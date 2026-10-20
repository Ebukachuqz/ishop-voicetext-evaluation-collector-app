"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncCloud } from "@/lib/cloud";
import ShoppingUpdates from "./ShoppingUpdates";
import { checkedAnswers, friendlyTranscriptionError, languageNames } from "@/lib/presentation";
import { downloadBlob, exportCollection, importCollection } from "@/lib/export";
import ProductArt from "./ProductArt";
import { collectionRecordKey, isComplete, providerRecordId } from "@/lib/collection";
import { getAudio, getRecords, saveAudio, saveRecord } from "@/lib/storage";
import type { CollectionRecord, Consent, Language, Provider, Scenario, ScenarioPacket, Turn } from "@/lib/types";

const languageLabels = languageNames;
const emptyConsent = (): Consent => ({ privateCloud: false, processing: false, publicText: false, publicAudio: false });
const freshTurn = (slotId: string): Turn => ({ slotId, provider: "elevenlabs", originalTranscript: "", editedTranscript: "", source: "recording", verified: false,
  unresolved: false, humanNote: "", edits: [], recordings: [], transcriptions: [] });
const money = (value: number) => "₦" + value.toLocaleString("en-NG");

function Icon({ name, size = 20 }: { name: "mic" | "bag" | "arrow" | "check" | "download" | "shirt" | "sound" | "stop"; size?: number }) {
  const paths = {
    mic: <><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
    bag: <><path d="M4 7h16l1 15H3L4 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
    arrow: <path d="M4 12h16m-7-7 7 7-7 7"/>,
    check: <path d="m5 12 4 4L20 5"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    shirt: <path d="m8 3-6 4 3 5 3-2v12h8V10l3 2 3-5-6-4c-1 3-7 3-8 0Z"/>,
    sound: <><path d="m4 9 5-4v14l-5-4H1V9h3ZM14 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="2"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function AudioPlayer({ audioId }: { audioId?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true; let created = "";
    setUrl("");
    if (audioId) getAudio(audioId).then(asset => { if (asset && active) { created = URL.createObjectURL(asset.blob); setUrl(created); } }).catch(() => {});
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [audioId]);
  return url ? <audio controls preload="metadata" src={url} aria-label="Replay your recording" /> : null;
}

export default function Collector({screen = "welcome"}: {screen?: "welcome" | "activity" | "finish"}) {
  const router = useRouter();
  const [packet, setPacket] = useState<ScenarioPacket>();
  const [records, setRecords] = useState<Record<string, CollectionRecord>>({});
  const [index, setIndex] = useState(0);
  const [language, setLanguage] = useState<Language>("en");
  const [participant, setParticipant] = useState("");
  const [token, setToken] = useState("");
  const [consentDefaults, setConsentDefaults] = useState<Consent>(emptyConsent);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState("Ready to save on this device");
  const [recording, setRecording] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState<string>();
  const [recoveryAudio, setRecoveryAudio] = useState<{ blob: Blob; filename: string }>();
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localSaveFailed = useRef(false);
  const saving = useRef(new Set<Promise<unknown>>());
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([fetch("/scenarios.json").then(response => { if (!response.ok) throw new Error("Scenario packet could not load."); return response.json(); }), getRecords()])
      .then(([data, rows]: [ScenarioPacket, CollectionRecord[]]) => {
        setPacket(data); setRecords(Object.fromEntries(rows.map(row => [row.id, row])));
        setParticipant(localStorage.getItem("collection-participant") ?? "");
        setToken(sessionStorage.getItem("collection-access-token") ?? "");
        const savedLanguage = localStorage.getItem("collection-language");
        if (savedLanguage && ["en", "pcm", "en_pcm"].includes(savedLanguage)) setLanguage(savedLanguage as Language);
        const savedIndex = Number(localStorage.getItem("collection-index") ?? 0);
        if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < data.scenarios.length) setIndex(savedIndex);
        setLoaded(true);
        navigator.storage?.persist?.().catch(() => {});
      }).catch(() => setNotice("We could not open your saved answers. Please use a normal browser window and keep a downloaded copy of your work."));
    return () => { recorder.current?.state === "recording" && recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (recording || busy || recoveryAudio || saving.current.size) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [recording, busy, recoveryAudio]);

  useEffect(() => {
    if (!loaded) return;
    const sync = () => { if (localSaveFailed.current) return; void syncCloud(token.trim(), participant, setSaveState); };
    const delay = setTimeout(sync, 1500);
    const interval = setInterval(sync, 20000);
    window.addEventListener("online", sync);
    return () => { clearTimeout(delay); clearInterval(interval); window.removeEventListener("online", sync); };
  }, [loaded, records, token, participant]);

  const scenario = packet?.scenarios[index];
  const validParticipant = /^[a-zA-Z0-9_-]{2,40}$/.test(participant);
  const recordId = collectionRecordKey(packet?.schema_version ?? "", participant, scenario?.id ?? "", language);
  const current = records[recordId];
  const makeCurrent = (): CollectionRecord => current ?? ({ id: recordId, scenarioId: scenario!.id, language, participant,
    packetVersion: packet!.schema_version, consent: { ...consentDefaults }, turns: {}, contextConfirmed: false, updatedAt: new Date().toISOString() });
  function persist(next: CollectionRecord) {
    next.updatedAt = new Date(Math.max(Date.now(), Date.parse(next.updatedAt || "") + 1 || 0)).toISOString();
    setRecords(previous => ({ ...previous, [next.id]: next }));
    setSaveState("Saving your words…");
    const pending = saveRecord(next).then(() => { localSaveFailed.current = false; setSaveState("Saved on this device"); }).catch(error => {
      localSaveFailed.current = true; setSaveState("Storage failed · download a backup now"); setNotice("Your latest edit could not be saved: " + error.message + ". Do not close this page. Export a backup.");
    }).finally(() => saving.current.delete(pending));
    saving.current.add(pending);
  }
  function patchTurn(slotId: string, patch: Partial<Turn>) {
    if (!validParticipant || !scenario || !packet) return;
    const base = makeCurrent();
    const old = base.turns[slotId] ?? freshTurn(slotId);
    persist({ ...base, contextConfirmed: false, turns: { ...base.turns, [slotId]: { ...old, ...patch } } });
  }
  function changeLocation(nextIndex: number, nextLanguage = language) {
    if (recording || busy) { setNotice("Finish this recording or transcription before changing scenario."); return; }
    setIndex(nextIndex); setLanguage(nextLanguage); setNotice("");
    localStorage.setItem("collection-index", String(nextIndex)); localStorage.setItem("collection-language", nextLanguage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function startRecording(slotId: string) {
    if (!validParticipant) { setNotice("Please choose a nickname on the welcome page first."); return; }
    if (recording || busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setNotice("Recording needs HTTPS or localhost and a browser with microphone support. You can use manual text entry instead."); return; }
    setNotice(""); setBusy("microphone");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(stream.current, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recorder.current = instance;
      const chunks: BlobPart[] = [];
      const started = performance.now();
      const capturedRecord = makeCurrent();
      const capturedTurn = capturedRecord.turns[slotId] ?? freshTurn(slotId);
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onerror = () => setNotice("The microphone reported a recording error. Please replay this attempt or record again.");
      instance.onstop = async () => {
        if (timer.current) clearInterval(timer.current); if (stopTimer.current) clearTimeout(stopTimer.current);
        stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; setRecording(undefined);
        setBusy("saving-audio");
        const seconds = Math.min(120, (performance.now() - started) / 1000);
        const blob = new Blob(chunks, { type: instance.mimeType || mimeType || "audio/webm" });
        if (!blob.size) { setNotice("No audio was captured. Check microphone permission and try again."); setBusy(undefined); return; }
        const audioId = crypto.randomUUID();
        const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        const createdAt = new Date().toISOString();
        try {
          await saveAudio({ id: audioId, blob, filename: `${audioId}.${ext}`, createdAt });
          const previous = capturedTurn.editedTranscript;
          persist({ ...capturedRecord, contextConfirmed: false, turns: { ...capturedRecord.turns, [slotId]: { ...capturedTurn, audioId, audioMime: blob.type,
            durationSeconds: seconds, source: "recording", verified: false, originalTranscript: "", editedTranscript: "", metadata: undefined, rawResponse: undefined,
            recordings: [...capturedTurn.recordings, { audioId, mime: blob.type, durationSeconds: seconds, createdAt }],
            edits: [...capturedTurn.edits, { at: createdAt, previous, next: "", kind: "re-recorded" }] } } });
          if (blob.size > 3 * 1024 * 1024) setNotice("Recording saved locally but exceeds the transcription limit. Record a shorter turn or enter a verified transcript manually.");
        } catch (error) { setRecoveryAudio({ blob, filename: `${audioId}.${ext}` }); setNotice("Audio could not be saved locally: " + (error as Error).message + ". Download the unsaved recording below before leaving this page."); }
        finally { setBusy(undefined); }
      };
      instance.start(1000); setRecording(slotId); setElapsed(0);
      timer.current = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 500);
      stopTimer.current = setTimeout(() => { if (instance.state === "recording") instance.stop(); }, 120000);
    } catch (error) { stream.current?.getTracks().forEach(track => track.stop()); setNotice("Your microphone could not start. Please allow microphone access, or type what you would say instead."); }
    finally { setBusy(undefined); }
  }
  function stopRecording() { if (recorder.current?.state === "recording") recorder.current.stop(); }
  async function transcribe(slotId: string) {
    const base = makeCurrent(); const turn = base.turns[slotId];
    if (!turn?.audioId || recording || busy) return;
    if (!base.consent.processing || !consentDefaults.processing) { setNotice("Please go to the welcome page and choose whether the writing service may receive your recording."); return; }
    if (!token.trim()) { setNotice("Please paste your invitation code on the welcome page before using the writing service."); return; }
    setBusy(slotId); setNotice("");
    try {
      const audio = await getAudio(turn.audioId);
      if (!audio) throw new Error("This recording could not be found on this device.");
      const body = new FormData();
      body.append("audio", audio.blob, audio.filename); body.append("provider", turn.provider); body.append("recordId", providerRecordId(base, slotId));
      body.append("language", language); body.append("processingConsent", "true"); body.append("durationSeconds", String(turn.durationSeconds));
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 185000);
      let response: Response;
      try { response = await fetch("/api/transcribe", { method: "POST", headers: { "x-collection-token": token.trim() }, body, signal: controller.signal }); }
      finally { clearTimeout(timeout); }
      const result = await response.json();
      if (!response.ok) {
        persist({ ...base, turns: { ...base.turns, [slotId]: { ...turn, transcriptionFailures: [...(turn.transcriptionFailures ?? []), {
          audioId: turn.audioId, provider: turn.provider, errorCode: result.error || "provider_error", providerFileId: result.providerFileId, createdAt: new Date().toISOString()
        }] } } });
        throw new Error(friendlyTranscriptionError(result.error));
      }
      if (typeof result.transcript !== "string") throw new Error("The writing service did not return any words.");
      const createdAt = new Date().toISOString();
      persist({ ...base, contextConfirmed: false, turns: { ...base.turns, [slotId]: { ...turn, originalTranscript: result.transcript, editedTranscript: result.transcript,
        metadata: result.metadata, rawResponse: result.rawResponse, verified: false, source: "recording",
        transcriptions: [...turn.transcriptions, { id: crypto.randomUUID(), audioId: turn.audioId, provider: turn.provider,
          originalTranscript: result.transcript, metadata: result.metadata, rawResponse: result.rawResponse, createdAt }],
        edits: [...turn.edits, { at: createdAt, previous: turn.editedTranscript, next: result.transcript, kind: "machine-transcription" }] } } });
      if (!result.transcript.trim()) setNotice("The provider returned an empty transcript. Your audio is safe locally; replay it, type what was said or record again.");
    } catch (error) { setNotice(error instanceof TypeError ? "The connection stopped. Your recording is saved on this device. Please ask the organiser before trying again." : (error as Error).name === "AbortError" ? "This is taking longer than expected. Your recording is saved. Please ask the organiser before trying again." : (error as Error).message); }
    finally { setBusy(undefined); }
  }
  function logEdit(slotId: string) {
    const turn = current?.turns[slotId]; if (!turn) return;
    const previous = turn.edits.at(-1)?.next ?? turn.originalTranscript;
    if (previous !== turn.editedTranscript) patchTurn(slotId, { edits: [...turn.edits, { at: new Date().toISOString(), previous, next: turn.editedTranscript, kind: "human-correction" }] });
  }
  async function exportWork(onlyCurrent = false) {
    if (!packet || busy || recording) { setNotice("Finish the recording or transcription before exporting."); return; }
    setBusy("export");
    try {
      await Promise.all([...saving.current]);
      const selected = Object.values(records).filter(record => record.participant === participant && record.packetVersion === packet.schema_version && (!onlyCurrent || record.id === recordId));
      if (!selected.length) throw new Error("There are no answers saved with this nickname yet.");
      const blob = await exportCollection(selected, packet.schema_version, participant);
      downloadBlob(blob, `shopping-answers-${participant}-${new Date().toISOString().slice(0, 10)}${onlyCurrent ? "-story-" + (index + 1) + "-" + languageLabels[language].replaceAll(" ", "-") : ""}.zip`);
      setNotice("Your answers file has been downloaded. Send that file privately to the person who invited you. You do not need to open or unzip it. If private saving is enabled, a copy is also sent automatically. Check the save message above.");
    } catch (error) { setNotice("Export failed: " + (error as Error).message); }
    finally { setBusy(undefined); }
  }
  async function exportLegacy(version: string) {
    if (!packet || busy || recording) return;
    setBusy("export");
    try {
      await Promise.all([...saving.current]);
      const selected = Object.values(records).filter(row => row.participant === participant && row.packetVersion === version);
      const blob = await exportCollection(selected, version, participant);
      downloadBlob(blob, `earlier-answers-${participant}-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice("Your earlier answers have been downloaded. Keep this file separate and tell the organiser it is an earlier draft.");
    } catch (error) { setNotice("Earlier-version backup failed: " + (error as Error).message); }
    finally { setBusy(undefined); }
  }
  async function restore(file?: File) {
    if (!file || !packet || busy || recording) return;
    if (!window.confirm("Open your saved answers file? It will replace matching answers on this device. Download your current answers first if you want to keep both.")) return;
    setBusy("import");
    try {
      const restored = await importCollection(file, packet.schema_version, new Set(packet.scenarios.map(item => item.id)));
      setRecords(previous => ({ ...previous, ...Object.fromEntries(restored.map(row => [row.id, row])) }));
      setNotice("Your saved answers have been opened. Use the same nickname to continue.");
    } catch (error) { setNotice("Backup could not be restored: " + (error as Error).message); }
    finally { setBusy(undefined); if (importInput.current) importInput.current.value = ""; }
  }

  useEffect(() => {
    if (!participant) return;
    try {
      const saved = JSON.parse(localStorage.getItem("collection-choices-" + participant) ?? "null");
      setConsentDefaults(saved ? {privateCloud: saved.privateCloud === true, processing: saved.processing === true, publicText: saved.publicText === true, publicAudio: saved.publicAudio === true} : emptyConsent());
    } catch { setConsentDefaults(emptyConsent()); }
  }, [participant]);
  async function navigate(path: string) {
    if (busy || recording || recoveryAudio) { setNotice("Please finish your recording or save it before leaving this page."); return; }
    await Promise.all([...saving.current]);
    router.push(path);
  }

  if (!loaded || !packet || !scenario) return <main className="loading"><div className="brand-mark">c<span>•</span></div><h1>Opening your shopping stories</h1><p>{notice || "Loading the shop and your saved work…"}</p></main>;
  const participantRecords = Object.values(records).filter(row => row.participant === participant && row.packetVersion === packet.schema_version);
  const legacyVersions = [...new Set(Object.values(records).filter(row => row.participant === participant && row.packetVersion !== packet.schema_version).map(row => row.packetVersion))];
  const completeCount = participantRecords.filter(row => { const item = packet.scenarios.find(story => story.id === row.scenarioId); return item && isComplete(row, item); }).length;
  const answerCount = checkedAnswers(participantRecords);
  const turns = scenario.dialogue_slots.filter(slot => slot.role === "user");
  const completed = isComplete(current, scenario);
  const activeConsent = consentDefaults;
  const setConsent = (name: keyof Consent, checked: boolean) => {
    const next = {...consentDefaults, [name]: checked};
    setConsentDefaults(next);
    if (validParticipant) {
      localStorage.setItem("collection-choices-" + participant, JSON.stringify(next));
      for (const row of participantRecords) persist({...row, consent: {...next}});
    }
  };
  const cart = Object.entries(scenario.initial_state.cart);
  const canLeave = !busy && !recording && !recoveryAudio;
  const begin = () => {
    if (!validParticipant) { setNotice("Choose a nickname with at least two letters. Please leave out your full name."); document.getElementById("participant")?.focus(); return; }
    navigate("/activities");
  };
  const header = <header className="topbar studio-navbar">
    <button className="brand brand-button" onClick={() => navigate("/")} disabled={!canLeave}><span className="brand-mark">c<span>•</span></span><span>Conversation <strong>Studio</strong><small>A little shopping, in your own words</small></span></button>
    <div className="nav-answer-count" aria-live="polite"><strong>{answerCount}<span> / 240</span></strong><small>answers checked</small></div>
    <div className="top-actions"><span className="save-status"><i/>{saveState}</span>{screen !== "welcome" && <button className="button ghost" onClick={() => navigate("/")} disabled={!canLeave}>My details</button>}{screen === "activity" && <button className="button dark compact" onClick={() => navigate("/finish")} disabled={!canLeave}><Icon name="download"/> Save my answers</button>}</div>
  </header>;
  const notices = <>{notice && <div className="notice" role="status"><span>{notice}</span><button aria-label="Close message" onClick={() => setNotice("")}>×</button></div>}{recoveryAudio && <div className="notice"><span>A recording is waiting to be saved. Keep this page open until you download it.</span><button className="text-button" onClick={() => downloadBlob(recoveryAudio.blob, recoveryAudio.filename)}>Save this recording</button></div>}</>;
  const restoreInput = <input type="file" accept=".zip" ref={importInput} hidden onChange={event => restore(event.target.files?.[0])}/>;

  if (screen === "welcome") return <div className="app-shell welcome-screen">{header}<main id="main">{notices}
    <section className="welcome-hero"><div><span className="eyebrow">HELLO, STORYTELLER!</span><h1>A little shop.<br/>Your own words<span>.</span></h1><p>Imagine you are chatting with Drake while shopping. Tell us what you would say, just as you would say it to a person.</p><div className="welcome-steps"><span><b>1</b> Read a short story</span><span><b>2</b> Say it your way</span><span><b>3</b> Check your words</span></div></div><div className="welcome-drawing" aria-hidden="true"><span className="welcome-spark">✦</span><ProductArt name="Blue T-shirt" color="blue"/><ProductArt name="Coral T-shirt" color="coral"/><span className="welcome-flower">✿</span><strong>There is no sentence<br/>to memorise!</strong></div></section>
    <section className="welcome-setup settings-panel"><div><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>What should we call you?</h2><p>Choose a nickname, not your full name. Use the same nickname when you come back.</p><label className="field-label" htmlFor="participant">Your nickname</label><input id="participant" value={participant} maxLength={40} placeholder="For example, Sunny" onChange={event => {const value = event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""); setParticipant(value); localStorage.setItem("collection-participant", value);}}/>
      <label className="field-label" htmlFor="access-token">Your invitation code <span>(if you were given one)</span></label><input id="access-token" type="password" autoComplete="off" value={token} placeholder="Paste the code from your invitation" onChange={event => {setToken(event.target.value); sessionStorage.setItem("collection-access-token", event.target.value);}}/><small>This lets the writing service turn your recordings into words. You can still record or type without it.</small>
      <div className="welcome-storage-note"><Icon name="bag"/><div><strong>Your answers are saved as you go.</strong><p>Choose private saving below to send recordings and answers securely to the organiser automatically. A copy stays in this browser. You can also download and send your answers file.</p></div></div>
      <button className="text-button" onClick={() => importInput.current?.click()} disabled={!!busy}>Open an answers file I saved earlier</button>{restoreInput}
    </div><div className="consent-list"><h3>Your choices</h3><label><input type="checkbox" checked={activeConsent.privateCloud ?? false} onChange={event => setConsent("privateCloud", event.target.checked)}/><span>Save my recordings and answers privately for the organiser as I work.<small>Stored in private Vercel cloud storage. This does not allow public sharing. If I turn this off later, I will contact the organiser to remove earlier copies.</small></span></label><label><input type="checkbox" checked={activeConsent.processing} onChange={event => setConsent("processing", event.target.checked)}/><span>ElevenLabs or Sahara may receive my recordings to turn them into words for this study.</span></label><label><input type="checkbox" checked={activeConsent.publicText} onChange={event => setConsent("publicText", event.target.checked)}/><span>You may share my checked words publicly, without my name.<small>Optional. Leave unticked if you want them kept private.</small></span></label><label><input type="checkbox" checked={activeConsent.publicAudio} onChange={event => setConsent("publicAudio", event.target.checked)}/><span>You may share my voice recordings publicly.<small>Optional. People may recognise a voice.</small></span></label><p>These choices are saved with your answers. You can change them here. If you already sent an answers file, tell the organiser about any changes. Leave out names, phone numbers and other personal details when speaking.</p><div className="welcome-start"><button className="button start-adventure" onClick={begin} disabled={!!busy}>{answerCount ? "Continue the shopping stories" : "Start the shopping stories"}<Icon name="arrow"/></button><small>40 stories · English, Nigerian Pidgin, and a mix of both. Two short answers for each version.</small></div></div></section>
    {legacyVersions.map(version => <div className="notice" key={version}><span>An earlier draft is also saved on this device.</span><button className="text-button" onClick={() => exportLegacy(version)} disabled={!!busy}>Save my earlier answers</button></div>)}
    <footer><span>Use a normal browser window so your saved work is easier to keep.</span><a className="text-button" href="/filler">Open the separate filler activity</a><span>You can take a break and come back.</span></footer>
  </main></div>;

  if (screen === "finish") return <div className="app-shell finish-screen">{header}<main id="main">{notices}<section className="finish-card"><span className="finish-star" aria-hidden="true">✿</span><span className="eyebrow">KEEP YOUR WORDS SAFE</span><h1>{completeCount === 120 ? "All done. Thank you!" : "Save now. Come back later."}</h1><p>You have checked <strong>{answerCount} of 240 answers</strong> and finished <strong>{completeCount} of 120 story versions</strong>. You can download your work at any time.</p><ol className="handover-steps"><li><b>Save your answers.</b><span>The button below downloads one file containing your recordings and words.</span></li><li><b>Send that file privately.</b><span>Send it to the person who gave you this link, using the private channel you agreed with them. You do not need to open or unzip the file.</span></li><li><b>Keep a copy.</b><span>Your work also stays in this browser, but clearing the browser or changing device can lose it.</span></li></ol><button className="button start-adventure" onClick={() => exportWork()} disabled={!!busy || !participantRecords.length}><Icon name="download"/>Download my answers</button><button className="text-button" onClick={() => navigate("/activities")} disabled={!canLeave}>Back to the stories</button><p className="finish-privacy">This is a private handover file, including recordings you have not allowed for public sharing. Private saving sends your work automatically only when you choose it. Check the save message above before closing this page. You can still download and send a backup.</p></section></main></div>;

  const renderTurn = (slot: Extract<Scenario["dialogue_slots"][number], {role: "user"}>, number: number) => {
    const turn = current?.turns[slot.slot_id] ?? freshTurn(slot.slot_id);
    const active = recording === slot.slot_id;
    return <article className={`shopper-turn ${active ? "is-recording" : ""}`}><div className="turn-title"><span className="avatar shopper">You</span><span>YOUR ANSWER {number}</span>{turn.verified && !turn.unresolved && <span className="verified-tag">Checked ✓</span>}</div><p className="turn-brief">{slot.brief[language]}</p><div className="record-row"><button className={`button record-button ${active ? "recording" : ""}`} onClick={() => active ? stopRecording() : startRecording(slot.slot_id)} disabled={!validParticipant || !!busy || (!!recording && !active)}><Icon name={active ? "stop" : "mic"}/>{active ? `Stop · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : turn.audioId ? "Record again" : "Record my answer"}</button><span className="record-hint">{active ? <><span className="record-dot"/>Listening · up to 2 minutes</> : turn.audioId ? "Recording saved on this device" : "Your microphone is off until you press record"}</span></div><AudioPlayer audioId={turn.audioId}/>
      <div className="provider-row"><label htmlFor={`${slot.slot_id}-provider`}>Write my recording using</label><select id={`${slot.slot_id}-provider`} value={turn.provider} disabled={!!recording || !!busy} onChange={event => patchTurn(slot.slot_id, {provider: event.target.value as Provider})}><option value="elevenlabs">ElevenLabs</option><option value="sahara">Sahara</option></select><button className="button outlined compact" onClick={() => transcribe(slot.slot_id)} disabled={!turn.audioId || !!recording || !!busy}>{busy === slot.slot_id ? "Writing your words…" : "Turn it into words"}</button></div>
      {turn.originalTranscript && <details className="machine-transcript"><summary>See what the writing service heard</summary><p>{turn.originalTranscript}</p></details>}
      <label className="field-label" htmlFor={`${slot.slot_id}-text`}>{turn.audioId ? "Do these words match what you said?" : "Or type what you would say"}</label><textarea id={`${slot.slot_id}-text`} value={turn.editedTranscript} placeholder="Your words will appear here. Fix any words the service heard wrongly, or type your answer yourself." disabled={!validParticipant || !!recording || !!busy} onChange={event => patchTurn(slot.slot_id, {editedTranscript: event.target.value, verified: false, source: turn.audioId ? "recording" : "manual"})} onBlur={() => logEdit(slot.slot_id)}/><small className="transcript-guidance">Keep repeated words and little words such as “um”. If you changed your mind while speaking, keep that too. If your answer does not fit the story, record again. We never rewrite your words.</small>
      <div className="verification"><label><input type="checkbox" checked={turn.verified} disabled={!turn.editedTranscript.trim() || !!recording || !!busy} onChange={event => patchTurn(slot.slot_id, {verified: event.target.checked})}/><span>{turn.audioId ? "I listened and checked that these are my words." : "These are my own words, and I checked them."}</span></label><label><input type="checkbox" checked={turn.unresolved} disabled={!!recording || !!busy} onChange={event => patchTurn(slot.slot_id, {unresolved: event.target.checked, verified: false})}/><span>I am unsure about something and need help.</span></label></div>{turn.unresolved && <><label className="field-label" htmlFor={`${slot.slot_id}-note`}>What would you like help with?</label><textarea className="note-input" id={`${slot.slot_id}-note`} value={turn.humanNote} onChange={event => patchTurn(slot.slot_id, {humanNote: event.target.value})} placeholder="Tell the organiser what is confusing."/></>}
    </article>;
  };
  return <div className="app-shell activity-screen">{header}<main id="main" className="activity-main">{notices}{!validParticipant && <div className="notice"><span>Choose a nickname before you begin.</span><button className="text-button" onClick={() => navigate("/")}>Go to the welcome page</button></div>}
    <aside className="shop-panel shop-strip"><div className="shop-strip-heading"><span className="shop-logo">Little Talk Shop<span>✿</span></span><p>Pretend you are shopping here. Nothing you say will place a real order.</p></div><div className="product-grid">{packet.catalogue.map(product => <article className="product-card" key={product.product_id}><div className={`product-image ${product.color}`}><ProductArt name={product.name} color={product.color}/></div><div className="product-info"><h3>{product.name}</h3><strong>{money(product.price_ngn)}</strong></div></article>)}</div><div className="shop-statebar"><section className="cart-card"><div className="section-heading"><h3><Icon name="bag"/>Your basket in this story</h3><span className="count-badge">{cart.reduce((total, [,qty]) => total + qty, 0)}</span></div>{cart.length ? cart.map(([productId, qty]) => {const item = packet.catalogue.find(p => p.product_id === productId); return <div className="cart-line" key={productId}><span>{qty} × {item?.name ?? "shirt"}</span><strong>{money((item?.price_ngn ?? 0) * qty)}</strong></div>;}) : <p className="empty-cart">Your basket is empty.</p>}<small className="context-note">This is the basket for the story below. Recording an answer does not change it.</small></section><ShoppingUpdates state={scenario.initial_state} catalogue={packet.catalogue}/></div></aside>
    <section className="conversation-panel story-workspace"><div className="scenario-top"><span className="pill purple">STORY {index + 1} OF 40</span><span className={`completion ${completed ? "done" : ""}`}>{completed ? "Story finished ✓" : languageLabels[language]}</span></div><h2>{scenario.title}</h2><nav className="language-tabs" aria-label="Choose how to speak">{(Object.keys(languageLabels) as Language[]).map(lang => <button key={lang} className={lang === language ? "active" : ""} onClick={() => changeLocation(index, lang)} disabled={!!recording || !!busy}>{languageLabels[lang]}{isComplete(records[collectionRecordKey(packet.schema_version, participant, scenario.id, lang)], scenario) && <Icon name="check" size={16}/>}</button>)}</nav><div className="brief"><span className="eyebrow">IMAGINE THIS</span><p>{scenario.setting[language]}</p><p className="brief-note">Speak in your own way. Repeating words or changing your mind is fine. You do not need to memorise a sentence.</p></div>
      <div className="dialogue conversation-columns">{scenario.dialogue_slots.map((slot, slotIndex) => {
        if (slot.role !== "user") return null;
        const reply = scenario.dialogue_slots[slotIndex + 1];
        const number = scenario.dialogue_slots.slice(0,slotIndex+1).filter(item => item.role === "user").length;
        return <div className="dialogue-column" key={slot.slot_id}>{renderTurn(slot, number)}{reply?.role === "assistant" && <div className="assistant-turn"><span className="avatar">D</span><div><small>THEN DRAKE REPLIES</small><p>{reply.content}</p></div></div>}</div>;
      })}</div><div className="scenario-verification"><label><input type="checkbox" checked={current?.contextConfirmed ?? false} disabled={!validParticipant || !!recording || !!busy || !turns.every(slot => slot.role === "user" && current?.turns[slot.slot_id]?.verified && !current.turns[slot.slot_id].unresolved && current.turns[slot.slot_id].editedTranscript.trim())} onChange={event => persist({...makeCurrent(), contextConfirmed:event.target.checked})}/><span>I checked both answers. They say what I meant, fit this story, and use the language I chose.</span></label></div>
      <div className="jump-row"><label htmlFor="jump">Choose a story</label><select id="jump" value={index} onChange={event => changeLocation(Number(event.target.value))} disabled={!!recording || !!busy}>{packet.scenarios.map((item,n) => <option value={n} key={item.id}>{n+1}. {item.title}</option>)}</select><button className="text-button" onClick={() => exportWork(true)} disabled={!!recording || !!busy}>Save just this story</button></div></section>
    <nav className="scenario-nav page-side-nav" aria-label="Previous or next story"><button className="button previous" disabled={index === 0 || !!recording || !!busy} onClick={() => changeLocation(index-1)}><span aria-hidden="true">←</span><span>Previous</span></button><button className="button next" disabled={index === packet.scenarios.length-1 || !!recording || !!busy} onClick={() => changeLocation(index+1)}><span>Next</span><Icon name="arrow"/></button></nav>
    <footer><span>Check the save message above. Keep a downloaded backup before clearing your browser.</span><button className="text-button" onClick={() => navigate("/finish")} disabled={!canLeave}>Finish and save my answers</button></footer>
  </main></div>;
}
