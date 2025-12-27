// constants.js - Application-wide constants

// DOM Selectors
export const SELECTORS = {
    VIEWER_CONTAINER: "#viewer",
    FILE_INPUT: "#fileInput",
    ISSUES_EL: "#issues",
    COMPONENTS_LIST: "#componentsList",
    ISSUES_FILTER_BUTTONS: ".issues-filter-btn",
    ISSUES_SEARCH: "#issuesSearch",
    RAIL_BUTTONS: ".rail button",
    DRAWER_TOGGLE: "#drawerToggle",
    DRAWER_BACKDROP: "#drawerBackdrop",
    CONTEXT_PANEL: ".context",
    MODE_TOGGLE_BTN: "#modeToggleBtn",
    FOCUS_BTN: "#focusBtn",
    CENTER_BTN: "#centerBtn",
    FRAME_BTN: "#frameBtn",
    HIGHLIGHT_TOGGLE_BTN: "#highlightToggleBtn",
    CLEAR_BTN: "#clearBtn",
    PREV_BTN: "#prevBtn",
    NEXT_BTN: "#nextBtn",
    SHOW_ALL_BTN: "#showAllBtn",
    SHOW_ALL_COMPONENTS_BTN: "#showAllComponentsBtn",
    CLEAR_TOOLBAR_BTN: "#clearToolbarBtn",
    EDGE_THRESHOLD_INPUT: "#edgeThreshold",
    EDGE_MODE_SELECT: "#edgeModeSelect",
    SMOOTH_SHADING_BTN: "#smoothShadingBtn",
    XRAY_TOGGLE: "#xrayToggle",
    WIREFRAME_TOGGLE: "#wireframeToggle",
    OUTLINE_TOGGLE: "#outlineToggle",
    GRID_TOGGLE: "#gridToggle",
    AXES_TOGGLE: "#axesToggle",
    SSAO_TOGGLE: "#ssaoToggle",
    COMPONENT_MODE_TOGGLE: "#componentModeToggle",
    EXPOSURE_SLIDER: "#exposureSlider",
    RESET_VIEW_BTN: "#resetViewBtn",
    STATUS_BUBBLE: "#statusBubble",
    MINI_STATUS: "#miniStatus",
    EMPTY_STATE: "#emptyState",
    SUMMARY_WATERTIGHT: "#summaryWatertight",
    SUMMARY_COMPONENTS: "#summaryComponents",
    SUMMARY_FACES: "#summaryFaces",
    SUMMARY_VERTICES: "#summaryVertices",
    CAMERA_TOOLBAR: "#cameraToolbar",
    INSPECT_TOOLBAR: "#inspectToolbar",
    RENDER_TOOLBAR: "#renderToolbar",
    PANEL_ISSUES: "#panel-issues",
    PANEL_COMPONENTS: "#panel-components",
};

// CSS Classes
export const CLASSES = {
    ACTIVE: "active",
    HIDDEN: "hidden",
    IS_OPEN: "is-open",
    IS_VISIBLE: "is-visible",
    NO_SCROLL: "no-scroll",
    MOBILE_ONLY: "mobile-only",
    DRAWER_BACKDROP: "drawer-backdrop",
    ICON_BTN: "icon-btn",
    BTN: "btn",
    TOOL_COLUMN: "tool-column",
    RENDER_PANEL: "render-panel",
    SUMMARY_ITEM: "summary-item",
    GROUP: "group",
    GROUP_HEADER: "group-header",
    GROUP_ITEMS: "group-items",
    ISSUE_BTN: "issue-btn",
    COMPONENT_ITEM: "component-item",
    EMPTY_STATE: "empty-state",
    EMPTY_CARD: "empty-card",
    EMPTY_TITLE: "empty-title",
    EMPTY_SUBTITLE: "empty-subtitle",
    MINI_STATUS: "mini-status",
    UPLOAD_PANEL: "upload-panel",
    CONTROL_ROW: "control-row",
    PANEL: "panel",
    RAIL: "rail",
    CONTEXT: "context",
    TOOLBAR: "toolbar",
    STATUS_BUBBLE: "status-bubble",
};

// Other Constants
export const EDGE_MODE_ORDER = ["feature", "all", "off"];
export const PREVIEW_DELAY = 80; // milliseconds

// Default View Settings
export const DEFAULT_VIEW_SETTINGS = {
    edgeThreshold: 12,
    edgeMode: "feature",
    cadShading: true,
    wireframe: false,
    xray: false,
    grid: true,
    axes: true,
    exposure: 1.9,
    ssao: false,
    outlineEnabled: true,
    componentMode: false,
};

// UI Limits
export const UI_LIMITS = {
    maxHighlightFaces: 20000,
    maxHighlightEdges: 20000,
};

// Timing Constants
export const TIMING = {
    DEBOUNCE_DELAY: 100, // ms for input debouncing
};

// Issue Severities
export const SEVERITIES = {
    ERROR: "error",
    WARNING: "warning",
    INFO: "info",
};

// Issue Types
export const ISSUE_TYPES = {
    DEGENERATE_FACES: "degenerate_faces",
    NON_MANIFOLD_EDGES: "non_manifold_edges",
    BOUNDARY_EDGES: "boundary_edges",
    COMPONENTS: "components",
    WATERTIGHT: "watertight",
    INCONSISTENT_NORMALS: "inconsistent_normals",
    NORMAL_CHECK_FAILED: "normal_check_failed",
};

// Material Properties
export const MATERIALS = {
    METALNESS: 0.0,
    ROUGHNESS: 0.8,
    HIGHLIGHT_OPACITY: 0.85,
    EDGE_OPACITY: 0.15,
    COMPONENT_OPACITY: 0.9,
    HIGHLIGHT_LINE_OPACITY: 0.9,
    HIGHLIGHT_FADE_SECONDS: 0.12,
};