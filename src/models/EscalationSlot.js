import mongoose from "mongoose";

const escalationSlotSchema = new mongoose.Schema(
  {
    listenerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listenerProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationListener", required: true, index: true },
    startAt: { type: Date, required: true, index: true },
    feeInr: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["open", "booked", "closed"], default: "open", index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "EscalationBooking", default: null, index: true },
    bookedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

escalationSlotSchema.index({ listenerUserId: 1, startAt: 1 }, { unique: true });

export const EscalationSlot = mongoose.model("EscalationSlot", escalationSlotSchema);
