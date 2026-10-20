# Conversation Studio

Conversation Studio is a speaker-friendly data-collection frontend for the iShop permission study. It guides a participant through 40 shopping conversations in English, Nigerian Pidgin, and English–Pidgin, records or transcribes their own words, preserves corrections and natural disfluencies, and provides a separate six-scenario filler diagnostic. It is a research collection tool: it does not execute real shopping actions or run the benchmark model.

## Run locally

Requires Node.js 20.9+.

```sh
npm ci
copy .env.example .env
npm run dev
```

Open `http://localhost:3000`. Use HTTPS or localhost for microphone access.

## Environment variables

Set these in `.env` locally or in Vercel Project Settings. Keep them server-side; never use `NEXT_PUBLIC_` for secrets.

- `COLLECTION_ACCESS_TOKEN` — private invitation code, at least 24 characters.
- `ELEVENLABS_API_KEY` — optional ElevenLabs Scribe transcription key.
- `SAHARA_API_TOKEN` — optional Sahara/Intron speech-recognition token. `SAHARA_API_KEY` and `INTRON_API_KEY` are accepted aliases.
- `BLOB_READ_WRITE_TOKEN` — optional server-only token for the private Vercel Blob autosave path. The app still works with browser storage and manual ZIP downloads when it is unset.
- `NEXT_TELEMETRY_DISABLED=1` — optional telemetry setting.

The participant receives only `COLLECTION_ACCESS_TOKEN`; provider and storage credentials never belong in the form.

## Participant flow

Use `/activities` for the 120 main conversation versions. Use `/filler` after the main conversations for the separate paired comparison: each language version has a clear wording field and a natural hesitation/repetition field. The speaker confirms that the pair preserves the same product, quantity, intent, and permission. Filler answers are saved separately in the browser and can be downloaded as `filler-diagnostic-answers.json`.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The frontend is a standalone Git repository inside `fatima assessment/collector-app` so it can be deployed independently to Vercel.
