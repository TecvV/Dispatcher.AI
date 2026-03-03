import mongoose from "mongoose";

const voiceRelayCallSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true, index: true },
    toNumber: { type: String, required: true },
    message: { type: String, required: true },
    token: { type: String, required: true, index: true },
    callSid: { type: String, default: "" },
    status: { type: String, default: "queued" },
    statusTimeline: [
      {
        status: { type: String, default: "" },
        source: { type: String, default: "system" },
        details: { type: String, default: "" },
        at: { type: Date, default: Date.now }
      }
    ],
    terminalStatus: { type: String, default: "" },
    lastDigits: { type: String, default: "" },
    lastSpeech: { type: String, default: "" },
    turnCount: { type: Number, default: 0 },
    streamSid: { type: String, default: "" },
    mediaPacketCount: { type: Number, default: 0 },
    streamStartedAt: { type: Date, default: null },
    streamStoppedAt: { type: Date, default: null },
    turns: [
      {
        role: { type: String, enum: ["caller", "assistant"], required: true },
        text: { type: String, default: "" },
        at: { type: Date, default: Date.now }
      }
    ],
    intelligenceSummary: { type: String, default: "" },
    intelligenceKeyPoints: [{ type: String }],
    intelligenceExtractedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const VoiceRelayCall = mongoose.model("VoiceRelayCall", voiceRelayCallSchema);

