import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  participants: defineTable({
    id: v.string(),
    name: v.string(),
    major: v.string(),
    gender: v.string(),
    birthday: v.string(),
    phone: v.string(),
  }).index("by_id", ["id"]),

  scheduleRows: defineTable({
    participantId: v.id("participants"),
    subject: v.string(),
    number: v.string(),
    days: v.string(),
    start: v.string(),
    duration: v.number(),
    lab: v.optional(v.string()),
    labDays: v.optional(v.string()),
    labStart: v.optional(v.string()),
    labDuration: v.optional(v.number()),
  })
    .index("by_participant", ["participantId"])
    .index("by_course", ["subject", "number"]),
});
