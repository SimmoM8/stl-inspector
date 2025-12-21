// Manage issue selection, highlighting, filtering, and detail rendering.
function createIssuesController({
    state,
    viewer,
    selectionStore,
    dom,
    issueButtons,
    renderDetails,
    updateToolbarVisibility,
    updateActiveButtons,
    renderIssuesGrouped,
    onChange = () => { },
}) {
    let notifyChange = typeof onChange === "function" ? onChange : () => { };

    function setOnChange(fn) {
        notifyChange = typeof fn === "function" ? fn : () => { };
    }

    function getSelectedIssueIndex() {
        const sel = selectionStore.getSelection();
        return sel?.type === "issue" ? sel.id ?? -1 : -1;
    }

    function getSelectedIssue() {
        const idx = getSelectedIssueIndex();
        return idx >= 0 ? state.issues[idx] : null;
    }

    function getIssueItems(issue) {
        const faces = Array.isArray(issue?.faces) ? issue.faces : [];
        const edges = Array.isArray(issue?.edges) ? issue.edges : [];
        if (faces.length) return { kind: "face", items: faces };
        if (edges.length) return { kind: "edge", items: edges };
        return { kind: "none", items: [] };
    }

    function issueMatchesFilters(issue) {
        if (!issue) return false;
        const filter = (state.issueFilter || "all").toLowerCase();
        const sev = (issue.severity || "info").toLowerCase();
        if (filter !== "all" && sev !== filter) return false;
        const search = (state.issuesSearch || "").trim().toLowerCase();
        if (!search) return true;
        const typeText = (issue.type || "").toLowerCase();
        const messageText = (issue.message || "").toLowerCase();
        return typeText.includes(search) || messageText.includes(search);
    }

    function highlightIssue(issue, mode, itemIndex) {
        const { kind, items } = getIssueItems(issue);
        const total = items.length;
        if (mode === "all") {
            viewer.showIssueAll(issue);
            return;
        }
        if ((kind === "face" || kind === "edge") && total) {
            const safeIndex = ((itemIndex % total) + total) % total;
            viewer.showIssueItem(issue, safeIndex);
            return;
        }
        viewer.showIssueAll(issue);
    }

    function renderSelection() {
        const selection = selectionStore.getSelection();
        const issue = getSelectedIssue();
        updateActiveButtons(selection, issueButtons);
        const iconClass = state.highlightEnabled ? "bi-lightbulb-fill" : "bi-lightbulb";
        dom.highlightToggleBtn.innerHTML = `<i class="bi ${iconClass}"></i>`;
        dom.highlightToggleBtn.title = state.highlightEnabled ? "Hide highlights" : "Show highlights";
        const modeIcon = state.mode === "all" ? "bi-list-check" : "bi-list-ol";
        dom.modeToggleBtn.innerHTML = `<i class="bi ${modeIcon}"></i>`;

        if (!issue) {
            if (state.highlightEnabled) viewer.clearHighlights();
            if (selection?.type === "component") {
                const comp = selectionStore.getComponent(selection.id);
                const placeholderIssue = comp
                    ? { severity: "info", type: `Component ${comp.componentIndex}`, message: "" }
                    : null;
                renderDetails(dom, placeholderIssue, {
                    description: comp
                        ? `Faces: ${comp.counts.numFaces}, Vertices: ${comp.counts.numVertices}`
                        : "",
                    pageLabel: comp ? `Component ${comp.componentIndex}` : "Component",
                    hint: "Component isolated. Select an issue to inspect details.",
                    disableNav: true,
                });
            } else {
                renderDetails(dom, null, {
                    description: "",
                    pageLabel: "–",
                    hint: "Upload an STL to begin. Hover issues to preview, use ←/→ to step.",
                    disableNav: true,
                });
            }
            return;
        }

        const { kind, items } = getIssueItems(issue);
        const total = items.length;
        const safeIndex = total ? ((state.itemIndex % total) + total) % total : 0;
        state.itemIndex = safeIndex;

        let pageLabel = "–";
        let description = "No indices available for this issue.";
        let disableNav = true;

        if (state.mode === "all") {
            if (state.highlightEnabled) viewer.showIssueAll(issue);
            pageLabel = total ? `All ${total} items` : "All items";
            description = total ? "Highlighting all items for this issue." : description;
            disableNav = total <= 1;
        } else {
            if (kind === "face" && total) {
                const faceIndex = items[safeIndex];
                pageLabel = `Face ${safeIndex + 1} of ${total}`;
                description = `Face index: ${faceIndex}`;
                if (state.highlightEnabled) viewer.showIssueItem(issue, safeIndex);
                disableNav = total <= 1;
            } else if (kind === "edge" && total) {
                const edgePair = items[safeIndex];
                pageLabel = `Edge ${safeIndex + 1} of ${total}`;
                description = `Edge vertices: ${edgePair.join(" - ")}`;
                if (state.highlightEnabled) viewer.showIssueItem(issue, safeIndex);
                disableNav = total <= 1;
            } else {
                if (state.highlightEnabled) viewer.showIssueAll(issue);
            }
        }

        const hint = state.mode === "all"
            ? "Showing all items. Press A to switch to step mode."
            : "Step through items with ←/→ (or J/K). Press A to show all.";

        renderDetails(dom, issue, {
            pageLabel,
            description,
            hint,
            disableNav,
        });

        updateToolbarVisibility(state, dom, selection);
    }

    function selectIssue(idx) {
        const issue = state.issues[idx];
        viewer.showAllComponents({ refitCamera: false });
        const bounds = viewer.getCurrentBounds()?.box || null;
        selectionStore.setSelection(issue ? { type: "issue", id: idx, bounds } : null);
        state.itemIndex = 0;
        state.mode = "step";
        renderSelection();
        notifyChange();
    }

    function clearSelection() {
        viewer.clearHighlights();
        state.itemIndex = 0;
        state.mode = "step";
        viewer.showAllComponents({ refitCamera: false });
        selectionStore.setSelection(null);
        renderSelection();
        updateToolbarVisibility(state, dom, selectionStore.getSelection());
        notifyChange();
    }

    function moveItem(delta) {
        state.mode = "step";
        const issue = getSelectedIssue();
        if (!issue) return;
        const { items } = getIssueItems(issue);
        const total = items.length;
        if (!total) return;
        state.itemIndex = ((state.itemIndex + delta) % total + total) % total;
        renderSelection();
        notifyChange();
    }

    let previewTimeout = null;
    let restoreTimeout = null;

    function previewIssue(index) {
        if (previewTimeout) clearTimeout(previewTimeout);
        if (restoreTimeout) {
            clearTimeout(restoreTimeout);
            restoreTimeout = null;
        }
        const issue = state.issues[index];
        previewTimeout = setTimeout(() => {
            previewTimeout = null;
            if (!state.highlightEnabled) return;
            if (!issue) return;
            highlightIssue(issue, "all", 0);
        }, 80);
    }

    function restoreSelectionHighlight() {
        if (previewTimeout) {
            clearTimeout(previewTimeout);
            previewTimeout = null;
        }
        if (restoreTimeout) clearTimeout(restoreTimeout);
        restoreTimeout = setTimeout(() => {
            restoreTimeout = null;
            if (!state.highlightEnabled) {
                viewer.clearHighlights();
                return;
            }
            const issue = getSelectedIssue();
            if (!issue) {
                viewer.clearHighlights();
                return;
            }
            highlightIssue(issue, state.mode, state.itemIndex);
        }, 60);
    }

    function toggleGroup(sev) {
        state.collapsedGroups[sev] = !state.collapsedGroups[sev];
        renderIssuesGrouped(
            state,
            dom,
            issueButtons,
            selectIssue,
            toggleGroup,
            previewIssue,
            restoreSelectionHighlight
        );
        updateActiveButtons(selectionStore.getSelection(), issueButtons);
    }

    return {
        clearSelection,
        getIssueItems,
        getSelectedIssue,
        getSelectedIssueIndex,
        issueMatchesFilters,
        moveItem,
        previewIssue,
        renderSelection,
        restoreSelectionHighlight,
        selectIssue,
        setOnChange,
        toggleGroup,
    };
}

export { createIssuesController };
