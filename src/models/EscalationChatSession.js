import mongoose from "mongoose";

const escalationChatSessionSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationBooking", required: true, unique: true, index: true },
    speakerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listenerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    scheduledAt: { type: Date, required: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    retentionExpiry: { type: Date, index: true },
    speakerPurgedAt: { type: Date },
    listenerAccessRevokedAt: { type: Date },
    status: {
      type: String,
      enum: ["scheduled", "active", "ended", "purged"],
      default: "scheduled",
      index: true
    },
    takeawaySummary: { type: String, default: "" }
  },
  { timestamps: true }
);

export const EscalationChatSession = mongoose.model("EscalationChatSession", escalationChatSessionSchema);

