import mongoose from "mongoose";

const checkInTaskSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    triggerMemoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ConversationMemory" },
    title: { type: String, required: true },
    prompt: { type: String, required: true },
    scheduledFor: { type: Date, required: true, index: true },
    status: { type: String, enum: ["pending", "sent", "cancelled"], default: "pending", index: true },
    sentAt: Date
  },
  { timestamps: true }
);

export const CheckInTask = mongoose.model("CheckInTask", checkInTaskSchema);
