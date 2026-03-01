import mongoose from "mongoose";

const listenerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    specialties: { type: [String], default: [] },
    languages: { type: [String], default: ["en"] },
    avgRating: { type: Number, default: 4.5 },
    isAvailable: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Listener = mongoose.model("Listener", listenerSchema);
