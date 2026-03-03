import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, index: true, unique: true },
    authProvider: { type: String, enum: ["manual", "google"], default: "manual" },
    phone: { type: String, default: "" },
    passwordHash: { type: String, required: true },
    passwordResetTokenHash: { type: String, default: "" },
    passwordResetExpiresAt: { type: Date, default: null },
    timezone: { type: String, default: "UTC" },
    preferences: {
      topics: { type: [String], default: [] },
      language: { type: String, default: "en" },
      familyGreetingStyle: { type: String, enum: ["auto", "namaste", "hello"], default: "auto" },
      calendarOptIn: { type: Boolean, default: false },
      healthOptIn: { type: Boolean, default: false }
    },
    healthSnapshot: {
      sleepHours: Number,
      restingHeartRate: Number,
      updatedAt: Date
    },
    integrations: {
      googleCalendar: {
        connected: { type: Boolean, default: false },
        accessToken: String,
        refreshToken: String,
        scope: String,
        expiresAt: Date,
        calendarId: { type: String, default: "primary" }
      }
    },
    crisisGuard: {
      awaitingConfirmation: { type: Boolean, default: false },
      askedAt: Date,
      triggerText: String,
      contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact" }
    },
    telegramDraftState: {
      active: { type: Boolean, default: false },
      contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact" },
      details: {
        purpose: { type: String, default: "" },
        date: { type: String, default: "" },
        time: { type: String, default: "" },
        location: { type: String, default: "" },
        contactFullName: { type: String, default: "" },
        invitees: { type: String, default: "" },
        notes: { type: String, default: "" }
      },
      lastUpdatedAt: Date
    },
    discordDraftState: {
      active: { type: Boolean, default: false },
      channelId: { type: mongoose.Schema.Types.ObjectId, ref: "DiscordChannel" },
      details: {
        purpose: { type: String, default: "" },
        date: { type: String, default: "" },
        time: { type: String, default: "" },
        location: { type: String, default: "" },
        contactFullName: { type: String, default: "" },
        invitees: { type: String, default: "" },
        notes: { type: String, default: "" }
      },
      lastUpdatedAt: Date
    },
    voiceCallDraftState: {
      active: { type: Boolean, default: false },
      contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact" },
      lastUpdatedAt: Date
    },
    emailDraftState: {
      active: { type: Boolean, default: false },
      mode: { type: String, default: "general_mail" },
      contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
      lastUpdatedAt: Date
    },
    googleMeetDraftState: {
      active: { type: Boolean, default: false },
      wantsAll: { type: Boolean, default: false },
      pendingContactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
      stage: { type: String, default: null },
      lastUpdatedAt: Date
    },
    pendingMultiActionState: {
      active: { type: Boolean, default: false },
      actions: [{ type: String }],
      targetScope: { type: String, default: null },
      contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Contact" }],
      channelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "DiscordChannel" }],
      lastUpdatedAt: Date
    },
    notifications: [
      {
        title: String,
        message: String,
        createdAt: { type: Date, default: Date.now }
      }
    ],
    mockWallet: {
      balanceInr: { type: Number, default: 1000, min: 0 },
      currency: { type: String, default: "INR" }
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
