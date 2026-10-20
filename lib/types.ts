export type Language = "en" | "pcm" | "en_pcm";
export type Provider = "elevenlabs" | "sahara";
export type Localized = Record<Language, string>;
export type Scenario = {
  id: string; context_group: string; pair_role: string; title: string;
  initial_state: { cart: Record<string, number>; pending: unknown; receipts: unknown[] };
  setting: Localized; elicitation_notes: Localized;
  dialogue_slots: ({ role: "user"; slot_id: string; brief: Localized } | { role: "assistant"; content: string })[];
};
export type ScenarioPacket = {
  schema_version: string; catalogue: { product_id: string; name: string; color: string; price_ngn: number }[];
  languages: { id: Language; label: string }[]; scenarios: Scenario[];
};
export type Consent = { privateCloud?: boolean; processing: boolean; publicText: boolean; publicAudio: boolean };
export type Turn = {
  slotId: string; provider: Provider; audioId?: string; audioMime?: string;
  durationSeconds?: number; originalTranscript: string; editedTranscript: string;
  source: "recording" | "manual"; verified: boolean; unresolved: boolean;
  humanNote: string; metadata?: Record<string, unknown>; rawResponse?: unknown;
  edits: { at: string; previous: string; next: string; kind: string }[];
  recordings: { audioId: string; mime: string; durationSeconds: number; createdAt: string }[];
  transcriptions: { id: string; audioId: string; provider: Provider; originalTranscript: string;
    metadata: Record<string, unknown>; rawResponse: unknown; createdAt: string }[];
  transcriptionFailures?: { audioId: string; provider: Provider; errorCode: string; providerFileId?: string; createdAt: string }[];
};
export type CollectionRecord = {
  id: string; scenarioId: string; language: Language; participant: string;
  packetVersion: string; consent: Consent; turns: Record<string, Turn>;
  contextConfirmed: boolean; updatedAt: string;
};
export type AudioAsset = { id: string; blob: Blob; createdAt: string; filename: string };
