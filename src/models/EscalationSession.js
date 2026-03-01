import mongoose from "mongoose";

const transcriptItemSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "listener", "system"], required: true },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const escalationSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listenerId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationListener", required: true, index: true },
    mode: { type: String, enum: ["volunteer", "paid"], required: true },
    secretShopper: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "disputed", "refunded", "released", "blocked"],
      default: "pending",
      index: true
    },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    transcript: { type: [transcriptItemSchema], default: [] },
    userRating: { type: Number, min: 1, max: 5 },
    listenerRating: { type: Number, min: 1, max: 5 },
    userFeedback: { type: String, default: "" },
    listenerFeedback: { type: String, default: "" },
    aiAudit: {
      empathyScore: { type: Number, default: 0 },
      flagged: { type: Boolean, default: false },
      lowEffortSignals: { type: Number, default: 0 },
      summary: { type: String, default: "" }
    },
    escrow: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
      releaseAt: { type: Date },
      status: { type: String, enum: ["none", "held", "released", "refunded"], default: "none" }
    },
    communityReview: {
      shadowedByListenerId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationListener" },
      approved: { type: Boolean },
      note: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

export const EscalationSession = mongoose.model("EscalationSession", escalationSessionSchema);

