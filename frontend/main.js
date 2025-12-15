import { createViewer } from "./viewer.js";
import { getAnalyzeUrl, DEFAULT_VIEW_SETTINGS } from "./config.js";
import { state, resetState } from "./state.js";

const fileInput = document.getElementById("fileInput");
const viewerContainer = document.getElementById("viewer");
const viewer = createViewer(viewerContainer);
viewer.setViewSettings(DEFAULT_VIEW_SETTINGS);

const issuesEl = document.getElementById("issues");
const clearBtn = document.getElementById("clearBtn");
const statusBubble = document.getElementById("statusBubble");

const issueTitle = document.getElementById("issueTitle");
const issueMeta = document.getElementById("issueMeta");
const issueIndices = document.getElementById("issueIndices");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const showAllBtn = document.getElementById("showAllBtn");
const componentsList = document.getElementById("componentsList");
const showAllComponentsBtn = document.getElementById("showAllComponentsBtn");
const autoLargestInput = document.getElementById("autoLargest");
const railButtons = document.querySelectorAll(".rail button");
const panels = document.querySelectorAll(".panel");
const toolbar = document.getElementById("floatingToolbar");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const focusBtn = document.getElementById("focusBtn");
const centerBtn = document.getElementById("centerBtn");
const frameBtn = document.getElementById("frameBtn");
const highlightToggleBtn = document.getElementById("highlightToggleBtn");
const clearToolbarBtn = document.getElementById("clearToolbarBtn");
const cameraToolbar = document.getElementById("cameraToolbar");
const inspectToolbar = document.getElementById("inspectToolbar");
const renderToolbar = document.getElementById("renderToolbar");
const summaryWatertight = document.getElementById("summaryWatertight");
const summaryComponents = document.getElementById("summaryComponents");
const summaryFaces = document.getElementById("summaryFaces");
const summaryVertices = document.getElementById("summaryVertices");
const edgeThresholdInput = document.getElementById("edgeThreshold");
const edgeModeSelect = document.getElementById("edgeMode");
const smoothShadingBtn = document.getElementById("smoothShading");
const xrayToggle = document.getElementById("xrayToggle");
const wireframeToggle = document.getElementById("wireframeToggle");
const gridToggle = document.getElementById("gridToggle");
const axesToggle = document.getElementById("axesToggle");
const exposureSlider = document.getElementById("exposureSlider");
const resetViewBtn = document.getElementById("resetViewBtn");

resetState();

const issueButtons = [];

function getIssueItems(issue) {
    const faces = Array.isArray(issue.faces) ? issue.faces : [];
    const edges = Array.isArray(issue.edges) ? issue.edges : [];
    if (faces.length) return { kind: "face", items: faces };
    if (edges.length) return { kind: "edge", items: edges };
    return { kind: "none", items: [] };
}

function computeComponents(meshData) {
    const faces = Array.isArray(meshData.faces) ? meshData.faces : [];
    if (!faces.length) return [];

    const adjacency = Array.from({ length: faces.length }, () => []);
    const edgeMap = new Map();

    for (let fi = 0; fi < faces.length; fi++) {
        const [a, b, c] = faces[fi];
        const edges = [
            [a, b],
            [b, c],
            [c, a],
        ];
        for (const [u, v] of edges) {
            const k = u < v ? `${u}-${v}` : `${v}-${u}`;
            if (!edgeMap.has(k)) edgeMap.set(k, []);
            edgeMap.get(k).push(fi);
        }
    }

    // Build adjacency from shared edges
    for (const facesList of edgeMap.values()) {
        if (facesList.length < 2) continue;
        const first = facesList[0];
        for (let i = 1; i < facesList.length; i++) {
            const other = facesList[i];
            adjacency[first].push(other);
            adjacency[other].push(first);
        }
    }

    const visited = new Array(faces.length).fill(false);
    const components = [];

    for (let i = 0; i < faces.length; i++) {
        if (visited[i]) continue;
        const queue = [i];
        const compFaces = [];
        const compVerts = new Set();
        visited[i] = true;
        while (queue.length) {
            const f = queue.pop();
            compFaces.push(f);
            const [a, b, c] = faces[f];
            compVerts.add(a);
            compVerts.add(b);
            compVerts.add(c);
            for (const nbr of adjacency[f]) {
                if (!visited[nbr]) {
                    visited[nbr] = true;
                    queue.push(nbr);
                }
            }
        }
        components.push({
            componentIndex: components.length,
            faceIndices: compFaces,
            counts: {
                numFaces: compFaces.length,
                numVertices: compVerts.size,
            },
        });
    }

    return components;
}

function renderIssuesGrouped(issues) {
    issuesEl.innerHTML = "";
    issueButtons.length = 0;

    const groups = { error: [], warning: [], info: [] };
    issues.forEach((issue, idx) => {
        const sev = (issue.severity || "info").toLowerCase();
        if (!groups[sev]) groups[sev] = [];
        groups[sev].push({ issue, idx });
    });

    function createGroup(sevLabel, items) {
        const sev = sevLabel.toLowerCase();
        const groupDiv = document.createElement("div");
        groupDiv.className = "group";
        const header = document.createElement("div");
        header.className = "group-header";
        header.textContent = `${sevLabel} (${items.length})`;
        const body = document.createElement("div");
        body.className = "group-items";
        body.classList.toggle("hidden", state.collapsedGroups[sev]);
        header.addEventListener("click", () => {
            state.collapsedGroups[sev] = !state.collapsedGroups[sev];
            body.classList.toggle("hidden", state.collapsedGroups[sev]);
        });
        groupDiv.appendChild(header);
        groupDiv.appendChild(body);

        items.forEach(({ issue, idx }) => {
            const btn = document.createElement("button");
            const countText = issue.count != null ? ` (${issue.count})` : "";
            btn.textContent = `${issue.severity.toUpperCase()}: ${issue.type}${countText}`;
            btn.title = issue.message;
            btn.addEventListener("click", () => selectIssue(idx));
            body.appendChild(btn);
            issueButtons.push({ el: btn, index: idx });
        });

        issuesEl.appendChild(groupDiv);
    }

    createGroup("Error", groups.error);
    createGroup("Warning", groups.warning);
    createGroup("Info", groups.info);
}

function updateActiveButtons() {
    issueButtons.forEach((info) => {
        info.el.classList.toggle("active", info.index === state.selectedIndex);
    });
}

function renderDetails(issue, meta) {
    if (!issue) {
        issueTitle.textContent = "No issue selected";
        issueMeta.textContent = "";
        issueIndices.textContent = "";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        showAllBtn.disabled = true;
        return;
    }

    const severity = issue.severity ? issue.severity.toUpperCase() : "INFO";
    issueTitle.textContent = `${severity}: ${issue.type}`;
    const metaParts = [];
    if (issue.message) metaParts.push(issue.message);
    if (issue.count != null) metaParts.push(`Count: ${issue.count}`);
    issueMeta.textContent = metaParts.join(" • ");

    issueIndices.textContent = meta.description;
    prevBtn.disabled = meta.disableNav;
    nextBtn.disabled = meta.disableNav;
    showAllBtn.disabled = false;
}

function renderComponentsList() {
    componentsList.innerHTML = "";
    if (!state.components.length) return;

    state.components.forEach((comp) => {
        const btn = document.createElement("button");
        const facesText = `${comp.counts.numFaces} faces`;
        const vertsText = `${comp.counts.numVertices} verts`;
        btn.textContent = `Component ${comp.componentIndex} (${facesText}, ${vertsText})`;
        btn.classList.toggle("active", state.selectedComponent === comp.componentIndex);
        btn.addEventListener("click", () => {
            applyComponentSelection(comp.componentIndex);
        });
        componentsList.appendChild(btn);
    });
}

function applyComponentSelection(componentIndex) {
    state.selectedComponent = componentIndex;
    const comp = state.components.find((c) => c.componentIndex === componentIndex);
    if (comp) {
        viewer.showComponent(comp.faceIndices);
    } else {
        viewer.showAllComponents();
        state.selectedComponent = null;
    }
    renderSelection();
    renderComponentsList();
    updateToolbarVisibility();
}

function selectLargestComponent() {
    if (!state.components.length) return;
    const largest = state.components.reduce((best, comp) =>
        comp.counts.numFaces > best.counts.numFaces ? comp : best,
        state.components[0]
    );
    applyComponentSelection(largest.componentIndex);
}

function setActivePanel(panelName) {
    state.activePanel = panelName;
    panels.forEach((p) => {
        p.classList.toggle("hidden", p.id !== `panel-${panelName}`);
    });
    railButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.panel === panelName);
    });
}

function updateToolbarVisibility() {
    const hasIssueSelection = state.selectedIndex >= 0;
    const hasComponentSelection = state.selectedComponent !== null;
    if (cameraToolbar) cameraToolbar.classList.toggle("hidden", false); // always visible
    if (inspectToolbar) inspectToolbar.classList.toggle("hidden", !(hasIssueSelection || hasComponentSelection));
    if (renderToolbar) renderToolbar.classList.toggle("hidden", !(hasIssueSelection || hasComponentSelection));
    modeToggleBtn.disabled = !hasIssueSelection;
    prevBtn.disabled = !hasIssueSelection;
    nextBtn.disabled = !hasIssueSelection;
}

function updateSummary(summary) {
    if (summary) {
        summaryWatertight.textContent =
            summary.isWatertight === undefined ? "–" : (summary.isWatertight ? "Yes" : "No");
        summaryComponents.textContent = summary.numComponents ?? "–";
        summaryFaces.textContent = summary.numFaces ?? "–";
        summaryVertices.textContent = summary.numVertices ?? "–";
    }
}

function loadViewSettings() {
    const saved = localStorage.getItem("stl-view-settings");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            viewer.setViewSettings(parsed);
        } catch (e) {
            console.warn("Failed to parse saved view settings", e);
        }
    }
    syncViewControls();
}

let statusTimeout = null;

function saveViewSettings() {
    const current = viewer.getViewSettings();
    localStorage.setItem("stl-view-settings", JSON.stringify(current));
}

function setStatus(message) {
    if (statusBubble) {
        statusBubble.textContent = message || "";
        statusBubble.style.opacity = message ? "1" : "0";
        if (statusTimeout) clearTimeout(statusTimeout);
        if (message) {
            statusTimeout = setTimeout(() => {
                statusBubble.style.opacity = "0";
                statusTimeout = null;
            }, 5000);
        }
    }
}

function syncViewControls() {
    const v = viewer.getViewSettings();
    edgeThresholdInput.value = v.edgeThreshold;
    edgeModeSelect.dataset.mode = v.edgeMode;
    smoothShadingBtn.classList.toggle("active", v.cadShading);
    xrayToggle.classList.toggle("active", v.xray);
    wireframeToggle.classList.toggle("active", v.wireframe);
    gridToggle.classList.toggle("active", v.grid);
    axesToggle.classList.toggle("active", v.axes);
    exposureSlider.value = v.exposure;
    const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
    highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
    highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
}

function renderSelection() {
    const issue = state.issues[state.selectedIndex];
    updateActiveButtons();
    const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
    highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
    highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
    const modeIcon = state.mode === "all" ? "bi-list-check" : "bi-list-ol";
    modeToggleBtn.innerHTML = `<i class="bi ${modeIcon}"></i>`;

    if (!issue) {
        if (state.highlightEnabled) viewer.clearHighlights();
        renderDetails(null, { description: "", pageLabel: "–", disableNav: true });
        return;
    }

    const { kind, items } = getIssueItems(issue);
    const total = items.length;
    const safeIndex = total ? ((state.itemIndex % total) + total) % total : 0;
    state.itemIndex = safeIndex;

    let pageLabel = "–";
    let description = "No indices available for this issue.";
    let disableNav = true;

    if (state.mode === "all") {
        if (state.highlightEnabled) viewer.showIssueAll(issue);
        pageLabel = total ? `All ${total} items` : "All items";
        description = total ? "Highlighting all items for this issue." : description;
        disableNav = total <= 1;
    } else {
        if (kind === "face" && total) {
            const faceIndex = items[safeIndex];
            pageLabel = `Face ${safeIndex + 1} of ${total}`;
            description = `Face index: ${faceIndex}`;
            if (state.highlightEnabled) viewer.showIssueItem(issue, safeIndex);
            disableNav = total <= 1;
        } else if (kind === "edge" && total) {
            const edgePair = items[safeIndex];
            pageLabel = `Edge ${safeIndex + 1} of ${total}`;
            description = `Edge vertices: ${edgePair.join(" - ")}`;
            if (state.highlightEnabled) viewer.showIssueItem(issue, safeIndex);
            disableNav = total <= 1;
        } else {
            if (state.highlightEnabled) viewer.showIssueAll(issue);
        }
    }

    renderDetails(issue, {
        pageLabel,
        description,
        disableNav,
    });

    updateToolbarVisibility();
}

function selectIssue(idx) {
    state.selectedIndex = idx;
    state.itemIndex = 0;
    state.mode = "step";
    renderSelection();
}

function moveItem(delta) {
    state.mode = "step"; // auto-switch to stepping when iterating
    if (state.selectedIndex < 0) return;
    const issue = state.issues[state.selectedIndex];
    const { items } = getIssueItems(issue);
    const total = items.length;
    if (!total) return;
    state.itemIndex = ((state.itemIndex + delta) % total + total) % total;
    renderSelection();
}

renderSelection();
updateToolbarVisibility();
loadViewSettings();
updateSummary(state.summary);
setStatus("");

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setStatus("Uploading and analyzing...");

    try {
        const res = await fetch(getAnalyzeUrl(), {
            method: "POST",
            body: formData,
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        setStatus("Analysis complete");
        viewer.setMeshFromApi(data.mesh);
        viewer.centerView();

        const issues = Array.isArray(data.issues) ? data.issues : [];
        issuesEl.innerHTML = "";
        issueButtons.length = 0;
        state.issues = issues;
        state.selectedIndex = -1;
        state.itemIndex = 0;
        state.mode = "step";
        state.components = computeComponents(data.mesh);
        state.selectedComponent = null;

        state.summary = data.summary || null;

        renderSelection();
        renderComponentsList();
        updateSummary(state.summary);

        renderIssuesGrouped(issues);

        if (autoLargestInput.checked && state.components.length) {
            const largest = state.components.reduce((best, comp) =>
                comp.counts.numFaces > best.counts.numFaces ? comp : best,
                state.components[0]
            );
            applyComponentSelection(largest.componentIndex);
        } else {
            viewer.showAllComponents();
            state.selectedComponent = null;
            renderSelection();
            renderComponentsList();
        }

    } catch (err) {
        setStatus("Error: " + err.message);
    }
});

clearBtn.addEventListener("click", () => {
    viewer.clearHighlights();
    state.selectedIndex = -1;
    state.itemIndex = 0;
    state.mode = "step";
    renderSelection();
});

prevBtn.addEventListener("click", () => moveItem(-1));
nextBtn.addEventListener("click", () => moveItem(1));

showAllBtn.addEventListener("click", () => {
    state.mode = "all";
    renderSelection();
});

showAllComponentsBtn.addEventListener("click", () => {
    state.selectedComponent = null;
    viewer.showAllComponents();
    renderSelection();
    renderComponentsList();
});

autoLargestInput.addEventListener("change", () => {
    if (autoLargestInput.checked) {
        selectLargestComponent();
    }
});

railButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActivePanel(btn.dataset.panel));
});

modeToggleBtn.addEventListener("click", () => {
    state.mode = state.mode === "all" ? "step" : "all";
    renderSelection();
});

focusBtn.addEventListener("click", () => {
    renderSelection(); // re-run focus logic for current selection
});

centerBtn.addEventListener("click", () => {
    viewer.centerView();
});

frameBtn.addEventListener("click", () => {
    viewer.frameView();
});

highlightToggleBtn.addEventListener("click", () => {
    state.highlightEnabled = !state.highlightEnabled;
    const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
    highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
    highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
    if (!state.highlightEnabled) {
        viewer.clearHighlights();
    } else {
        renderSelection();
    }
});

clearToolbarBtn.addEventListener("click", () => {
    viewer.clearHighlights();
    state.selectedIndex = -1;
    state.itemIndex = 0;
    state.mode = "step";
    renderSelection();
    updateToolbarVisibility();
    syncViewControls();
});

edgeThresholdInput.addEventListener("input", () => {
    viewer.setViewSettings({ edgeThreshold: Number(edgeThresholdInput.value) });
    renderSelection();
    saveViewSettings();
});

edgeModeSelect.addEventListener("click", () => {
    const order = ["feature", "all", "off"];
    const current = viewer.getViewSettings().edgeMode || "feature";
    const next = order[(order.indexOf(current) + 1) % order.length];
    viewer.setViewSettings({ edgeMode: next });
    edgeModeSelect.classList.toggle("active", next !== "off");
    renderSelection();
    saveViewSettings();
});

smoothShadingBtn.addEventListener("click", () => {
    const next = !viewer.getViewSettings().cadShading;
    viewer.setViewSettings({ cadShading: next });
    smoothShadingBtn.classList.toggle("active", next);
    renderSelection();
    saveViewSettings();
});

xrayToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().xray;
    const payload = { xray: next };
    if (next) payload.wireframe = false;
    viewer.setViewSettings(payload);
    xrayToggle.classList.toggle("active", next);
    wireframeToggle.classList.toggle("active", false);
    renderSelection();
    saveViewSettings();
});

wireframeToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().wireframe;
    const payload = { wireframe: next };
    if (next) payload.xray = false;
    viewer.setViewSettings(payload);
    wireframeToggle.classList.toggle("active", next);
    xrayToggle.classList.toggle("active", false);
    renderSelection();
    saveViewSettings();
});

gridToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().grid;
    viewer.setViewSettings({ grid: next });
    gridToggle.classList.toggle("active", next);
    renderSelection();
    saveViewSettings();
});

axesToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().axes;
    viewer.setViewSettings({ axes: next });
    axesToggle.classList.toggle("active", next);
    renderSelection();
    saveViewSettings();
});

exposureSlider.addEventListener("input", () => {
    viewer.setViewSettings({ exposure: Number(exposureSlider.value) });
    renderSelection();
    saveViewSettings();
});

resetViewBtn.addEventListener("click", () => {
    viewer.resetViewSettings();
    syncViewControls();
    renderSelection();
    saveViewSettings();
});
