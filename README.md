# Dispatcher.AI Agentic Backend + Web App

This project now includes:

1. Proper auth flow with separate signup/login pages (name is asked only on signup)
2. Separate pages for dashboard (post-login landing) and chat
3. Contact management after login (doctor, psychiatrist, family, friend, other users)
4. Dark-mode UI with dark scrollbars globally
5. Agentic chat actions: distress tips, email draft generation, meet scheduling
6. LangGraph workflow (Triage -> Memory Fetch -> Support) with Mem0 long-term memory

## Setup

1. Fill `.env` from `.env.example`
2. Install dependencies:
```bash
npm install
```
3. Run:
```bash
npm start
```
4. Open:
- `http://localhost:3000/login`
- Dashboard: `http://localhost:3000/dashboard`
- Chat: `http://localhost:3000/chat`

## Core API

### Auth
- `POST /api/auth/signup` `{ name, email, password }`
- `POST /api/auth/login` `{ email, password }`
- `GET /api/auth/me` (Bearer token)

### Contacts
- `GET /api/contacts`
- `POST /api/contacts` `{ name, email, type, notifyOnCrisis }`
- `PATCH /api/contacts/:contactId`
- `DELETE /api/contacts/:contactId`

### User
- `GET /api/users/me/dashboard`
- `PATCH /api/users/me/health`
- `PATCH /api/users/me/preferences`

### Chat/Agent
- `GET /api/chat/history` returns saved chat history for logged-in user
- `POST /api/chat/message` `{ message }`
  - returns `reply`, `tips` (if distressed), `emailDraft`, `gmailDraft`, `meetSuggestion`, and `interactionChoice` when meet intent is ambiguous
  - if meet scheduling is selected, returns `meetClarification` when exact date/time/year is missing, or `meetProposal` for confirmation
- `POST /api/chat/send-gmail-email` `{ draftId }` sends previously created Gmail draft immediately
- `POST /api/chat/schedule-meet` `{ contactId, when }` where `when` is `immediate` or `later`
- `POST /api/chat/confirm-meet` `{ proposalId, confirm }` confirms/cancels a prompt-created meet proposal
- `POST /api/agent/run-checkins`
- `POST /api/agent/me/insight/generate`
- `POST /api/agent/me/insight/schedule-grounding`
- `GET /api/agent/me/reports` returns latest daily+weekly mood reports
- `POST /api/agent/me/reports/generate` generates fresh daily+weekly reports

## Notes

- Crisis outreach uses SMTP email to contacts marked with `notifyOnCrisis=true`.
- Google OAuth is now integrated from Dashboard via `Connect Google Account`.
- Required Google OAuth scopes: Gmail compose/send and Calendar events.
- Configure these env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- Chat history is persisted in MongoDB and loaded when chat page opens.
- Support responses now run through LangGraph state flow with Mem0 long-term memory retrieval.
- Configure `MEM0_API_KEY` (and optionally `MEM0_ENABLED`) to enable managed Mem0 memory.
- Daily and weekly mood reports are generated from conversation memory and include consult escalation guidance.
- Prompt-based meet scheduling now requires exact date+time+year and explicit UI confirmation before booking.
- UI now removes legacy immediate/+2 day meet shortcut buttons and uses prompt-driven choice + confirmation only.
