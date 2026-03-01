import mongoose from "mongoose";

const escalationListenerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    displayName: { type: String, required: true },
    interests: { type: [String], default: [] },
    qualificationAnswers: { type: [String], default: [] },
    tier: { type: String, enum: ["novice", "guide", "master"], default: "novice" },
    probationRequired: { type: Number, default: 5 },
    probationCompleted: { type: Number, default: 0 },
    highSatisfactionCount: { type: Number, default: 0 },
    averageSatisfaction: { type: Number, default: 0 },
    totalRatedSessions: { type: Number, default: 0 },
    aiAuditAverage: { type: Number, default: 0 },
    strikeCount: { type: Number, default: 0 },
    walletUnlocked: { type: Boolean, default: false },
    payoutHoldHours: { type: Number, default: 24 },
    isListeningEnabled: { type: Boolean, default: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const EscalationListener = mongoose.model("EscalationListener", escalationListenerSchema);
