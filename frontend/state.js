// Create a fresh state object for the UI; call when bootstrapping or resetting.
function createDefaultState() {
    return {
        issues: [],
        selection: {
            type: null, // "component" | "issue" | "tool" | null
            id: null,
            bounds: null,
        },
        itemIndex: 0,
        mode: "step",
        components: [],
        highlightEnabled: true,
        summary: null,
        issueFilter: "all",
        issuesSearch: "",
        componentSearch: "",
        componentVisibility: {
            ghosted: new Set(),
        },
        activePanel: "issues",
        collapsedGroups: {
            error: false,
            warning: false,
            info: false,
        },
    };
}

const state = createDefaultState();

// Reset global state in-place while keeping reactive references alive.
function resetState() {
    Object.assign(state, createDefaultState(), {
        componentVisibility: {
            ghosted: new Set(),
        },
    });
}

export { state, resetState };
