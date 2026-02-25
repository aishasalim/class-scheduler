"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import OpenAI from "openai";
import { computeBestMeetingTimes, type ScheduleRowInput } from "./zlpCore";

/** Extract schedule rows from a schedule image (base64) using OpenAI vision. Uses OPENAI_API_KEY (or TAMU-provisioned key). */
export const extractScheduleFromImage = action({
  args: { imageBase64: v.string(), mimeType: v.string() },
  handler: async (ctx, { imageBase64, mimeType }): Promise<{ rows: ScheduleRowInput[]; error?: string }> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { rows: [], error: "OPENAI_API_KEY is not set. Use your TAMU API key in .env.local." };
    }
    const client = new OpenAI({ apiKey });
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const prompt = `You are extracting a university class schedule from an image. For each class/section, output the following in a consistent JSON array. Use 24-hour time (HH:MM) for start times. Days: use M T W R F (e.g. MWF, TR).
For each class return: subject (4-letter code, e.g. ECEN, MEEN), number (e.g. 214 or 214L), days, start, duration (minutes). If the class has an associated lab section on other days/times, also include: lab ("Y"), labDays, labStart, labDuration.
Return ONLY a valid JSON array of objects with keys: subject, number, days, start, duration, and optionally lab, labDays, labStart, labDuration. No markdown, no explanation. Example:
[{"subject":"ECEN","number":"214","days":"MWF","start":"09:10","duration":50},{"subject":"MEEN","number":"221","days":"TR","start":"11:10","duration":75,"lab":"Y","labDays":"R","labStart":"15:00","labDuration":170}]`;

    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Data}` },
              },
            ],
          },
        ],
        max_tokens: 4096,
      });
      const content = response.choices[0]?.message?.content?.trim() ?? "";
      let jsonStr = content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>[];
      const rows: ScheduleRowInput[] = parsed.map((item: Record<string, unknown>) => ({
        subject: String(item.subject ?? "").trim().toUpperCase(),
        number: String(item.number ?? "").trim(),
        days: String(item.days ?? "").trim().toUpperCase().replace(/TH/g, "R"),
        start: String(item.start ?? "").trim(),
        duration: Number(item.duration) || 50,
        lab: item.lab != null ? String(item.lab) : undefined,
        labDays: item.labDays != null ? String(item.labDays).toUpperCase() : undefined,
        labStart: item.labStart != null ? String(item.labStart) : undefined,
        labDuration: item.labDuration != null ? Number(item.labDuration) : undefined,
      }));
      return { rows };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { rows: [], error: message };
    }
  },
});

/** Compute best 100-minute meeting times from all cohort schedule rows in the DB. */
export const getBestMeetingTimes = action({
  args: {},
  handler: async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await ctx.runQuery(api.scheduleRows.getAllForCohort as any);
    const input: ScheduleRowInput[] = (rows as { subject: string; number: string; days: string; start: string; duration: number; lab?: string; labDays?: string; labStart?: string; labDuration?: number }[]).map((r) => ({
      subject: r.subject,
      number: r.number,
      days: r.days,
      start: r.start,
      duration: r.duration,
      lab: r.lab,
      labDays: r.labDays,
      labStart: r.labStart,
      labDuration: r.labDuration,
    }));
    return computeBestMeetingTimes(input);
  },
});
