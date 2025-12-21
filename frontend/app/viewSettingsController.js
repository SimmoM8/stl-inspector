// Manage viewer view settings: persistence and syncing UI controls.
// Create controller with viewer/dom/state to save, load, and reflect settings.
function createViewSettingsController({ viewer, dom, state }) {
    // Load settings from localStorage into viewer and sync controls.
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

    // Persist current viewer settings to localStorage.
    function saveViewSettings() {
        const current = viewer.getViewSettings();
        localStorage.setItem("stl-view-settings", JSON.stringify(current));
    }

    // Mirror viewer settings into UI toggles/inputs.
    function syncViewControls() {
        const v = viewer.getViewSettings();
        dom.edgeThresholdInput.value = v.edgeThreshold;
        dom.edgeModeSelect.dataset.mode = v.edgeMode;
        dom.smoothShadingBtn.classList.toggle("active", v.cadShading);
        dom.xrayToggle.classList.toggle("active", v.xray);
        dom.wireframeToggle.classList.toggle("active", v.wireframe);
        dom.gridToggle.classList.toggle("active", v.grid);
        dom.axesToggle.classList.toggle("active", v.axes);
        dom.outlineToggle.classList.toggle("active", !!v.outlineEnabled);
        dom.ssaoToggle.checked = !!v.ssao;
        dom.exposureSlider.value = v.exposure;
        if (dom.componentModeToggle) dom.componentModeToggle.checked = !!v.componentMode;
        const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
        dom.highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
        dom.highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
    }

    return {
        loadViewSettings,
        saveViewSettings,
        syncViewControls,
    };
}

export { createViewSettingsController };
