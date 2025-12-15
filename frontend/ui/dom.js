function byId(id, { optional = false } = {}) {
    const el = document.getElementById(id);
    if (!el && !optional) {
        throw new Error(`DOM element #${id} not found`);
    }
    return el;
}

function all(selector) {
    return document.querySelectorAll(selector);
}

const dom = {
    fileInput: byId("fileInput"),
    viewerContainer: byId("viewer"),
    issuesEl: byId("issues"),
    clearBtn: byId("clearBtn"),
    statusBubble: byId("statusBubble"),
    issueTitle: byId("issueTitle"),
    issueMeta: byId("issueMeta"),
    issueIndices: byId("issueIndices"),
    prevBtn: byId("prevBtn"),
    nextBtn: byId("nextBtn"),
    showAllBtn: byId("showAllBtn"),
    componentsList: byId("componentsList"),
    showAllComponentsBtn: byId("showAllComponentsBtn"),
    autoLargestInput: byId("autoLargest"),
    railButtons: all(".rail button"),
    panels: all(".panel"),
    toolbar: byId("floatingToolbar", { optional: true }),
    modeToggleBtn: byId("modeToggleBtn"),
    focusBtn: byId("focusBtn"),
    centerBtn: byId("centerBtn"),
    frameBtn: byId("frameBtn"),
    highlightToggleBtn: byId("highlightToggleBtn"),
    clearToolbarBtn: byId("clearToolbarBtn"),
    cameraToolbar: byId("cameraToolbar"),
    inspectToolbar: byId("inspectToolbar"),
    renderToolbar: byId("renderToolbar"),
    summaryWatertight: byId("summaryWatertight"),
    summaryComponents: byId("summaryComponents"),
    summaryFaces: byId("summaryFaces"),
    summaryVertices: byId("summaryVertices"),
    edgeThresholdInput: byId("edgeThreshold"),
    edgeModeSelect: byId("edgeMode"),
    smoothShadingBtn: byId("smoothShading"),
    xrayToggle: byId("xrayToggle"),
    wireframeToggle: byId("wireframeToggle"),
    gridToggle: byId("gridToggle"),
    axesToggle: byId("axesToggle"),
    exposureSlider: byId("exposureSlider"),
    resetViewBtn: byId("resetViewBtn"),
};

export { dom };
