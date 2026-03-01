import mongoose from "mongoose";

const conversationMemorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    mode: { type: String, enum: ["companion", "service"], default: "companion", index: true },
    text: { type: String, required: true },
    tags: { type: [String], default: [] },
    sentimentScore: { type: Number, default: 0 },
    emotion: { type: String, default: "neutral" }
  },
  { timestamps: true }
);

export const ConversationMemory = mongoose.model("ConversationMemory", conversationMemorySchema);
