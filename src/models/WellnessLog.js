import mongoose from "mongoose";

const wellnessLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    source: { type: String, default: "listener_session" },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationBooking", index: true },
    listenerName: { type: String, default: "" },
    summary: { type: String, required: true },
    createdBy: { type: String, default: "ai" }
  },
  { timestamps: true }
);

export const WellnessLog = mongoose.model("WellnessLog", wellnessLogSchema);
