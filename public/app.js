const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const pickFileBtn = document.getElementById("pickFileBtn");
const clearBtn = document.getElementById("clearBtn");
const demoModeBtn = document.getElementById("demoModeBtn");
const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
const exportHtmlBtn = document.getElementById("exportHtmlBtn");
const saveSnippetBtn = document.getElementById("saveSnippetBtn");
const searchInput = document.getElementById("searchInput");
const themeSelect = document.getElementById("themeSelect");
const parseModeSelect = document.getElementById("parseModeSelect");
const ocrToggle = document.getElementById("ocrToggle");
const resizeHandle = document.getElementById("resizeHandle");
const onThisPage = document.getElementById("onThisPage");
const snippetList = document.getElementById("snippetList");
const fontSizeRange = document.getElementById("fontSizeRange");
const lineHeightRange = document.getElementById("lineHeightRange");
const contentWidthRange = document.getElementById("contentWidthRange");
const uploadStatus = document.getElementById("uploadStatus");
const docView = document.getElementById("docView");
const docTitle = document.getElementById("docTitle");
const docMeta = document.getElementById("docMeta");
const docContent = document.getElementById("docContent");
const toc = document.getElementById("toc");
const warningId = "docWarning";
const savedStateKey = "nexaDocs.savedState.v1";
const savedModeKey = "nexaDocs.viewMode.v1";
const savedThemeKey = "nexaDocs.theme.v1";
const savedPrefsKey = "nexaDocs.readingPrefs.v1";
const savedSnippetsKey = "nexaDocs.snippets.v1";
const savedParseModeKey = "nexaDocs.parseMode.v1";
const savedOcrKey = "nexaDocs.ocrEnabled.v1";
const modeReal = "real";
const modeDemo = "demo";
let currentMode = modeReal;
let realDocumentState = null;
let pendingGCommand = false;
const fauxSectionNames = [
  "Architecture Overview",
  "Runtime Contracts",
  "Data Ingestion",
  "Service Boundaries",
  "Protocol Mapping",
  "Deployment Flow",
  "Observability Layer",
  "Access Control",
  "Versioning Model",
  "Failure Recovery",
  "Client Integration",
  "Operational Notes",
];

function getFauxLabel(index) {
  const name = fauxSectionNames[index % fauxSectionNames.length];
  return `${name} ${Math.floor(index / fauxSectionNames.length) + 1}`;
}

function buildToc(items) {
  if (!Array.isArray(items) || items.length === 0) {
    toc.innerHTML = "<p class='toc-empty'>No sections found.</p>";
    return;
  }

  toc.innerHTML = items
    .map((item, index) => `<a class="toc-link" href="#${item.id}">${getFauxLabel(index)}</a>`)
    .join("");
}

function relabelPageHeaders() {
  const headers = docContent.querySelectorAll(".doc-page-header h3");
  headers.forEach((header, index) => {
    header.textContent = getFauxLabel(index);
  });
}

function buildOnThisPage() {
  const headings = Array.from(docContent.querySelectorAll("h4[id]"));
  if (!headings.length) {
    onThisPage.innerHTML = "<p class='toc-empty'>No subheadings</p>";
    return;
  }
  onThisPage.innerHTML = headings
    .slice(0, 18)
    .map((h) => `<a class="toc-link" href="#${h.id}">${h.textContent}</a>`)
    .join("");
}

function getDemoDocumentData() {
  return {
    title: "React Runtime Playbook",
    pageCount: 4,
    toc: [
      { id: "demo-arch", label: "Architecture Overview" },
      { id: "demo-render", label: "Rendering Pipeline" },
      { id: "demo-state", label: "State Synchronization" },
      { id: "demo-deploy", label: "Deployment Notes" },
    ],
    contentHtml: `
      <section id="demo-arch" class="doc-page">
        <header class="doc-page-header"><h3>Architecture Overview</h3></header>
        <div class="doc-page-content">
          <h4>Monorepo Surface Area</h4>
          <p>The frontend package exposes route-driven modules with isolated feature flags and stable API adapters for service boundaries.</p>
          <p>Shared linting, testing, and build conventions reduce drift between teams and keep release behavior consistent as modules scale.</p>
          <h4>Component Strategy</h4>
          <p>Composable React primitives and strict prop contracts keep product surfaces predictable under rapid iteration.</p>
          <p>Design tokens are consumed at the component boundary so themes, accessibility modes, and brand updates can ship without refactoring feature logic.</p>
        </div>
      </section>
      <section id="demo-render" class="doc-page">
        <header class="doc-page-header"><h3>Rendering Pipeline</h3></header>
        <div class="doc-page-content">
          <h4>Hydration Workflow</h4>
          <p>Server-rendered shells stream first paint while client hydration progressively attaches interaction handlers for high-priority views.</p>
          <p>Hydration checkpoints are instrumented so slow islands can be identified quickly and deferred behind intent-based interactions.</p>
          <h4>Suspense Boundaries</h4>
          <p>Route-level suspense and prefetch cues minimize loading jank during concurrent transitions.</p>
          <p>Fallback skeletons are scoped to local boundaries to avoid full-screen flashes and maintain perceived continuity during data refreshes.</p>
        </div>
      </section>
      <section id="demo-state" class="doc-page">
        <header class="doc-page-header"><h3>State Synchronization</h3></header>
        <div class="doc-page-content">
          <h4>Cache Invalidation</h4>
          <p>Query keys are namespaced by tenant and environment to avoid stale payload leakage across workspaces.</p>
          <p>Background revalidation policies prioritize active panes first, then opportunistically hydrate adjacent data to keep navigation responsive.</p>
          <h4>Mutation Flow</h4>
          <p>Optimistic updates are rolled back through deterministic snapshots when backend acknowledgements fail.</p>
          <p>Mutation pipelines emit audit events for every stage, making it easier to trace partial failures and replay user intent safely.</p>
        </div>
      </section>
      <section id="demo-deploy" class="doc-page">
        <header class="doc-page-header"><h3>Deployment Notes</h3></header>
        <div class="doc-page-content">
          <h4>Release Gates</h4>
          <p>Preview checks require accessibility scans, smoke tests, and synthetic monitor baselines before production promotion.</p>
          <p>Risk scoring from test flakiness and dependency diffs feeds into release approvals to avoid fragile deploy windows.</p>
          <h4>Observability Hooks</h4>
          <p>Session traces emit standardized client events for incident triage and performance attribution.</p>
          <p>Alert routing maps signals to ownership metadata, reducing time-to-diagnosis when regressions appear after rollout.</p>
        </div>
      </section>
    `,
  };
}

function updateDemoButtonText() {
  demoModeBtn.textContent = currentMode === modeDemo ? "Exit Demo" : "Demo Mode";
}

function removeWarning() {
  const existingWarning = document.getElementById(warningId);
  if (existingWarning) {
    existingWarning.remove();
  }
}

function renderDocument(data) {
  docTitle.textContent = data.title || "Document";
  docMeta.textContent = data.pageCount
    ? `${data.pageCount} internal sections`
    : "No extracted sections";
  buildToc(data.toc);

  removeWarning();
  if (data.warning) {
    const warning = document.createElement("p");
    warning.id = warningId;
    warning.className = "doc-warning";
    warning.textContent = data.warning;
    docContent.parentElement.insertBefore(warning, docContent);
  }

  docContent.innerHTML = data.contentHtml || "";
  relabelPageHeaders();
  buildOnThisPage();
  docView.classList.remove("hidden");
}

function saveState(data) {
  localStorage.setItem(savedStateKey, JSON.stringify(data));
}

function saveMode() {
  localStorage.setItem(savedModeKey, currentMode);
}

function restoreState() {
  currentMode = localStorage.getItem(savedModeKey) || modeReal;
  updateDemoButtonText();
  themeSelect.value = localStorage.getItem(savedThemeKey) || "midnight";
  applyTheme(themeSelect.value);
  parseModeSelect.value = localStorage.getItem(savedParseModeKey) || "strict";
  ocrToggle.checked = localStorage.getItem(savedOcrKey) === "true";
  restoreReadingPrefs();
  restoreSnippets();

  const raw = localStorage.getItem(savedStateKey);
  if (!raw) {
    if (currentMode === modeDemo) {
      renderDocument(getDemoDocumentData());
      uploadStatus.textContent = "Demo mode is active.";
    }
    return;
  }

  try {
    const data = JSON.parse(raw);
    realDocumentState = data;
    if (currentMode === modeDemo) {
      renderDocument(getDemoDocumentData());
      uploadStatus.textContent = "Demo mode is active.";
    } else {
      renderDocument(data);
      uploadStatus.textContent = "Loaded from local storage.";
    }
  } catch {
    localStorage.removeItem(savedStateKey);
  }
}

function clearState() {
  localStorage.removeItem(savedStateKey);
  localStorage.removeItem(savedModeKey);
  currentMode = modeReal;
  realDocumentState = null;
  updateDemoButtonText();
  removeWarning();
  docContent.innerHTML = "";
  docTitle.textContent = "Document";
  docMeta.textContent = "";
  toc.innerHTML = "<p class='toc-empty'>No sections found.</p>";
  docView.classList.add("hidden");
  uploadStatus.textContent = "Cleared. No document loaded.";
}

function saveTheme(theme) {
  localStorage.setItem(savedThemeKey, theme);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
}

function saveReadingPrefs() {
  const prefs = {
    font: Number(fontSizeRange.value),
    line: Number(lineHeightRange.value),
    width: Number(contentWidthRange.value),
  };
  localStorage.setItem(savedPrefsKey, JSON.stringify(prefs));
}

function applyReadingPrefs() {
  document.documentElement.style.setProperty("--reader-font-size", `${fontSizeRange.value}px`);
  document.documentElement.style.setProperty("--reader-line-height", `${Number(lineHeightRange.value) / 10}`);
  document.documentElement.style.setProperty("--reader-width", `${contentWidthRange.value}px`);
  saveReadingPrefs();
}

function restoreReadingPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(savedPrefsKey) || "{}");
    if (prefs.font) {
      fontSizeRange.value = prefs.font;
    }
    if (prefs.line) {
      lineHeightRange.value = prefs.line;
    }
    if (prefs.width) {
      contentWidthRange.value = prefs.width;
    }
  } catch {
    // ignore bad localStorage payload
  }
  applyReadingPrefs();
}

function getSnippets() {
  try {
    return JSON.parse(localStorage.getItem(savedSnippetsKey) || "[]");
  } catch {
    return [];
  }
}

function renderSnippets() {
  const snippets = getSnippets();
  if (!snippets.length) {
    snippetList.innerHTML = "<p class='toc-empty'>No snippets yet.</p>";
    return;
  }
  snippetList.innerHTML = snippets
    .slice(0, 12)
    .map(
      (text, i) =>
        `<button class="snippet-item" data-snippet-index="${i}" type="button">${text.replaceAll("<", "&lt;")}</button>`,
    )
    .join("");
}

function restoreSnippets() {
  renderSnippets();
}

function saveSnippetFromSelection() {
  const selected = window.getSelection().toString().trim().replace(/\s+/g, " ");
  if (!selected || selected.length < 10) {
    uploadStatus.textContent = "Select some text first, then click Save Selection.";
    return;
  }
  const snippets = getSnippets();
  snippets.unshift(selected.slice(0, 220));
  localStorage.setItem(savedSnippetsKey, JSON.stringify(snippets.slice(0, 20)));
  renderSnippets();
  uploadStatus.textContent = "Snippet saved locally.";
}

function exportAsMarkdown() {
  const clone = docContent.cloneNode(true);
  clone.querySelectorAll("h4").forEach((h) => {
    h.textContent = `## ${h.textContent}`;
  });
  const markdown = clone.textContent.replace(/\n{3,}/g, "\n\n").trim();
  navigator.clipboard.writeText(markdown).then(() => {
    uploadStatus.textContent = "Markdown copied to clipboard.";
  });
}

function exportAsHtmlFile() {
  const blob = new Blob(
    [
      "<!doctype html><html><head><meta charset='utf-8'><title>Export</title></head><body>",
      docContent.innerHTML,
      "</body></html>",
    ],
    { type: "text/html" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(docTitle.textContent || "document").replace(/\s+/g, "-").toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
  uploadStatus.textContent = "HTML export downloaded.";
}

function performSearch(term) {
  const query = term.trim().toLowerCase();
  const targets = Array.from(docContent.querySelectorAll("h4, p"));
  targets.forEach((el) => el.classList.remove("search-hit"));
  if (!query) {
    return;
  }
  const firstHit = targets.find((el) => el.textContent.toLowerCase().includes(query));
  targets.forEach((el) => {
    if (el.textContent.toLowerCase().includes(query)) {
      el.classList.add("search-hit");
    }
  });
  if (firstHit) {
    firstHit.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function navigateSections(direction) {
  const sections = Array.from(docContent.querySelectorAll(".doc-page"));
  if (!sections.length) {
    return;
  }
  const viewportMid = window.scrollY + window.innerHeight / 2;
  const index = sections.findIndex((section) => section.offsetTop + section.offsetHeight > viewportMid);
  const next = direction > 0 ? Math.min(sections.length - 1, Math.max(0, index + 1)) : Math.max(0, index - 1);
  sections[next].scrollIntoView({ behavior: "smooth", block: "start" });
}

function isSupportedFile(file) {
  if (!file) {
    return false;
  }
  const lower = file.name.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".docx");
}

async function uploadDocument(file) {
  if (!isSupportedFile(file)) {
    alert("Please upload a PDF or DOCX file.");
    return;
  }

  const formData = new FormData();
  formData.append("document", file);
  formData.append("parseMode", parseModeSelect.value);
  formData.append("ocrEnabled", String(ocrToggle.checked));

  uploadStatus.textContent = "Converting document...";

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      body: formData,
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || `Conversion failed with status ${response.status}.`);
    }
    if (!data) {
      throw new Error("Server returned an unexpected response format.");
    }

    realDocumentState = data;
    saveState(data);
    currentMode = modeReal;
    saveMode();
    updateDemoButtonText();
    renderDocument(data);
    uploadStatus.textContent = "Converted. Saved to local storage.";
  } catch (error) {
    uploadStatus.textContent = "Could not convert the file. Try a text-based PDF or DOCX.";
    alert(error.message);
  }
}

pickFileBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (event) => uploadDocument(event.target.files[0]));
clearBtn.addEventListener("click", clearState);
copyMarkdownBtn.addEventListener("click", exportAsMarkdown);
exportHtmlBtn.addEventListener("click", exportAsHtmlFile);
saveSnippetBtn.addEventListener("click", saveSnippetFromSelection);
searchInput.addEventListener("input", () => performSearch(searchInput.value));
themeSelect.addEventListener("change", () => {
  applyTheme(themeSelect.value);
  saveTheme(themeSelect.value);
});
parseModeSelect.addEventListener("change", () => {
  localStorage.setItem(savedParseModeKey, parseModeSelect.value);
});
ocrToggle.addEventListener("change", () => {
  localStorage.setItem(savedOcrKey, String(ocrToggle.checked));
});
fontSizeRange.addEventListener("input", applyReadingPrefs);
lineHeightRange.addEventListener("input", applyReadingPrefs);
contentWidthRange.addEventListener("input", applyReadingPrefs);
snippetList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-snippet-index]");
  if (!button) {
    return;
  }
  const snippets = getSnippets();
  const text = snippets[Number(button.dataset.snippetIndex)];
  if (text) {
    navigator.clipboard.writeText(text);
    uploadStatus.textContent = "Snippet copied to clipboard.";
  }
});
demoModeBtn.addEventListener("click", () => {
  if (currentMode === modeDemo) {
    currentMode = modeReal;
    saveMode();
    updateDemoButtonText();
    if (realDocumentState) {
      renderDocument(realDocumentState);
      uploadStatus.textContent = "Restored your uploaded document.";
    } else {
      clearState();
    }
    return;
  }

  currentMode = modeDemo;
  saveMode();
  updateDemoButtonText();
  renderDocument(getDemoDocumentData());
  uploadStatus.textContent = "Demo mode is active.";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/") {
    event.preventDefault();
    searchInput.focus();
    return;
  }
  if (event.key.toLowerCase() === "j") {
    navigateSections(1);
  }
  if (event.key.toLowerCase() === "k") {
    navigateSections(-1);
  }
  if (event.key.toLowerCase() === "g") {
    pendingGCommand = true;
    window.setTimeout(() => {
      pendingGCommand = false;
    }, 800);
    return;
  }
  if (pendingGCommand && event.key.toLowerCase() === "t") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    pendingGCommand = false;
  } else if (pendingGCommand && event.key.toLowerCase() === "c") {
    document.querySelector(".doc-sidebar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    pendingGCommand = false;
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  uploadDocument(event.dataTransfer.files[0]);
});

let resizing = false;
resizeHandle.addEventListener("mousedown", () => {
  resizing = true;
  document.body.classList.add("resizing");
});
document.addEventListener("mouseup", () => {
  resizing = false;
  document.body.classList.remove("resizing");
});
document.addEventListener("mousemove", (event) => {
  if (!resizing) {
    return;
  }
  const width = Math.max(200, Math.min(420, event.clientX - 20));
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
});

restoreState();
