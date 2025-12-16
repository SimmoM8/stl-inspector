import { createViewer } from "./viewer.js";
import { getAnalyzeUrl, DEFAULT_VIEW_SETTINGS } from "./config.js";
import { state, resetState } from "./state.js";
import { dom } from "./ui/dom.js";
import {
    renderIssuesGrouped,
    renderComponentsList,
    renderDetails,
    updateActiveButtons,
    updateSummary,
    updateToolbarVisibility,
} from "./ui/render.js";

const viewer = createViewer(dom.viewerContainer);
viewer.setViewSettings(DEFAULT_VIEW_SETTINGS);

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
    renderComponentsList(state, dom, applyComponentSelection);
    updateToolbarVisibility(state, dom);
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
    dom.panels.forEach((p) => {
        p.classList.toggle("hidden", p.id !== `panel-${panelName}`);
    });
    dom.railButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.panel === panelName);
    });
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
    if (dom.statusBubble) {
        dom.statusBubble.textContent = message || "";
        dom.statusBubble.style.opacity = message ? "1" : "0";
        if (statusTimeout) clearTimeout(statusTimeout);
        if (message) {
            statusTimeout = setTimeout(() => {
                dom.statusBubble.style.opacity = "0";
                statusTimeout = null;
            }, 5000);
        }
    }
}

function syncViewControls() {
    const v = viewer.getViewSettings();
    dom.edgeThresholdInput.value = v.edgeThreshold;
    dom.edgeModeSelect.dataset.mode = v.edgeMode;
    dom.smoothShadingBtn.classList.toggle("active", v.cadShading);
    dom.xrayToggle.classList.toggle("active", v.xray);
    dom.wireframeToggle.classList.toggle("active", v.wireframe);
    dom.gridToggle.classList.toggle("active", v.grid);
    dom.axesToggle.classList.toggle("active", v.axes);
    dom.exposureSlider.value = v.exposure;
    const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
    dom.highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
    dom.highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
}

function renderSelection() {
    const issue = state.issues[state.selectedIndex];
    updateActiveButtons(state, issueButtons);
    const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
    dom.highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
    dom.highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
    const modeIcon = state.mode === "all" ? "bi-list-check" : "bi-list-ol";
    dom.modeToggleBtn.innerHTML = `<i class="bi ${modeIcon}"></i>`;

    if (!issue) {
        if (state.highlightEnabled) viewer.clearHighlights();
        renderDetails(dom, null, { description: "", pageLabel: "–", disableNav: true });
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

    renderDetails(dom, issue, {
        pageLabel,
        description,
        disableNav,
    });

    updateToolbarVisibility(state, dom);
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
updateToolbarVisibility(state, dom);
loadViewSettings();
updateSummary(dom, state.summary);
setStatus("");

dom.fileInput.addEventListener("change", async () => {
    const file = dom.fileInput.files[0];
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
        dom.issuesEl.innerHTML = "";
        issueButtons.length = 0;
        state.issues = issues;
        state.selectedIndex = -1;
        state.itemIndex = 0;
        state.mode = "step";
        state.components = computeComponents(data.mesh);
        state.selectedComponent = null;

        state.summary = data.summary || null;

        renderSelection();
        renderComponentsList(state, dom, applyComponentSelection);
        updateSummary(dom, state.summary);

        renderIssuesGrouped(state, dom, issueButtons, selectIssue);

        if (dom.autoLargestInput.checked && state.components.length) {
            const largest = state.components.reduce((best, comp) =>
                comp.counts.numFaces > best.counts.numFaces ? comp : best,
                state.components[0]
            );
            applyComponentSelection(largest.componentIndex);
        } else {
            viewer.showAllComponents();
            state.selectedComponent = null;
            renderSelection();
            renderComponentsList(state, dom, applyComponentSelection);
        }

    } catch (err) {
        setStatus("Error: " + err.message);
    }
});

dom.clearBtn.addEventListener("click", () => {
    viewer.clearHighlights();
    state.selectedIndex = -1;
    state.itemIndex = 0;
    state.mode = "step";
    renderSelection();
});

dom.prevBtn.addEventListener("click", () => moveItem(-1));
dom.nextBtn.addEventListener("click", () => moveItem(1));

dom.showAllBtn.addEventListener("click", () => {
    state.mode = "all";
    renderSelection();
});

dom.showAllComponentsBtn.addEventListener("click", () => {
    state.selectedComponent = null;
    viewer.showAllComponents();
    renderSelection();
    renderComponentsList(state, dom, applyComponentSelection);
});

dom.autoLargestInput.addEventListener("change", () => {
    if (dom.autoLargestInput.checked) {
        selectLargestComponent();
    }
});

dom.railButtons.forEach((btn) => {
    btn.addEventListener("click", () => setActivePanel(btn.dataset.panel));
});

dom.modeToggleBtn.addEventListener("click", () => {
    state.mode = state.mode === "all" ? "step" : "all";
    renderSelection();
});

dom.focusBtn.addEventListener("click", () => {
    renderSelection(); // re-run focus logic for current selection
});

dom.centerBtn.addEventListener("click", () => {
    viewer.centerView();
});

dom.frameBtn.addEventListener("click", () => {
    viewer.frameView();
});

dom.highlightToggleBtn.addEventListener("click", () => {
    state.highlightEnabled = !state.highlightEnabled;
    const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
    dom.highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
    dom.highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
    if (!state.highlightEnabled) {
        viewer.clearHighlights();
    } else {
        renderSelection();
    }
});

dom.clearToolbarBtn.addEventListener("click", () => {
    viewer.clearHighlights();
    state.selectedIndex = -1;
    state.itemIndex = 0;
    state.mode = "step";
    renderSelection();
    updateToolbarVisibility(state, dom);
    syncViewControls();
});

dom.edgeThresholdInput.addEventListener("input", () => {
    viewer.setViewSettings({ edgeThreshold: Number(dom.edgeThresholdInput.value) });
    renderSelection();
    saveViewSettings();
});

dom.edgeModeSelect.addEventListener("click", () => {
    const order = ["feature", "all", "off"];
    const current = viewer.getViewSettings().edgeMode || "feature";
    const next = order[(order.indexOf(current) + 1) % order.length];
    viewer.setViewSettings({ edgeMode: next });
    dom.edgeModeSelect.classList.toggle("active", next !== "off");
    renderSelection();
    saveViewSettings();
});

dom.smoothShadingBtn.addEventListener("click", () => {
    const next = !viewer.getViewSettings().cadShading;
    viewer.setViewSettings({ cadShading: next });
    dom.smoothShadingBtn.classList.toggle("active", next);
    renderSelection();
    saveViewSettings();
});

dom.xrayToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().xray;
    const payload = { xray: next };
    if (next) payload.wireframe = false;
    viewer.setViewSettings(payload);
    dom.xrayToggle.classList.toggle("active", next);
    dom.wireframeToggle.classList.toggle("active", false);
    renderSelection();
    saveViewSettings();
});

dom.wireframeToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().wireframe;
    const payload = { wireframe: next };
    if (next) payload.xray = false;
    viewer.setViewSettings(payload);
    dom.wireframeToggle.classList.toggle("active", next);
    dom.xrayToggle.classList.toggle("active", false);
    renderSelection();
    saveViewSettings();
});

dom.gridToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().grid;
    viewer.setViewSettings({ grid: next });
    dom.gridToggle.classList.toggle("active", next);
    renderSelection();
    saveViewSettings();
});

dom.axesToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().axes;
    viewer.setViewSettings({ axes: next });
    dom.axesToggle.classList.toggle("active", next);
    renderSelection();
    saveViewSettings();
});

dom.exposureSlider.addEventListener("input", () => {
    viewer.setViewSettings({ exposure: Number(dom.exposureSlider.value) });
    renderSelection();
    saveViewSettings();
});

dom.resetViewBtn.addEventListener("click", () => {
    viewer.resetViewSettings();
    syncViewControls();
    renderSelection();
    saveViewSettings();
});
