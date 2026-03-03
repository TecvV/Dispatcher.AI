# Dispatcher.AI

Dispatcher.AI is a full-stack, agentic mental-wellness and outreach platform with:
- secure auth + dashboard + dispatch console + escalation hub
- AI companion chat with long-term memory
- multi-channel dispatch (Email, Telegram, Discord, Voice Call, Google Meet)
- crisis-aware automation and escalation
- listener marketplace, sessions, ratings, AI auditing, and mock escrow wallet

## Most Important Features

### 1) Crisis Detection and Automated Crisis Outreach (Critical)
- Semantic crisis triage (LLM-based, context-aware).
- Distinguishes high-risk vs non-crisis/neutral queries.
- Crisis guard flow can trigger automated outreach across configured channels.
- Crisis notify targeting:
  - Contacts marked `notifyOnCrisis` receive outreach.
  - Discord channels marked `notifyOnCrisis` receive alerts.
  - Voice calls are attempted for crisis contacts with phone numbers.
- Crisis support text/tips and escalation-safe responses are integrated into chat flow.
- Safety-oriented response behavior:
  - avoids fabricated certainty
  - provides emergency-safe guidance when needed

### 2) AI Voice Assistant + Call Intelligence (Critical)
- AI voice relay calls via Twilio voice routes.
- Realtime voice pipeline support (Deepgram STT + ElevenLabs TTS) when enabled.
- Voice-call script generation and dispatch from the Dispatch Console.
- Contact-side conversational handling via LLM during calls.
- Live call status tracking (ringing, in-progress, terminal states).
- Post-call intelligence extraction:
  - message sent via agent
  - key ideas captured from contact-side conversation
  - logs persisted and shown in “Call Logs managed by AI Voice Agent”
- Call intelligence logs can be deleted from UI + backend.

---

## Full Feature List

## Authentication and Account Management
- Manual signup/login with JWT session flow.
- Google OAuth login/signup flows.
- Existing-account conflict handling for Google signup/login scenarios.
- Forgot password flow:
  - reset token validation
  - user-defined new password (not random password generation)
- Password change trigger from top navigation.
- Login page as default landing page.
- Show/hide password controls in auth/reset screens.

## UI / UX Structure
- Red/black themed responsive UI.
- Separate pages:
  - `/login`
  - `/dashboard`
  - `/chat` (Dispatch Console)
  - `/escalation` (Escalation Hub)
  - `/reset-password`
- Unified top-nav for authenticated sections.
- Live status/notification widget integration.
- Dialog-based interaction patterns in dashboard/chat/escalation.

## Dashboard
- Trusted contact management:
  - add/edit/remove contacts
  - fields: name, email, optional phone, optional Telegram chat ID, type, crisis notify flag
  - contact types include doctor, psychiatrist, family, friend, BF, GF, spouse, custom
- Independent Discord channel management:
  - add/remove webhook channels
  - per-channel crisis notify toggle
- Google integration panel:
  - connect/disconnect Google account
  - Gmail + Calendar integration status
- Mood reports:
  - daily, weekly, monthly generation and rendering
  - human-readable summaries + visual bars
- Notifications feed with booking/response/cancellation text normalization.

## Dispatch Console (Companion Chat)
- Default mode after login: `General Companion`.
- Mode selector workflow for:
  - General Companion
  - Send Email
  - Send Telegram Message
  - Send Message on Discord
  - Voice Call
  - Schedule Google Meet
- Crisis checks remain active regardless of selected mode.
- Queue-aware message processing with typing/thinking UI.
- Typewriter-style response rendering and status feedback.
- Copy-to-clipboard for generated outputs and per-message copy affordance.
- Conversation snapshot dialog with KPIs and tone trend chart.
- Entire chat deletion (UI + backend + database route).

## Companion AI Behavior
- Emotional-support style companion replies (Meera: Personalized AI Support Agent).
- LangGraph/Mem0-backed memory patterns for companion context.
- Mood/health conversational memory contributes to report generation.
- General companion routing separated from operational dispatch workflows.

## Multi-Channel Dispatch

### Email
- Draft generation and send via Gmail integration.
- Multi-recipient support.
- Mode-gated workflow from dispatch panel.
- Contact-aware tone handling (LLM-based, context driven).

### Telegram
- Draft and send via bot API.
- Multi-recipient support.
- Auto-generated message notice included.
- Optional attachments pipeline support.

### Discord
- Draft and post to one or multiple configured webhooks/channels.
- Auto-generated message notice behavior.
- Channel-independent from personal contacts.

### Voice Call
- Draft voice relay script and place automated call to selected contact.
- Uses current draft content at send time.
- Call status polling + intelligence extraction pipeline.

### Google Meet
- Meet scheduling workflow with confirmation.
- Google Calendar integration for event/link creation.
- Invite/notification handling for selected recipients.

## Tone and Personalization Rules
- LLM rewrite flow for dispatch messages.
- Contact-type-sensitive message style support.
- Multi-recipient formalization behavior where applicable.
- Relationship-aware communication constraints supported by backend rewrite services.

## Attachments and Input Utilities
- Multiple attachments per dispatch workflow.
- Attachment names surfaced in draft.
- Mic input support for message fields (speech -> text capture).
- Real-time insertion of captured transcript into message box.

## Escalation Hub (Human Escalation / Listener Marketplace)
- Listener application and profile creation.
- Listener profile includes:
  - interests
  - qualification answers
  - rating aggregates
  - eligibility/tier metadata
- Open slot publishing by listeners (date/time/fee).
- Discovery of available listener slots for speakers.
- Booking flow:
  - mode selection (chat / Google Meet)
  - accept/reject by listener
  - cancellation by either party with notifications

## Session Execution and Lifecycle
- Chat session runtime controls and countdown behavior.
- Google Meet session countdown/completion flow.
- Post-session rating collection from speaker:
  - empathy
  - politeness
  - patience
  - engagement
  - connection
  - tips quality
- Mandatory rating gating behavior.
- Session summaries and takeaways in wellness log.

## AI Auditing, Analytics, and Visualizations
- Listener support-quality AI audit.
- AI audit score integrated into session views.
- Session payment settlement proof rendering.
- Performance insights dialog with interactive charts.
- Session visual dashboards and marketplace detail dialogs.

## Data Retention and Privacy Controls
- Session/chat lifecycle controls for escalation chat.
- Purge paths supported for transcript cleanup.
- Wellness takeaway generation and retention path.
- Access boundaries for speaker/listener session data.

## Payments (Mock Wallet + Escrow)
- Mock wallet top-up and balance tracking.
- Booking hold in escrow for paid sessions.
- Settlement logic:
  - release/refund/partial refund
  - score-proportional chat settlement support
  - no-show and completion outcome handling
- Detailed payment status and settlement reason display in sessions.

## Realtime and Infrastructure
- WebSocket realtime hub for booking/chat/session updates.
- Event-driven UI refresh in escalation flows.
- Health endpoint: `/health` with DB status.
- MongoDB persistence across auth/chat/escalation/voice subsystems.

---

## Routes Overview (High-Level)

### Core API groups
- `/api/auth` - auth, password reset/change, profile identity
- `/api/oauth` - Google OAuth connect/login/disconnect flows
- `/api/users` - dashboard and preferences/integrations
- `/api/contacts` - trusted contacts CRUD
- `/api/discord-channels` - Discord webhook channel CRUD
- `/api/chat` - dispatch console messaging, drafts, send actions, call logs
- `/api/agent` - check-ins, insights, reports
- `/api/escalation` - listener/slot/booking/session/wallet flows
- `/api/voice` - Twilio voice webhooks/status/turn handlers
- `/api/listeners` - listener listing utilities

### Web pages
- `/` and `/login` -> login
- `/dashboard` -> dashboard
- `/chat` -> dispatch console
- `/escalation` -> escalation hub
- `/reset-password` -> password reset page

---

## Setup

1. Create `.env` from `.env.example`.
2. Install dependencies:
```bash
npm install
```
3. Run in dev:
```bash
npm run dev
```
or run normally:
```bash
npm start
```
4. Open:
- `http://localhost:3001/login` (or your configured `PORT`)

## Environment Notes
- Required core: MongoDB URI, auth secret, Groq key/model.
- Google features require OAuth client + redirect URI configuration.
- Telegram features require bot token.
- Discord features require webhook URLs.
- Voice features require Twilio config; realtime voice additionally needs Deepgram + ElevenLabs keys/settings.
- Some advanced features are toggled by env flags in `src/config/env.js`.

---

## Tech Stack
- Node.js (ESM), Express
- MongoDB + Mongoose
- LangGraph + Mem0
- WebSocket (`ws`)
- Groq LLM API
- Twilio, Deepgram, ElevenLabs integrations
- Gmail/Google Calendar integrations

---

## Current Scope
- The app currently includes both wellness companion and dispatch orchestration.
- Production hardening still recommended for:
  - OAuth app verification and secure redirect host setup
  - rate limits / abuse controls
  - hardened secrets management
  - background job robustness for cleanup/reconciliation
