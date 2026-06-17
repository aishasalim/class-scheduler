/*
 * Popup: setup identity → extract schedule → POST import → priority toggles.
 */
(function () {
  const CONFIG = window.ZLP_IMPORT_CONFIG;

  const STORAGE = {
    fullName: "zlp_fullName",
    cohortId: "zlp_cohortId",
    password: "zlp_password",
    lastImport: "zlp_lastImport",
  };

  const setupView = document.getElementById("setup-view");
  const mainView = document.getElementById("main-view");
  const setupTitle = document.getElementById("setup-title");
  const setupSub = document.getElementById("setup-sub");
  const backBtn = document.getElementById("back-btn");
  const nameInput = document.getElementById("name-input");
  const cohortInput = document.getElementById("cohort-input");
  const passwordInput = document.getElementById("password-input");
  const saveSetupBtn = document.getElementById("save-setup-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const identityLine = document.getElementById("identity-line");
  const importBtn = document.getElementById("import-btn");
  const statusEl = document.getElementById("status");
  const coursesSection = document.getElementById("courses-section");
  const courseList = document.getElementById("course-list");
  const endpointEl = document.getElementById("endpoint");

  endpointEl.textContent = CONFIG.IMPORT_ENDPOINT;

  /** @type {{ meetings: object[], priorities: Record<string,string>, participantId?: string, courses?: string[] } | null} */
  let lastImport = null;

  function storageGet(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, resolve);
    });
  }

  function setStatus(kind, message) {
    statusEl.className = kind;
    statusEl.textContent = message;
  }

  function showSetup(isEdit) {
    setupView.classList.remove("hidden");
    mainView.classList.add("hidden");
    setupTitle.textContent = isEdit ? "Settings" : "Welcome";
    setupSub.textContent = isEdit
      ? "Update your name, cohort, or password."
      : "Enter your info once — used for every import.";
    backBtn.classList.toggle("hidden", !isEdit);
  }

  function showMain(identity) {
    setupView.classList.add("hidden");
    mainView.classList.remove("hidden");
    identityLine.textContent = `${identity.fullName} · Cohort ${identity.cohortId}`;
  }

  async function loadIdentity() {
    const data = await storageGet([STORAGE.fullName, STORAGE.cohortId, STORAGE.password, STORAGE.lastImport]);
    const identity = {
      fullName: String(data[STORAGE.fullName] || "").trim(),
      cohortId: String(data[STORAGE.cohortId] || "").trim().toUpperCase(),
      password: String(data[STORAGE.password] || ""),
    };
    lastImport = data[STORAGE.lastImport] || null;
    return identity;
  }

  async function init() {
    const identity = await loadIdentity();
    if (!identity.fullName || !identity.cohortId || !identity.password) {
      nameInput.value = identity.fullName;
      cohortInput.value = identity.cohortId;
      passwordInput.value = identity.password;
      showSetup(false);
      return;
    }
    showMain(identity);
    if (lastImport && Array.isArray(lastImport.courses) && lastImport.courses.length > 0) {
      renderCourses(lastImport.courses, lastImport.priorities || {});
      coursesSection.classList.remove("hidden");
    }
  }

  saveSetupBtn.addEventListener("click", async () => {
    const fullName = nameInput.value.trim();
    const cohortId = cohortInput.value.trim().toUpperCase();
    const password = passwordInput.value;
    if (!fullName || !cohortId || !password) {
      alert("Please fill in full name, cohort, and password.");
      return;
    }
    await storageSet({
      [STORAGE.fullName]: fullName,
      [STORAGE.cohortId]: cohortId,
      [STORAGE.password]: password,
    });
    showMain({ fullName, cohortId, password });
  });

  settingsBtn.addEventListener("click", async () => {
    const identity = await loadIdentity();
    nameInput.value = identity.fullName;
    cohortInput.value = identity.cohortId;
    passwordInput.value = identity.password;
    showSetup(true);
  });

  backBtn.addEventListener("click", () => {
    showMain({
      fullName: nameInput.value.trim(),
      cohortId: cohortInput.value.trim().toUpperCase(),
      password: passwordInput.value,
    });
  });

  function getActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!tabs || !tabs[0]) return reject(new Error("No active tab."));
        resolve(tabs[0]);
      });
    });
  }

  function sendExtract(tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "ZLP_EXTRACT" }, (resp) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(resp);
      });
    });
  }

  async function ensureContentAndExtract(tabId) {
    try {
      const resp = await sendExtract(tabId);
      if (resp) return resp;
    } catch {
      /* inject below */
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["config.js", "content.js"],
    });
    const resp = await sendExtract(tabId);
    if (!resp) throw new Error("Content script did not respond. Is this the schedule page?");
    return resp;
  }

  function defaultPriorities(courses) {
    /** @type {Record<string, string>} */
    const p = {};
    courses.forEach((c) => {
      p[c] = "movable";
    });
    return p;
  }

  function mergePriorities(courses, existing) {
    const p = defaultPriorities(courses);
    Object.keys(existing || {}).forEach((k) => {
      const match = courses.find((c) => c.toUpperCase() === k.toUpperCase());
      if (match && existing[k] === "unmovable") p[match] = "unmovable";
    });
    return p;
  }

  async function postImport(identity, meetings, priorities) {
    const res = await fetch(CONFIG.IMPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetings,
        cohortId: identity.cohortId,
        fullName: identity.fullName,
        password: identity.password,
        priorities,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.ok) {
      throw new Error(data.error || `Import failed (HTTP ${res.status}).`);
    }
    return data;
  }

  function renderCourses(courses, priorities) {
    courseList.innerHTML = "";
    courses.forEach((code) => {
      const isUnmovable = priorities[code] === "unmovable";
      const item = document.createElement("div");
      item.className = "course-item" + (isUnmovable ? " unmovable" : "");
      item.innerHTML = `<span class="course-code">${code}</span>`;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "prio-toggle";
      toggle.textContent = isUnmovable ? "Unmovable" : "Movable";
      toggle.addEventListener("click", () => void togglePriority(code));
      item.appendChild(toggle);
      courseList.appendChild(item);
    });
  }

  async function togglePriority(code) {
    if (!lastImport || !Array.isArray(lastImport.meetings)) return;
    const identity = await loadIdentity();
    const priorities = { ...(lastImport.priorities || {}) };
    priorities[code] = priorities[code] === "unmovable" ? "movable" : "unmovable";

    setStatus("info", "Saving priority…");
    try {
      const data = await postImport(identity, lastImport.meetings, priorities);
      if (!data.ok) throw new Error(data.error || "Save failed.");
      lastImport = {
        ...lastImport,
        priorities,
        participantId: data.participantId,
        courses: data.courses || lastImport.courses,
      };
      await storageSet({ [STORAGE.lastImport]: lastImport });
      renderCourses(lastImport.courses, priorities);
      setStatus("ok", `Saved — ${code} is now ${priorities[code]}.`);
    } catch (err) {
      setStatus("err", err instanceof Error ? err.message : String(err));
    }
  }

  async function runImport() {
    importBtn.disabled = true;
    setStatus("info", "Reading your schedule…");

    try {
      const identity = await loadIdentity();
      if (!identity.fullName || !identity.cohortId || !identity.password) {
        showSetup(false);
        return;
      }

      const tab = await getActiveTab();
      const extract = await ensureContentAndExtract(tab.id);

      if (!extract.ok) {
        setStatus("err", extract.error || "Extraction failed.");
        return;
      }

      const meetings = extract.meetings || [];
      setStatus("info", `Found ${meetings.length} meeting(s). Importing…`);

      const courses = [...new Set(meetings.map((m) => `${m.subject} ${m.number}`.trim()))].sort();
      const priorities = mergePriorities(
        courses,
        lastImport && lastImport.meetings ? lastImport.priorities : {}
      );

      const data = await postImport(identity, meetings, priorities);
      if (!data.ok) {
        let msg = data.error || "Import failed.";
        if (data.warning) msg += `\n\n⚠ ${data.warning}`;
        setStatus("err", msg);
        return;
      }

      lastImport = {
        meetings,
        priorities,
        participantId: data.participantId,
        courses: data.courses || courses,
      };
      await storageSet({ [STORAGE.lastImport]: lastImport });

      renderCourses(lastImport.courses, priorities);
      coursesSection.classList.remove("hidden");

      let msg = `Saved ${data.saved ?? data.rows?.length ?? 0} row(s) for ${identity.fullName}.`;
      if (data.participantCreated) msg += " (New participant created.)";
      setStatus("ok", msg);
    } catch (err) {
      setStatus("err", err instanceof Error ? err.message : String(err));
    } finally {
      importBtn.disabled = false;
    }
  }

  importBtn.addEventListener("click", () => void runImport());
  void init();
})();
