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
    lastDigits: { type: String, default: "" }
  },
  { timestamps: true }
);

export const VoiceRelayCall = mongoose.model("VoiceRelayCall", voiceRelayCallSchema);

