import mongoose from "mongoose";

const discordChannelSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    webhookUrl: { type: String, required: true },
    notifyOnCrisis: { type: Boolean, default: false }
  },
  { timestamps: true }
);

discordChannelSchema.index({ userId: 1, name: 1 }, { unique: true });

export const DiscordChannel = mongoose.model("DiscordChannel", discordChannelSchema);
