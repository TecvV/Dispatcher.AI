import mongoose from "mongoose";

const moodReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    period: { type: String, enum: ["daily", "weekly", "monthly"], required: true, index: true },
    key: { type: String, required: true, index: true },
    avgSentiment: { type: Number, default: 0 },
    distressedCount: { type: Number, default: 0 },
    summary: { type: String, required: true },
    details: {
      totalEntries: { type: Number, default: 0 },
      moodCounts: {
        distressed: { type: Number, default: 0 },
        neutral: { type: Number, default: 0 },
        uplifted: { type: Number, default: 0 },
        crisis: { type: Number, default: 0 }
      },
      swingCount: { type: Number, default: 0 },
      dominantMood: { type: String, default: "neutral" }
    },
    recommendations: { type: [String], default: [] },
    consultAdvice: { type: String, default: "" }
  },
  { timestamps: true }
);

moodReportSchema.index({ userId: 1, period: 1, key: 1 }, { unique: true });

export const MoodReport = mongoose.model("MoodReport", moodReportSchema);
