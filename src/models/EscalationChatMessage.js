import mongoose from "mongoose";

const escalationChatMessageSchema = new mongoose.Schema(
  {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationBooking", required: true, index: true },
    chatSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationChatSession", required: true, index: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    text: { type: String, required: true },
    expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
  },
  { timestamps: true }
);

export const EscalationChatMessage = mongoose.model("EscalationChatMessage", escalationChatMessageSchema);

