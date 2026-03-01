import mongoose from "mongoose";

const listenerMatchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listenerId: { type: mongoose.Schema.Types.ObjectId, ref: "Listener", required: true },
    summary: { type: String, required: true },
    emotionalState: String,
    topics: { type: [String], default: [] },
    status: { type: String, enum: ["initiated", "connected", "closed"], default: "initiated" }
  },
  { timestamps: true }
);

export const ListenerMatch = mongoose.model("ListenerMatch", listenerMatchSchema);
