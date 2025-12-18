// config.js

export function getAnalyzeUrl() {
    // If the frontend is hosted by the Flask server in production,
    // this can be a relative URL.
    // But during dev (Live Server / python http.server), we need to hit Flask directly.

    const { hostname, protocol } = window.location;

    // If you open index.html directly (file://) or use a static server,
    // default to Flask on port 5000.
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
};

// If you want later: app-level constants (colors, limits, etc.)
export const UI_LIMITS = {
    maxHighlightFaces: 20000,
    maxHighlightEdges: 20000,
};
