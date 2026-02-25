import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const rowValidator = {
  subject: v.string(),
  number: v.string(),
  days: v.string(),
  start: v.string(),
  duration: v.number(),
  lab: v.optional(v.string()),
  labDays: v.optional(v.string()),
  labStart: v.optional(v.string()),
  labDuration: v.optional(v.number()),
};

export const saveForParticipant = mutation({
  args: {
    participantId: v.id("participants"),
    rows: v.array(v.object(rowValidator)),
  },
  handler: async (ctx, { participantId, rows }) => {
    const allRows = await ctx.db.query("scheduleRows").collect();
    const existing = (allRows as { _id: unknown; participantId: unknown }[]).filter(
      (r) => r.participantId === participantId
    );
    for (const row of existing) {
      await ctx.db.delete(row._id as never);
    }
    for (const r of rows) {
      await ctx.db.insert("scheduleRows", {
        participantId,
        subject: r.subject,
        number: r.number,
        days: r.days,
        start: r.start,
        duration: r.duration,
        lab: r.lab,
        labDays: r.labDays,
        labStart: r.labStart,
        labDuration: r.labDuration,
      });
    }
    return { saved: rows.length };
  },
});

export const getForParticipant = query({
  args: { participantId: v.id("participants") },
  handler: async (ctx, { participantId }) => {
    const all = await ctx.db.query("scheduleRows").collect();
    return (all as { participantId: unknown }[]).filter((r) => r.participantId === participantId);
  },
});

export const getAllForCohort = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("scheduleRows").collect();
  },
});

/** For cohort view: list each course (subject + number) and which participant names have it. */
export const getCoursesWithParticipants = query({
  args: {},
  handler: async (ctx) => {
    const rows = (await ctx.db.query("scheduleRows").collect()) as {
      participantId: unknown;
      subject: string;
      number: string;
    }[];
    const participants = (await ctx.db.query("participants").collect()) as {
      _id: unknown;
      name: string;
    }[];
    const idToName = new Map(participants.map((p) => [String(p._id), p.name]));
    const key = (s: string, n: string) => `${s} ${n}`;
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const name = idToName.get(String(r.participantId));
      if (!name) continue;
      const k = key(r.subject, r.number);
      if (!map.has(k)) map.set(k, []);
      const arr = map.get(k)!;
      if (!arr.includes(name)) arr.push(name);
    }
    return Array.from(map.entries(), ([course, names]) => ({ course, names: names.sort() }));
  },
});
