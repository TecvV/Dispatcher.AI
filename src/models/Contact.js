import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: "" },
    type: { type: String, default: "other" },
    notifyOnCrisis: { type: Boolean, default: false },
    telegramChatId: { type: String, default: "" },
    discordWebhookUrl: { type: String, default: "" }
  },
  { timestamps: true }
);

contactSchema.index({ userId: 1, email: 1 }, { unique: true });

export const Contact = mongoose.model("Contact", contactSchema);
