import mongoose from "mongoose";

const escalationBookingSchema = new mongoose.Schema(
  {
    speakerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listenerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listenerProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationListener", required: true, index: true },
    listenerSlotId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationSlot", default: null, index: true },
    scheduledAt: { type: Date, required: true, index: true },
    feeInr: { type: Number, default: 0, min: 0 },
    mode: { type: String, enum: ["chat", "google_meet"], required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "cancelled", "completed"],
      default: "pending",
      index: true
    },
    responseAt: { type: Date },
    responseReason: { type: String, default: "" },
    speakerSessionRating: { type: Number, default: null, min: 0, max: 10 },
    speakerRatingBreakdown: {
      empathy: { type: Number, default: null, min: 0, max: 10 },
      politeness: { type: Number, default: null, min: 0, max: 10 },
      patience: { type: Number, default: null, min: 0, max: 10 },
      engagement: { type: Number, default: null, min: 0, max: 10 },
      connection: { type: Number, default: null, min: 0, max: 10 },
      tipsQuality: { type: Number, default: null, min: 0, max: 10 }
    },
    speakerRatingNotes: { type: String, default: "" },
    payment: {
      amountInr: { type: Number, default: 0, min: 0 },
      escrowAmountInr: { type: Number, default: 0, min: 0 },
      status: {
        type: String,
        enum: ["UNPAID", "PAID_HELD", "RELEASED", "REFUNDED", "PARTIAL_REFUNDED"],
        default: "UNPAID"
      },
      refundedInr: { type: Number, default: 0, min: 0 },
      paidAt: { type: Date, default: null },
      releasedAt: { type: Date, default: null },
      refundedAt: { type: Date, default: null },
      settlementReason: { type: String, default: "" }
    },
    listenerAudit: {
      engagementScore: { type: Number, default: null, min: 0, max: 10 },
      intents: [{ type: String }],
      verdict: { type: String, default: "" },
      notes: { type: String, default: "" },
      evaluatedAt: { type: Date, default: null }
    },
    meet: {
      eventId: { type: String, default: "" },
      htmlLink: { type: String, default: "" },
      meetLink: { type: String, default: "" },
      conferenceId: { type: String, default: "" },
      listenerDwellMinutes: { type: Number, default: null, min: 0 },
      speakerDwellMinutes: { type: Number, default: null, min: 0 },
      speakerJoined: { type: Boolean, default: null },
      attendanceSource: { type: String, default: "" }
    }
  },
  { timestamps: true }
);

export const EscalationBooking = mongoose.model("EscalationBooking", escalationBookingSchema);
