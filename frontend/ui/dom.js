// Grab an element by id; throws if missing unless optional=true.
function byId(id, { optional = false } = {}) {
    const el = document.getElementById(id);
    if (!el && !optional) {
        throw new Error(`DOM element #${id} not found`);
    }
    return el;
}

// Query selector helper returning a static NodeList.
function all(selector) {
    return document.querySelectorAll(selector);
}

const dom = {
    // Lazy getters keep DOM lookups centralized for UI code.
    get fileInput() { return byId("fileInput"); },
    get viewerContainer() { return byId("viewer"); },
    get issuesEl() { return byId("issues"); },
    get issueDetails() { return byId("issueDetails"); },
    get issuesFilterButtons() { return all("#issuesFilter button"); },
    get issuesSearch() { return byId("issuesSearch"); },
    get drawerToggleBtn() { return byId("drawerToggle"); },
    get drawerBackdrop() { return byId("drawerBackdrop"); },
    get contextPanel() { return document.querySelector(".context"); },
    get clearBtn() { return byId("clearBtn"); },
    get statusBubble() { return byId("statusBubble"); },
    get issueTitle() { return byId("issueTitle"); },
    get issueMeta() { return byId("issueMeta"); },
    get issuePageLabel() { return byId("issuePageLabel"); },
    get issueHint() { return document.querySelector("#issueHint"); },
    get issueIndices() { return byId("issueIndices"); },
    get prevBtn() { return byId("prevBtn"); },
    get nextBtn() { return byId("nextBtn"); },
    get showAllBtn() { return byId("showAllBtn"); },
    get componentsList() { return byId("componentsList"); },
    get componentsSearch() { return byId("componentsSearch"); },
    get showAllComponentsBtn() { return byId("showAllComponentsBtn"); },
    get autoLargestInput() { return byId("autoLargest"); },
    get railButtons() { return all(".rail button[data-panel]"); },
    get panels() { return all(".panel"); },
    get toolbar() { return byId("floatingToolbar", { optional: true }); },
    get modeToggleBtn() { return byId("modeToggleBtn"); },
    get focusBtn() { return byId("focusBtn"); },
    get centerBtn() { return byId("centerBtn"); },
    get frameBtn() { return byId("frameBtn"); },
    get highlightToggleBtn() { return byId("highlightToggleBtn"); },
    get clearToolbarBtn() { return byId("clearToolbarBtn"); },
    get cameraToolbar() { return byId("cameraToolbar"); },
    get inspectToolbar() { return byId("inspectToolbar"); },
    get renderToolbar() { return byId("renderToolbar"); },
    get miniStatus() { return byId("miniStatus"); },
    get emptyState() { return byId("emptyState"); },
    get summaryWatertight() { return byId("summaryWatertight"); },
    get summaryComponents() { return byId("summaryComponents"); },
    get summaryFaces() { return byId("summaryFaces"); },
    get summaryVertices() { return byId("summaryVertices"); },
    get edgeThresholdInput() { return byId("edgeThreshold"); },
    get edgeModeSelect() { return byId("edgeMode"); },
    get smoothShadingBtn() { return byId("smoothShading"); },
    get outlineToggle() { return byId("outlineToggle"); },
    get xrayToggle() { return byId("xrayToggle"); },
    get wireframeToggle() { return byId("wireframeToggle"); },
    get gridToggle() { return byId("gridToggle"); },
    get axesToggle() { return byId("axesToggle"); },
    get ssaoToggle() { return byId("ssaoToggle"); },
    get exposureSlider() { return byId("exposureSlider"); },
    get componentModeToggle() { return byId("componentModeToggle"); },
    get resetViewBtn() { return byId("resetViewBtn"); },
};

export { dom };
