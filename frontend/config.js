// config.js

// Build the API endpoint for analysis; use in fetch calls to backend.
export function getAnalyzeUrl() {
    // Vite dev server: use proxy relative path to avoid CORS.
    const isViteDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
    if (isViteDev) return "/api/analyze";

    // If you open index.html directly (file://) or use a static server,
    // default to Flask on port 5000.
    const { hostname, protocol } = window.location;
    const isFile = protocol === "file:";
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    if (isFile || isLocalhost) {
        return "http://127.0.0.1:5000/api/analyze";
    }

    // When deployed with backend + frontend same origin:
    return "/api/analyze";
}

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

// If you want later: app-level constants (colors, limits, etc.)
export const UI_LIMITS = {
    maxHighlightFaces: 20000,
    maxHighlightEdges: 20000,
};
