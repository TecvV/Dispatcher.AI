import mongoose from "mongoose";

const carePackageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    items: [
      {
        type: { type: String, enum: ["breathing", "article", "journal_prompt", "micro_habit"], required: true },
        title: String,
        content: String,
        durationMin: Number
      }
    ]
  },
  { timestamps: true }
);

carePackageSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const CarePackage = mongoose.model("CarePackage", carePackageSchema);
