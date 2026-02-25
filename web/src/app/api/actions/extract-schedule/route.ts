import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ScheduleRowInput } from "@/lib/zlpCore";

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { rows: [], error: "OPENAI_API_KEY is not set. Set it in .env.local." },
      { status: 200 }
    );
  }
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ rows: [], error: "No image file" }, { status: 400 });
    }
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = file.type || "image/png";

    const client = new OpenAI({ apiKey });
    const prompt = `You are extracting a university class schedule from an image. For each class/section, output the following in a consistent JSON array. Use 24-hour time (HH:MM) for start times. Days: use M T W R F (e.g. MWF, TR).
For each class return: subject (4-letter code, e.g. ECEN, MEEN), number (e.g. 214 or 214L), days, start, duration (minutes). If the class has an associated lab section on other days/times, also include: lab ("Y"), labDays, labStart, labDuration.
Return ONLY a valid JSON array of objects with keys: subject, number, days, start, duration, and optionally lab, labDays, labStart, labDuration. No markdown, no explanation. Example:
[{"subject":"ECEN","number":"214","days":"MWF","start":"09:10","duration":50},{"subject":"MEEN","number":"221","days":"TR","start":"11:10","duration":75,"lab":"Y","labDays":"R","labStart":"15:00","labDuration":170}]`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
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
    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ rows: [], error: message }, { status: 200 });
  }
}
