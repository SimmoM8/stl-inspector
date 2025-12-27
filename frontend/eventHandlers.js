// eventHandlers.js - Setup for all DOM event listeners

import { getAnalyzeUrl } from "./utils/config.js";
import { EDGE_MODE_ORDER, PREVIEW_DELAY, TIMING } from "./constants/constants.js";
import { debounce } from "./utils/config.js";
import { renderIssueList } from "./uiRefresh.js";

/**
 * Sets up all DOM event listeners for the application.
 * This function centralizes all user interaction handling, including file uploads,
 * button clicks, keyboard shortcuts, and view setting toggles.
 * @param {Object} state - Application state
 * @param {Object} viewer - Viewer instance
 * @param {Object} selectionStore - Selection store instance
 * @param {Object} dom - DOM elements
 * @param {Array} issueButtons - Array of issue buttons
 * @param {Object} componentsController - Components controller instance
 * @param {Object} issuesController - Issues controller instance
 * @param {Object} viewSettingsController - View settings controller instance
 * @param {Object} layoutController - Layout controller instance
 * @param {Object} statusController - Status controller instance
 * @param {Function} triggerRefresh - Callback to refresh UI
 */
export function setupEventHandlers(state, viewer, selectionStore, dom, issueButtons, componentsController, issuesController, viewSettingsController, layoutController, statusController, triggerRefresh) {

    const syncSelectionHighlight = () => issuesController.syncViewerToSelection(selectionStore.getSelection());
    const syncSelectionAndRefresh = () => {
        syncSelectionHighlight();
        triggerRefresh();
    };

    // File upload handler - processes STL files and updates the viewer
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
            state.summary = data.summary || null;

            renderIssueList(state, dom, issueButtons, issuesController.selectIssue, issuesController.toggleGroup, issuesController.previewIssue, issuesController.restoreSelectionHighlight);
            viewer.showAllComponents({ refitCamera: false });
            selectionStore.setSelection(null);
            componentsController.updateComponentOverlays();

        } catch (err) {
            console.error("File upload/analysis error:", err);
            statusController.setStatus("Error: " + err.message);
        }
    });

    // Issues filter buttons - allow filtering issues by severity
    dom.issuesFilterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            state.issueFilter = btn.dataset.filter || "all";
            const selectedIssue = issuesController.getSelectedIssue();
            if (selectedIssue && !issuesController.issueMatchesFilters(selectedIssue)) {
                issuesController.clearSelection();
            }
            renderIssueList(state, dom, issueButtons, issuesController.selectIssue, issuesController.toggleGroup, issuesController.previewIssue, issuesController.restoreSelectionHighlight);
            triggerRefresh();
        });
    });

    // Issues search input - filters issues by search term
    dom.issuesSearch.addEventListener("input", () => {
        state.issuesSearch = dom.issuesSearch.value;
        const selectedIssue = issuesController.getSelectedIssue();
        if (selectedIssue && !issuesController.issueMatchesFilters(selectedIssue)) {
            issuesController.clearSelection();
        }
        renderIssueList(state, dom, issueButtons, issuesController.selectIssue, issuesController.toggleGroup, issuesController.previewIssue, issuesController.restoreSelectionHighlight);
        triggerRefresh();
    });

    // Clear button
    dom.clearBtn.addEventListener("click", issuesController.clearSelection);

    // Navigation buttons for stepping through issues
    dom.prevBtn.addEventListener("click", () => issuesController.moveItem(-1));
    dom.nextBtn.addEventListener("click", () => issuesController.moveItem(1));

    // Show all issues mode toggle
    dom.showAllBtn.addEventListener("click", () => {
        state.mode = "all";
        syncSelectionAndRefresh();
    });

    // Show all components button
    dom.showAllComponentsBtn.addEventListener("click", () => {
        componentsController.clearComponentGhosting();
        componentsController.applyComponentSelection(null);
    });

    // Rail buttons for switching between issues and components panels
    dom.railButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            layoutController.setActivePanel(btn.dataset.panel);
            if (layoutController.isMobile()) layoutController.setDrawerOpen(true);
        });
    });

    // Mobile drawer toggle and backdrop
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

    // Escape key and media query for mobile drawer
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

    // Mode toggle button (step vs all issues)
    dom.modeToggleBtn.addEventListener("click", () => {
        state.mode = state.mode === "all" ? "step" : "all";
        syncSelectionAndRefresh();
    });

    // Camera focus button
    dom.focusBtn.addEventListener("click", () => {
        syncSelectionHighlight();
    });

    // Camera center button
    dom.centerBtn.addEventListener("click", () => {
        viewer.centerView();
    });

    // Camera frame button
    dom.frameBtn.addEventListener("click", () => {
        viewer.frameView();
    });

    // Highlight toggle button
    dom.highlightToggleBtn.addEventListener("click", () => {
        state.highlightEnabled = !state.highlightEnabled;
        syncSelectionAndRefresh();
    });

    // Clear toolbar button
    dom.clearToolbarBtn.addEventListener("click", () => {
        issuesController.clearSelection();
        viewSettingsController.syncViewControls();
    });

    // View settings controls - edge threshold slider
    const debouncedEdgeThresholdUpdate = debounce(() => {
        viewer.setViewSettings({ edgeThreshold: Number(dom.edgeThresholdInput.value) });
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    }, TIMING.DEBOUNCE_DELAY); // debounce 100ms
    dom.edgeThresholdInput.addEventListener("input", debouncedEdgeThresholdUpdate);

    // Edge mode toggle button (cycles through feature, all, off)
    dom.edgeModeSelect.addEventListener("click", () => {
        const current = viewer.getViewSettings().edgeMode || "feature";
        const next = EDGE_MODE_ORDER[(EDGE_MODE_ORDER.indexOf(current) + 1) % EDGE_MODE_ORDER.length];
        viewer.setViewSettings({ edgeMode: next });
        dom.edgeModeSelect.classList.toggle("active", next !== "off");
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Smooth shading toggle
    dom.smoothShadingBtn.addEventListener("click", () => {
        const next = !viewer.getViewSettings().cadShading;
        viewer.setViewSettings({ cadShading: next });
        dom.smoothShadingBtn.classList.toggle("active", next);
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // X-ray mode toggle
    dom.xrayToggle.addEventListener("click", () => {
        const next = !viewer.getViewSettings().xray;
        const payload = { xray: next };
        if (next) payload.wireframe = false;
        viewer.setViewSettings(payload);
        dom.xrayToggle.classList.toggle("active", next);
        dom.wireframeToggle.classList.toggle("active", false);
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Wireframe toggle
    dom.wireframeToggle.addEventListener("click", () => {
        const next = !viewer.getViewSettings().wireframe;
        const payload = { wireframe: next };
        if (next) payload.xray = false;
        viewer.setViewSettings(payload);
        dom.wireframeToggle.classList.toggle("active", next);
        dom.xrayToggle.classList.toggle("active", false);
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Outline toggle
    dom.outlineToggle.addEventListener("click", () => {
        const next = !viewer.getViewSettings().outlineEnabled;
        viewer.setViewSettings({ outlineEnabled: next });
        dom.outlineToggle.classList.toggle("active", next);
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Grid toggle
    dom.gridToggle.addEventListener("click", () => {
        const next = !viewer.getViewSettings().grid;
        viewer.setViewSettings({ grid: next });
        dom.gridToggle.classList.toggle("active", next);
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Axes toggle
    dom.axesToggle.addEventListener("click", () => {
        const next = !viewer.getViewSettings().axes;
        viewer.setViewSettings({ axes: next });
        dom.axesToggle.classList.toggle("active", next);
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // SSAO toggle
    dom.ssaoToggle.addEventListener("change", () => {
        viewer.setViewSettings({ ssao: dom.ssaoToggle.checked });
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Component mode toggle (if available)
    if (dom.componentModeToggle) {
        dom.componentModeToggle.addEventListener("change", () => {
            viewer.setViewSettings({ componentMode: dom.componentModeToggle.checked });
            syncSelectionHighlight();
            viewSettingsController.saveViewSettings();
        });
    }

    // Exposure slider
    const debouncedExposureUpdate = debounce(() => {
        viewer.setViewSettings({ exposure: Number(dom.exposureSlider.value) });
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    }, TIMING.DEBOUNCE_DELAY); // debounce 100ms
    dom.exposureSlider.addEventListener("input", debouncedExposureUpdate);

    // Reset view settings button
    dom.resetViewBtn.addEventListener("click", () => {
        viewer.resetViewSettings();
        viewSettingsController.syncViewControls();
        syncSelectionHighlight();
        viewSettingsController.saveViewSettings();
    });

    // Keyboard shortcuts for navigation and actions
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
}
