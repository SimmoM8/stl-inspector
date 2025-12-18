function createDefaultState() {
    return {
        issues: [],
        selectedIndex: -1,
        itemIndex: 0,
        mode: "step",
        components: [],
        selectedComponent: null,
        highlightEnabled: true,
        summary: null,
        issueFilter: "all",
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
