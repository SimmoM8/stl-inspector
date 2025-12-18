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
        activePanel: "issues",
        collapsedGroups: {
            error: false,
            warning: false,
            info: false,
        },
    };
}

const state = createDefaultState();

function resetState() {
    Object.assign(state, createDefaultState());
}

export { state, resetState };
