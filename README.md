# Binafast

A small collaborative trip planner for 2–3 people. Static site + Firebase (Google sign-in, Firestore) + one Vercel function for AI autofill.

## Setup (once)
1. **Firebase > Authentication > Sign-in method > Google**: enable. Then **Settings > Authorized domains**: add your Vercel domain (e.g. `binafast.vercel.app`).
2. **Firebase > Firestore Database > Rules**: paste `firestore.rules` and **Publish**.
3. **AI autofill** (optional): get a free key at https://aistudio.google.com/apikey, then in Vercel > Project > Settings > Environment Variables add `GEMINI_API_KEY`, and redeploy.
   - Alternative: `ANTHROPIC_API_KEY` (paid). Optional: `GEMINI_MODEL`, `ANTHROPIC_MODEL`, `ALLOWED_EMAILS` (comma-separated; limits who can use autofill).
4. `config.js` holds your Firebase web config (public by design).

## How it works
- Sign in with Google, pick a username, create or join a trip with its link. Only members can read or write the trip.
- Items are tagged with who added them; the Plan view is an untagged day timeline with blocks sized by duration.
- Paste a link or add a screenshot in the Add dialog: `/api/extract` reads it (vision model does OCR + structuring) and prefills the form. You review and Save.
- Settings: theme, language (English / Tiếng Việt), 12/24h, timeline hours, username, CSV export.

## Privacy
Links and screenshots you use with autofill are sent to the AI provider. Gemini's free tier may use content to improve Google products; use a paid key if that matters.

## Files
`index.html`, `styles.css`, `app.js`, `i18n.js`, `config.js`, `api/extract.js`, `firestore.rules`, `vercel.json`.
