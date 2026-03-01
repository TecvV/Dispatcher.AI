import mongoose from "mongoose";

const meetProposalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true },
    contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
    requestedByText: { type: String, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    timezone: { type: String, default: "UTC" },
    status: { type: String, enum: ["pending", "confirmed", "cancelled"], default: "pending", index: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

export const MeetProposal = mongoose.model("MeetProposal", meetProposalSchema);
