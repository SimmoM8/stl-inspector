// utils/config.js - Utility functions and configuration

// Build the API endpoint for analysis; use in fetch calls to backend.
export function getAnalyzeUrl() {
    // Vite dev server: use proxy relative path to avoid CORS.
    // Check for Vite dev environment (only available in Vite)
    let isViteDev = false;
    try {
        isViteDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;
    } catch (e) {
        // In test environment, import.meta might not be available
        isViteDev = false;
    }
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

// Utility function to debounce function calls
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
