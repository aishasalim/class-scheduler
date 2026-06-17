/*
 * SINGLE SOURCE OF TRUTH for everything site-specific.
 *
 * To adapt this extension to the REAL Aggie Schedule Builder, you should only
 * need to edit this file:
 *   1. Point IMPORT_ENDPOINT at your deployed app (or keep localhost for the demo).
 *   2. Fill in JSON_SOURCES with the real embedded-JSON shape (preferred path).
 *   3. Update SELECTORS so they match the real "Current Schedule" DOM.
 *
 * It is loaded BEFORE content.js, so `window.ZLP_IMPORT_CONFIG` is available there.
 * popup.js reads the same object via chrome.scripting / messaging.
 */
(function () {
  const CONFIG = {
    // Where the extension POSTs the extracted schedule.
    // Dev: localhost. Production: replace with your deployed app URL.
    IMPORT_ENDPOINT: "http://localhost:3000/api/actions/import",
    // IMPORT_ENDPOINT: "https://your-app.example.com/api/actions/import",

    /*
     * PREFERRED PATH — embedded JSON.
     * The real site likely hydrates its calendar from a JS global or an inline
     * <script> JSON blob, or an XHR/fetch response. Reading that is far more
     * robust than scraping the DOM. Describe candidate sources here; content.js
     * tries each in order and bails to DOM scraping if none match.
     *
     * Each source is { kind, ... }:
     *   - { kind: "global", path: "someGlobal.schedule.sections" }
     *   - { kind: "scriptJson", selector: 'script#__DATA__', path: "schedule.sections" }
     *
     * TODO(real-site): inspect the page, find the array of enrolled sections,
     * and add the matching descriptor. Then implement mapJsonMeeting() below.
     */
    JSON_SOURCES: [
      // Example (disabled until the real shape is known):
      // { kind: "global", path: "__ASB_STATE__.currentSchedule.sections" },
      // { kind: "scriptJson", selector: "script#schedule-data", path: "sections" },
    ],

    /*
     * FALLBACK PATH — DOM scraping selectors.
     * These match the bundled mock page out of the box. For the real site,
     * open "Current Schedule", inspect the list/table, and update these.
     */
    SELECTORS: {
      // Container that holds the current (enrolled) schedule list.
      scheduleRoot: "#current-schedule",
      // One element per enrolled course.
      courseRow: ".course-card",
      // Within a courseRow: the "SUBJECT NUMBER" text, e.g. "CSCE 313".
      courseCode: ".course-code",
      // Within a courseRow: one element per weekly meeting line.
      meetingRow: ".meeting",
      // Within a meetingRow: day code text, e.g. "TR" / "MWF".
      meetingDays: ".meeting-days",
      // Within a meetingRow: time range text, e.g. "12:45pm - 2:00pm".
      meetingTime: ".meeting-time",
      // Within a meetingRow: optional "Lecture" / "Lab" label.
      meetingType: ".meeting-type",
    },
  };

  // Expose for content.js (content-script world) and reuse in tests.
  if (typeof window !== "undefined") {
    window.ZLP_IMPORT_CONFIG = CONFIG;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = CONFIG;
  }
})();
