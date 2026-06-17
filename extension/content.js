/*
 * Content script: extracts the current class schedule from the page.
 *
 * Strategy (layered, fail loudly):
 *   1. extractFromEmbeddedJson()  — preferred, robust. Reads the site's own data
 *      (JS globals / inline <script> JSON). Stubbed via CONFIG.JSON_SOURCES until
 *      the real Aggie Schedule Builder shape is known.
 *   2. extractFromDom()           — fallback. Scrapes the "Current Schedule" list
 *      using CONFIG.SELECTORS (which match the bundled mock page).
 *
 * The result is validated (day codes in M/T/W/R/F, times parse). If validation
 * fails we throw a clear error instead of importing garbage.
 *
 * The popup talks to this script via chrome.runtime messaging.
 */
(function () {
  const CONFIG = window.ZLP_IMPORT_CONFIG;

  // ----- time / day helpers ------------------------------------------------

  /** "12:45pm" -> "12:45" (24h). Returns null if it doesn't look like a time. */
  function to24(raw) {
    const m = String(raw)
      .trim()
      .match(/^(\d{1,2}):(\d{2})\s*([ap]m)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const mer = m[3] ? m[3].toLowerCase() : null;
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }

  /** "12:45pm - 2:00pm" -> { start: "12:45", end: "14:00" } or null. */
  function parseTimeRange(text) {
    const parts = String(text).split(/[-–—]/);
    if (parts.length < 2) return null;
    const start = to24(parts[0]);
    const end = to24(parts[1]);
    if (!start || !end) return null;
    return { start, end };
  }

  /** "TTh"/"Th"/"MWF" -> "TR"/"R"/"MWF" using M T W R F, deduped & ordered. */
  function normalizeDays(code) {
    const up = String(code).toUpperCase().replace(/TH/g, "R");
    const order = "MTWRF";
    const seen = new Set();
    let out = "";
    for (const ch of up) {
      if (order.includes(ch) && !seen.has(ch)) {
        seen.add(ch);
        out += ch;
      }
    }
    // Keep canonical M<T<W<R<F order.
    return order
      .split("")
      .filter((d) => out.includes(d))
      .join("");
  }

  function minutesBetween(start, end) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }

  // ----- layer 1: embedded JSON (preferred) --------------------------------

  function readPath(obj, path) {
    return String(path)
      .split(".")
      .reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
  }

  /**
   * Reads the schedule from the site's own data. Returns RawExtractedMeeting[]
   * or null if no configured source matched.
   *
   * TODO(real-site): once you know the real JSON shape, (a) add descriptors to
   * CONFIG.JSON_SOURCES and (b) implement mapJsonSections() below to convert the
   * site's section objects into RawExtractedMeeting rows.
   */
  function extractFromEmbeddedJson() {
    const sources = CONFIG.JSON_SOURCES || [];
    for (const src of sources) {
      try {
        let data = null;
        if (src.kind === "global") {
          data = readPath(window, src.path);
        } else if (src.kind === "scriptJson") {
          const el = document.querySelector(src.selector);
          if (el && el.textContent) {
            const parsed = JSON.parse(el.textContent);
            data = src.path ? readPath(parsed, src.path) : parsed;
          }
        }
        if (Array.isArray(data) && data.length > 0) {
          const meetings = mapJsonSections(data);
          if (meetings.length > 0) return meetings;
        }
      } catch (err) {
        // Try the next source; JSON-first is best-effort.
        console.warn("[ZLP] JSON source failed:", src, err);
      }
    }
    return null;
  }

  /**
   * Convert the real site's section objects into RawExtractedMeeting[].
   * TODO(real-site): implement against the actual shape. Left empty so the
   * JSON path is a no-op until configured.
   */
  function mapJsonSections(/* sections */) {
    return [];
  }

  // ----- layer 2: DOM scraping (fallback) ----------------------------------

  /** Split "CSCE 313" -> { subject: "CSCE", number: "313" }. */
  function splitCourseCode(text) {
    const m = String(text)
      .trim()
      .match(/^([A-Za-z]{2,4})\s*[- ]?\s*(\d{3,4})/);
    if (!m) return null;
    return { subject: m[1].toUpperCase(), number: m[2] };
  }

  function extractFromDom() {
    const S = CONFIG.SELECTORS;
    const root = document.querySelector(S.scheduleRoot) || document;
    const courseRows = root.querySelectorAll(S.courseRow);
    const meetings = [];

    courseRows.forEach((courseEl) => {
      const codeEl = courseEl.querySelector(S.courseCode);
      const course = codeEl ? splitCourseCode(codeEl.textContent) : null;
      if (!course) return;

      const meetingEls = courseEl.querySelectorAll(S.meetingRow);
      meetingEls.forEach((meetingEl) => {
        const daysEl = meetingEl.querySelector(S.meetingDays);
        const timeEl = meetingEl.querySelector(S.meetingTime);
        const typeEl = meetingEl.querySelector(S.meetingType);
        if (!daysEl || !timeEl) return;

        const days = normalizeDays(daysEl.textContent);
        const range = parseTimeRange(timeEl.textContent);
        if (!days || !range) return;

        const duration = minutesBetween(range.start, range.end);
        const rawType = typeEl ? typeEl.textContent.trim().toLowerCase() : "";
        const meetingType =
          rawType.includes("lab") || (!rawType && duration >= 110)
            ? "lab"
            : "lecture";

        meetings.push({
          subject: course.subject,
          number: course.number,
          days,
          start: range.start,
          end: range.end,
          duration,
          meetingType,
        });
      });
    });

    return meetings;
  }

  // ----- validation --------------------------------------------------------

  /** Throws with a clear message if anything looks wrong. */
  function validate(meetings) {
    if (!Array.isArray(meetings) || meetings.length === 0) {
      throw new Error(
        "Couldn't find any classes on this page. Open the 'Current Schedule' view, " +
          "or adapt config.js SELECTORS to the page you're on."
      );
    }
    const problems = [];
    meetings.forEach((m, i) => {
      const label = `${m.subject || "?"} ${m.number || "?"} (#${i + 1})`;
      if (!/^[A-Z]{2,4}$/.test(m.subject || "")) {
        problems.push(`${label}: bad subject "${m.subject}"`);
      }
      if (!/^\d{3,4}$/.test(m.number || "")) {
        problems.push(`${label}: bad course number "${m.number}"`);
      }
      if (!/^[MTWRF]+$/.test(m.days || "")) {
        problems.push(`${label}: bad day code "${m.days}" (expected M/T/W/R/F)`);
      }
      if (!/^\d{2}:\d{2}$/.test(m.start || "")) {
        problems.push(`${label}: bad start time "${m.start}"`);
      }
      if (m.end != null && !/^\d{2}:\d{2}$/.test(m.end)) {
        problems.push(`${label}: bad end time "${m.end}"`);
      }
      if (!(Number(m.duration) > 0)) {
        problems.push(`${label}: non-positive duration`);
      }
    });
    if (problems.length > 0) {
      throw new Error("Extraction looks wrong:\n- " + problems.join("\n- "));
    }
    return meetings;
  }

  // ----- orchestration -----------------------------------------------------

  function extractSchedule() {
    const fromJson = extractFromEmbeddedJson();
    const meetings = fromJson && fromJson.length > 0 ? fromJson : extractFromDom();
    return {
      source: fromJson && fromJson.length > 0 ? "embedded-json" : "dom",
      meetings: validate(meetings),
    };
  }

  // ----- messaging ---------------------------------------------------------

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "ZLP_EXTRACT") return false;
      try {
        const result = extractSchedule();
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return true; // keep the channel open for the (sync) response
    });
  }

  // Expose for manual debugging in the page console.
  window.__zlpExtractSchedule = extractSchedule;
})();
