import { copyFile, mkdir, readFile } from "node:fs/promises";
const source = new URL("../../collection/scenarios.public.json", import.meta.url);
const target = new URL("../public/scenarios.json", import.meta.url);
await mkdir(new URL("../public", import.meta.url), { recursive: true });
function validate(packet) {
  if (packet.scenarios?.length !== 40) throw new Error("Expected 40 public scenario briefs");
  const encoded = JSON.stringify(packet);
  for (const forbidden of ['"gold"', '"expected_cart"', '"candidate_verdict"']) {
    if (encoded.includes(forbidden)) throw new Error("Private reference fields found: " + forbidden);
  }
}
try {
  const packet = JSON.parse(await readFile(source, "utf8"));
  validate(packet);
  await copyFile(source, target);
  console.log("Copied 40 public scenario briefs; reference answers excluded.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  try {
    const cached = JSON.parse(await readFile(target, "utf8"));
    validate(cached);
    console.log("Using bundled public scenario briefs.");
  } catch { throw error; }
}
