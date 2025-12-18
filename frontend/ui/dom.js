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
    get fileInput() { return byId("fileInput"); },
    get viewerContainer() { return byId("viewer"); },
    get issuesEl() { return byId("issues"); },
    get issueDetails() { return byId("issueDetails"); },
    get clearBtn() { return byId("clearBtn"); },
    get statusBubble() { return byId("statusBubble"); },
    get issueTitle() { return byId("issueTitle"); },
    get issueMeta() { return byId("issueMeta"); },
    get issueIndices() { return byId("issueIndices"); },
    get prevBtn() { return byId("prevBtn"); },
    get nextBtn() { return byId("nextBtn"); },
    get showAllBtn() { return byId("showAllBtn"); },
    get componentsList() { return byId("componentsList"); },
    get showAllComponentsBtn() { return byId("showAllComponentsBtn"); },
    get autoLargestInput() { return byId("autoLargest"); },
    get railButtons() { return all(".rail button"); },
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
    get summaryWatertight() { return byId("summaryWatertight"); },
    get summaryComponents() { return byId("summaryComponents"); },
    get summaryFaces() { return byId("summaryFaces"); },
    get summaryVertices() { return byId("summaryVertices"); },
    get edgeThresholdInput() { return byId("edgeThreshold"); },
    get edgeModeSelect() { return byId("edgeMode"); },
    get smoothShadingBtn() { return byId("smoothShading"); },
    get xrayToggle() { return byId("xrayToggle"); },
    get wireframeToggle() { return byId("wireframeToggle"); },
    get gridToggle() { return byId("gridToggle"); },
    get axesToggle() { return byId("axesToggle"); },
    get ssaoToggle() { return byId("ssaoToggle"); },
    get exposureSlider() { return byId("exposureSlider"); },
    get resetViewBtn() { return byId("resetViewBtn"); },
};

export { dom };
