<div align="center">

<br/>

# 🧠 Dispatcher.AI
### *Agentic Mental-Wellness & Outreach Platform*

**Companion. Crisis Guard. Dispatcher. All in one intelligent system.**

<br/>

![AI Powered](https://img.shields.io/badge/Agentic_AI-6366F1?style=for-the-badge&logoColor=white)
![Crisis Aware](https://img.shields.io/badge/Crisis_Detection-DC2626?style=for-the-badge&logoColor=white)
![Voice AI](https://img.shields.io/badge/AI_Voice_Calls-0F172A?style=for-the-badge&logoColor=white)
![Multi Channel](https://img.shields.io/badge/Multi--Channel_Dispatch-0EA5E9?style=for-the-badge&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph_+_Mem0-10B981?style=for-the-badge&logoColor=white)

<br/>

</div>

---

## 🌟 Flagship Features

### 🎙️ AI Voice Assistant + Call Intelligence
- AI voice relay calls via **Twilio** with realtime pipeline (**Deepgram STT + ElevenLabs TTS**)
- Voice-call script generation and dispatch from the Dispatch Console
- Contact-side conversational handling via LLM during live calls
- Live call status tracking — ringing, in-progress, terminal states
- Post-call intelligence extraction:
  - Message sent via agent
  - Key ideas captured from the contact-side conversation
  - Logs persisted and surfaced in *"Call Logs managed by AI Voice Agent"*
- Call logs deletable from UI + backend

### 🚨 Crisis Detection & Automated Outreach
- Semantic crisis triage — LLM-based, fully context-aware
- Distinguishes high-risk vs neutral/non-crisis signals
- Crisis guard flow triggers automated outreach across all configured channels:
  - Contacts marked `notifyOnCrisis` receive immediate outreach
  - Discord channels marked `notifyOnCrisis` receive live alerts
  - Voice calls are attempted for crisis contacts with phone numbers
- Crisis support tips and escalation-safe responses integrated into the chat flow
- Safety-first response behavior — avoids fabricated certainty, provides emergency-safe guidance

---

## 🤖 Multi-Agent Voice Communication *(AI Voice Listener)*

> A real-time AI voice system that lets users communicate over phone calls in **Hinglish (Hindi + English)** — no human listener required. Replaces the escalation flow when needed.

### 🔁 How the Pipeline Works
```
Twilio (Live Call) → Streaming STT → LLM Agent → Streaming TTS → Back to Caller
```

| Stage | What Happens |
|---|---|
| 📞 **Twilio** | Handles the phone call and streams live audio |
| 🗣️ **Streaming STT** | Converts caller's voice to text in real time (Hindi + English) |
| 🧠 **LLM Agent** | Processes each utterance, understands intent, generates safe responses |
| 🔊 **Streaming TTS** | Converts AI reply to speech and sends it back instantly — same call |

The system adapts conversationally — handles follow-up questions, clarifications, and ends the call gracefully when appropriate.

### 🧩 Multi-Agent Behavior
- Not a "dumb relay" — behaves as a genuine **listener and responder**
- Resolves user doubts and gives factual responses
- When knowledge is unavailable, states: *"I don't know this yet, I'll confirm with the user and update you"*
- **Previous call history is fetched and used to inform the current ongoing conversation** — continuity across sessions

### 🌐 Hinglish Support
- STT + TTS stack configured for seamless **Hindi/English language switching**
- AI responds naturally in Hinglish — not rigidly locked to one language

### 🎭 Role-Based Voice Personas

The voice agent automatically adjusts its tone based on contact type or explicit user selection:

| Persona | Tone |
|---|---|
| 🎯 **Coach / Guide** | Supportive, structured, goal-oriented |
| 😊 **Friend / Casual** | Informal, empathetic, light |
| 💞 **GF / BF / Spouse** | Warm, respectful, lightly romantic |
| 🩺 **Professional** (Doctor/Psychiatrist) | Formal, concise, respectful |
| 🚨 **Crisis Outreach** | Calm, direct, action-oriented |

Role is selected automatically from contact metadata or manually by the user — ensuring every call feels appropriate for the relationship context.

### 🛡️ Safety + Intelligence Layer
- Every call is **logged and summarized** post-completion
- AI extracts key ideas spoken by the contact (not the user) — displayed under **Call Intelligence**
- Live call status tracked: `ringing` → `answered` → `in-progress` → `disconnected`

### 💡 Why This Matters
- ♾️ Scales infinitely — no human listeners needed
- 🕐 Works 24/7 with consistent, reliable quality
- 🔒 Keeps sensitive conversations private while still generating useful summaries

---

## 📋 Full Feature List

### 🔐 Authentication & Account Management
- Manual signup/login with JWT session flow
- Google OAuth login/signup
- Existing-account conflict handling for OAuth scenarios
- Forgot password flow with reset token validation and user-defined new password
- Password change from top navigation
- Show/hide password controls on all auth screens

### 🖥️ UI / UX Structure
- Red/black themed responsive UI
- Dedicated pages: `/login`, `/dashboard`, `/chat`, `/escalation`, `/reset-password`
- Unified top-nav for all authenticated sections
- Live status/notification widget + dialog-based interaction patterns

### 📊 Dashboard
- **Trusted Contact Management** — add/edit/remove contacts with fields: name, email, phone, Telegram ID, type, crisis-notify flag. Contact types: doctor, psychiatrist, family, friend, BF/GF/spouse, custom
- **Discord Channel Management** — add/remove webhook channels with per-channel crisis notify toggle
- **Google Integration Panel** — connect/disconnect Google account; Gmail + Calendar integration status
- **Mood Reports** — daily, weekly, monthly generation with human-readable summaries and visual bars
- Notifications feed with booking/response/cancellation text normalization

### 💬 Dispatch Console (Companion Chat)
- Default mode: `General Companion` (Meera — Personalized AI Support Agent)
- Mode selector for: General Companion, Email, Telegram, Discord, Voice Call, Google Meet
- Crisis checks active regardless of selected mode
- Queue-aware message processing with typing/thinking UI
- Typewriter-style response rendering
- Copy-to-clipboard per message
- Conversation snapshot dialog with KPIs and tone trend chart
- Full chat deletion (UI + backend + database)

### 🧠 Companion AI Behavior
- Emotional-support style replies via **LangGraph + Mem0** memory patterns
- Mood/health conversational memory feeds into report generation
- General companion routing separated from operational dispatch workflows

### 📡 Multi-Channel Dispatch

| Channel | Capabilities |
|---|---|
| 📧 **Email** | Draft + send via Gmail, multi-recipient, contact-aware tone |
| ✈️ **Telegram** | Draft + send via bot API, multi-recipient, optional attachments |
| 🎮 **Discord** | Draft + post to multiple webhooks/channels |
| 📞 **Voice Call** | Script generation + automated relay call + intelligence extraction |
| 📅 **Google Meet** | Schedule meetings, create Calendar events, send invites |

### ✍️ Tone & Personalization
- LLM rewrite flow for all dispatch messages
- Contact-type-sensitive message style
- Multi-recipient formalization behavior
- Relationship-aware communication constraints

### 📎 Attachments & Input Utilities
- Multiple attachments per dispatch workflow
- Mic input support — speech-to-text captured directly into the message box

### 🤝 Escalation Hub (Listener Marketplace)
- Listener application, profile creation, and tier/eligibility metadata
- Open slot publishing by listeners (date/time/fee)
- Speaker discovery of available listener slots
- Booking flow with mode selection (Chat / Google Meet), accept/reject/cancel by either party

### 🔄 Session Lifecycle
- Chat and Google Meet session runtime controls with countdown
- Post-session rating collection: empathy, politeness, patience, engagement, connection, tips quality
- Mandatory rating gating before session close
- Session summaries and wellness takeaways

### 📈 AI Auditing & Analytics
- AI support-quality audit per listener session
- Audit score integrated into session views
- Performance insights dialog with interactive charts
- Session payment settlement proof rendering

### 🔒 Data Retention & Privacy
- Session/chat lifecycle controls and purge paths
- Wellness takeaway generation and retention
- Access boundaries between speaker and listener session data

### 💳 Payments (Mock Wallet + Escrow)
- Mock wallet top-up and balance tracking
- Booking hold in escrow for paid sessions
- Settlement logic: release / refund / partial refund / score-proportional / no-show handling
- Detailed payment status and settlement reason per session

### ⚡ Realtime & Infrastructure
- WebSocket realtime hub for booking/chat/session updates
- Event-driven UI refresh across escalation flows
- Health endpoint `/health` with DB status
- MongoDB persistence across all subsystems

---

## 🗺️ Routes Overview

### API Groups
| Route | Purpose |
|---|---|
| `/api/auth` | Auth, password reset/change, profile identity |
| `/api/oauth` | Google OAuth connect/login/disconnect |
| `/api/users` | Dashboard preferences and integrations |
| `/api/contacts` | Trusted contacts CRUD |
| `/api/discord-channels` | Discord webhook channel CRUD |
| `/api/chat` | Dispatch console messaging, drafts, send actions, call logs |
| `/api/agent` | Check-ins, insights, reports |
| `/api/escalation` | Listener/slot/booking/session/wallet flows |
| `/api/voice` | Twilio voice webhooks, status, turn handlers |
| `/api/listeners` | Listener listing utilities |

### Web Pages
| Path | Page |
|---|---|
| `/` or `/login` | Login |
| `/dashboard` | Dashboard |
| `/chat` | Dispatch Console |
| `/escalation` | Escalation Hub |
| `/reset-password` | Password Reset |

---

## ⚙️ Setup

**1. Create your environment file**
```bash
cp .env.example .env
```

**2. Install dependencies**
```bash
npm install
```

**3. Run the app**
```bash
# Development
npm run dev

# Production
npm start
```

**4. Open in browser**
```
http://localhost:3001/login
```

---

## 🔑 Environment Notes

| Feature | Required Keys |
|---|---|
| Core | MongoDB URI, Auth Secret, Groq API Key + Model |
| Google | OAuth Client ID/Secret + Redirect URI |
| Telegram | Bot Token |
| Discord | Webhook URLs |
| Voice (Relay) | Twilio Account SID + Auth Token |
| Voice (Realtime) | Twilio + Deepgram + ElevenLabs keys |

> Advanced features are toggled via env flags in `src/config/env.js`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM), Express |
| Database | MongoDB + Mongoose |
| AI / Memory | LangGraph, Mem0, Groq LLM API |
| Realtime | WebSocket (`ws`) |
| Voice | Twilio, Deepgram STT, ElevenLabs TTS |
| Integrations | Gmail, Google Calendar, Telegram, Discord |

---

## 📌 Current Scope & Production Notes

The app includes both the wellness companion and dispatch orchestration layers. Before production deployment, the following hardening is recommended:

- OAuth app verification and secure redirect host configuration
- Rate limiting and abuse controls
- Hardened secrets management
- Background job robustness for cleanup and reconciliation

---

<div align="center">

<br/>

*Built with* **Dispatcher.AI** — *because every mind deserves a safety net.*

<br/>

</div>
