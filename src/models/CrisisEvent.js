import mongoose from "mongoose";

const crisisEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    triggerText: { type: String, required: true },
    severity: { type: Number, required: true },
    trustedContactNotified: { type: Boolean, default: false },
    crisisLineOffered: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "resolved"], default: "active" }
  },
  { timestamps: true }
);

export const CrisisEvent = mongoose.model("CrisisEvent", crisisEventSchema);
