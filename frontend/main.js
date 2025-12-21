import { createViewer } from "./viewer.js";
import { getAnalyzeUrl, DEFAULT_VIEW_SETTINGS } from "./config.js";
import { state, resetState } from "./state.js";
import { selectionStore } from "./selection/store.js";
import { dom } from "./ui/dom.js";
import {
    renderIssuesGrouped,
    renderComponentsList,
    renderDetails,
    updateActiveButtons,
    updateSummary,
    updateToolbarVisibility,
} from "./ui/render.js";
import { createComponentsController } from "./app/componentsController.js";
import { createIssuesController } from "./app/issuesController.js";
import { createViewSettingsController } from "./app/viewSettingsController.js";
import { createLayoutController } from "./app/layoutController.js";
import { createStatusController } from "./app/statusController.js";

const viewer = createViewer(dom.viewerContainer);
viewer.setViewSettings(DEFAULT_VIEW_SETTINGS);

resetState();
selectionStore.clear();

const issueButtons = [];

const componentsController = createComponentsController({ state, viewer, selectionStore });
const issuesController = createIssuesController({
    state,
    viewer,
    selectionStore,
    dom,
    issueButtons,
    renderDetails,
    updateToolbarVisibility,
    updateActiveButtons,
    renderIssuesGrouped,
});
const viewSettingsController = createViewSettingsController({ viewer, dom, state });
const layoutController = createLayoutController({ dom, state });
const statusController = createStatusController({ dom, state, issuesController });

function renderIssueList() {
    renderIssuesGrouped(
        state,
        dom,
        issueButtons,
        issuesController.selectIssue,
        issuesController.toggleGroup,
        issuesController.previewIssue,
        issuesController.restoreSelectionHighlight
    );
}

function refreshUI() {
    const selection = selectionStore.getSelection();
    issuesController.renderSelection();
    renderComponentsList(state, dom, selection, componentsController.applyComponentSelection, componentsController.setComponentGhosted);
    updateSummary(dom, state.summary);
    updateActiveButtons(selection, issueButtons);
    dom.issuesFilterButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === state.issueFilter);
    });
    if (dom.emptyState) dom.emptyState.classList.toggle("hidden", !!state.summary);
    statusController.updateMiniStatus();
}

componentsController.setOnChange(refreshUI);
issuesController.setOnChange(refreshUI);
selectionStore.subscribe(() => refreshUI());

refreshUI();
viewSettingsController.loadViewSettings();
statusController.setStatus("");
renderIssueList();

dom.fileInput.addEventListener("change", async () => {
    const file = dom.fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    statusController.setStatus("Uploading and analyzing...");

    try {
        const res = await fetch(getAnalyzeUrl(), {
            method: "POST",
            body: formData,
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        statusController.setStatus("Analysis complete");
        viewer.setMeshFromApi(data.mesh);
        viewer.centerView();

        const issues = Array.isArray(data.issues) ? data.issues : [];
        issueButtons.length = 0;
        state.issues = issues;
        state.itemIndex = 0;
        state.mode = "step";
        state.components = componentsController.computeComponents(data.mesh);
        selectionStore.setMesh(data.mesh);
        selectionStore.setComponents(state.components);
        state.componentVisibility = { ghosted: new Set() };
        componentsController.updateComponentOverlays();
        selectionStore.setSelection(null);

        state.summary = data.summary || null;

        renderIssueList();
        refreshUI();

        if (dom.autoLargestInput.checked && state.components.length) {
            componentsController.selectLargestComponent();
        } else {
            viewer.showAllComponents({ refitCamera: false });
            selectionStore.setSelection(null);
            componentsController.updateComponentOverlays();
            refreshUI();
        }

    } catch (err) {
        statusController.setStatus("Error: " + err.message);
    }
});

dom.issuesFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        state.issueFilter = btn.dataset.filter || "all";
        const selectedIssue = issuesController.getSelectedIssue();
        if (selectedIssue && !issuesController.issueMatchesFilters(selectedIssue)) {
            issuesController.clearSelection();
        }
        renderIssueList();
        refreshUI();
    });
});

dom.issuesSearch.addEventListener("input", () => {
    state.issuesSearch = dom.issuesSearch.value;
    const selectedIssue = issuesController.getSelectedIssue();
    if (selectedIssue && !issuesController.issueMatchesFilters(selectedIssue)) {
        issuesController.clearSelection();
    }
    renderIssueList();
    refreshUI();
});

dom.clearBtn.addEventListener("click", issuesController.clearSelection);

dom.prevBtn.addEventListener("click", () => issuesController.moveItem(-1));
dom.nextBtn.addEventListener("click", () => issuesController.moveItem(1));

dom.showAllBtn.addEventListener("click", () => {
    state.mode = "all";
    issuesController.renderSelection();
});

dom.showAllComponentsBtn.addEventListener("click", () => {
    componentsController.clearComponentGhosting();
    componentsController.applyComponentSelection(null);
});

dom.autoLargestInput.addEventListener("change", () => {
    if (dom.autoLargestInput.checked) {
        componentsController.selectLargestComponent();
    }
});

dom.componentsSearch.addEventListener("input", () => {
    state.componentSearch = dom.componentsSearch.value || "";
    refreshUI();
});

dom.railButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        layoutController.setActivePanel(btn.dataset.panel);
        if (layoutController.isMobile()) layoutController.setDrawerOpen(true);
    });
});

if (dom.drawerToggleBtn) {
    dom.drawerToggleBtn.addEventListener("click", () => {
        const isOpen = dom.contextPanel && dom.contextPanel.classList.contains("is-open");
        layoutController.setDrawerOpen(!isOpen);
    });
    layoutController.syncDrawerToggleState();
}

if (dom.drawerBackdrop) {
    dom.drawerBackdrop.addEventListener("click", () => layoutController.setDrawerOpen(false));
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && layoutController.isMobile()) {
        layoutController.setDrawerOpen(false);
    }
});

layoutController.mobileQuery.addEventListener("change", (event) => {
    if (!event.matches) {
        layoutController.setDrawerOpen(false);
    }
    layoutController.syncDrawerToggleState();
});

dom.modeToggleBtn.addEventListener("click", () => {
    state.mode = state.mode === "all" ? "step" : "all";
    issuesController.renderSelection();
});

dom.focusBtn.addEventListener("click", () => {
    issuesController.renderSelection();
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
        issuesController.renderSelection();
    }
});

dom.clearToolbarBtn.addEventListener("click", () => {
    issuesController.clearSelection();
    viewSettingsController.syncViewControls();
});

dom.edgeThresholdInput.addEventListener("input", () => {
    viewer.setViewSettings({ edgeThreshold: Number(dom.edgeThresholdInput.value) });
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.edgeModeSelect.addEventListener("click", () => {
    const order = ["feature", "all", "off"];
    const current = viewer.getViewSettings().edgeMode || "feature";
    const next = order[(order.indexOf(current) + 1) % order.length];
    viewer.setViewSettings({ edgeMode: next });
    dom.edgeModeSelect.classList.toggle("active", next !== "off");
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.smoothShadingBtn.addEventListener("click", () => {
    const next = !viewer.getViewSettings().cadShading;
    viewer.setViewSettings({ cadShading: next });
    dom.smoothShadingBtn.classList.toggle("active", next);
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.xrayToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().xray;
    const payload = { xray: next };
    if (next) payload.wireframe = false;
    viewer.setViewSettings(payload);
    dom.xrayToggle.classList.toggle("active", next);
    dom.wireframeToggle.classList.toggle("active", false);
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.wireframeToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().wireframe;
    const payload = { wireframe: next };
    if (next) payload.xray = false;
    viewer.setViewSettings(payload);
    dom.wireframeToggle.classList.toggle("active", next);
    dom.xrayToggle.classList.toggle("active", false);
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.outlineToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().outlineEnabled;
    viewer.setViewSettings({ outlineEnabled: next });
    dom.outlineToggle.classList.toggle("active", next);
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.gridToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().grid;
    viewer.setViewSettings({ grid: next });
    dom.gridToggle.classList.toggle("active", next);
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.axesToggle.addEventListener("click", () => {
    const next = !viewer.getViewSettings().axes;
    viewer.setViewSettings({ axes: next });
    dom.axesToggle.classList.toggle("active", next);
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.ssaoToggle.addEventListener("change", () => {
    viewer.setViewSettings({ ssao: dom.ssaoToggle.checked });
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

if (dom.componentModeToggle) {
    dom.componentModeToggle.addEventListener("change", () => {
        viewer.setViewSettings({ componentMode: dom.componentModeToggle.checked });
        issuesController.renderSelection();
        viewSettingsController.saveViewSettings();
    });
}

dom.exposureSlider.addEventListener("input", () => {
    viewer.setViewSettings({ exposure: Number(dom.exposureSlider.value) });
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

dom.resetViewBtn.addEventListener("click", () => {
    viewer.resetViewSettings();
    viewSettingsController.syncViewControls();
    issuesController.renderSelection();
    viewSettingsController.saveViewSettings();
});

document.addEventListener("keydown", (event) => {
    const target = event.target;
    const tagName = target && target.tagName ? target.tagName.toLowerCase() : "";
    if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) {
        return;
    }

    switch (event.key) {
        case "ArrowLeft":
        case "j":
        case "J":
            event.preventDefault();
            dom.prevBtn.click();
            break;
        case "ArrowRight":
        case "k":
        case "K":
            event.preventDefault();
            dom.nextBtn.click();
            break;
        case "a":
        case "A":
            event.preventDefault();
            dom.modeToggleBtn.click();
            break;
        case "h":
        case "H":
            event.preventDefault();
            dom.highlightToggleBtn.click();
            break;
        case "c":
        case "C":
            event.preventDefault();
            dom.centerBtn.click();
            break;
        case "f":
        case "F":
            event.preventDefault();
            dom.frameBtn.click();
            break;
        default:
            break;
    }
});
