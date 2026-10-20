import type { CollectionRecord, ScenarioPacket } from "./types";

export const languageNames = {en: "English", pcm: "Nigerian Pidgin", en_pcm: "English and Pidgin mixed"};
export function checkedAnswers(records: CollectionRecord[]) {
  return records.reduce((total, record) => total + Object.values(record.turns).filter(turn => turn.verified && !turn.unresolved && !!turn.editedTranscript.trim()).length, 0);
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function shoppingUpdates(value: unknown, catalogue: ScenarioPacket["catalogue"]): string[] {
  const entry = object(value);
  if (Array.isArray(entry.actions)) return entry.actions.flatMap(action => shoppingUpdates(action, catalogue));
  const product = catalogue.find(item => item.product_id === entry.product_id);
  const count = entry.quantity;
  if (!product || typeof count !== "number") return ["An earlier basket change"];
  const name = count === 1 ? product.name : product.name + "s";
  if (entry.action === "set_cart_quantity") return [count === 0 ? `Remove the ${product.name}` : `Keep ${count} ${name} in the basket`];
  return [`Add ${count} ${name} to the basket`];
}

export function friendlyTranscriptionError(code: string): string {
  const messages: Record<string, string> = {
    provider_not_configured: "This writing service is not ready yet. Please choose the other one, or let the person who sent you this link know.",
    collection_not_configured: "The study organiser needs to finish setting up the writing service. Your recording is still saved.",
    access_denied: "Please check your invitation code on the welcome page, then try again.",
    consent_required: "Please choose whether the writing service may receive your recording on the welcome page.",
    invalid_audio_size: "This recording is too large. Try a shorter recording, or listen and type the words yourself.",
    provider_pending: "The service is still working on your recording. Your recording is safe. Ask the organiser before trying again.",
    provider_rate_limited: "The writing service is busy. Your recording is saved; please try again later.",
    empty_transcript: "No words came back. Listen to your recording, then try again or type what you said.",
  };
  return messages[code] ?? "The writing service could not finish. Your recording is saved. You can try later or listen and type the words yourself.";
}
