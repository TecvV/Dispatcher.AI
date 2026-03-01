import mongoose from "mongoose";

const insightReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    weekKey: { type: String, required: true, index: true },
    insights: { type: [String], default: [] },
    recommendation: String
  },
  { timestamps: true }
);

insightReportSchema.index({ userId: 1, weekKey: 1 }, { unique: true });

export const InsightReport = mongoose.model("InsightReport", insightReportSchema);
