import { getComponentColor } from "../components/colors.js";

// Render grouped issue buttons filtered by severity/search and wire up events.
function renderIssuesGrouped(state, dom, issueButtons, selectIssue, toggleGroup, previewIssue, restoreSelectionHighlight) {
    dom.issuesEl.innerHTML = "";
    issueButtons.length = 0;

    const filter = (state.issueFilter || "all").toLowerCase();
    const search = (state.issuesSearch || "").trim().toLowerCase();
    const groups = { error: [], warning: [], info: [] };
    state.issues.forEach((issue, idx) => {
        const sev = (issue.severity || "info").toLowerCase();
        if (!groups[sev]) groups[sev] = [];
        if (search) {
            const typeText = (issue.type || "").toLowerCase();
            const messageText = (issue.message || "").toLowerCase();
            if (!typeText.includes(search) && !messageText.includes(search)) return;
        }
        groups[sev].push({ issue, idx });
    });

    // Build each severity group section with buttons and hover handlers.
    function createGroup(sevLabel, items) {
        if (filter !== "all" && filter !== sevLabel.toLowerCase()) return;
        const sev = sevLabel.toLowerCase();
        const groupDiv = document.createElement("div");
        groupDiv.className = "group";
        const header = document.createElement("div");
        header.className = "group-header";
        header.textContent = `${sevLabel} (${items.length})`;
        const body = document.createElement("div");
        body.className = "group-items";
        body.classList.toggle("hidden", state.collapsedGroups[sev]);
        header.addEventListener("click", () => toggleGroup(sev));
        groupDiv.appendChild(header);
        groupDiv.appendChild(body);

        items.forEach(({ issue, idx }) => {
            const btn = document.createElement("button");
            btn.className = "issue-btn";
            const sevDot = document.createElement("span");
            const sevClass = (issue.severity || "info").toLowerCase();
            sevDot.className = `sev-dot sev-${sevClass}`;
            const title = document.createElement("span");
            title.className = "issue-title";
            title.textContent = `${issue.severity.toUpperCase()}: ${issue.type}`;
            btn.appendChild(sevDot);
            btn.appendChild(title);
            if (issue.count != null) {
                const badge = document.createElement("span");
                badge.className = "badge";
                badge.textContent = `(${issue.count})`;
                btn.appendChild(badge);
            }
            btn.title = issue.message;
            btn.addEventListener("click", () => selectIssue(idx));
            btn.addEventListener("mouseenter", () => previewIssue(idx));
            btn.addEventListener("mouseleave", () => restoreSelectionHighlight());
            body.appendChild(btn);
            issueButtons.push({ el: btn, index: idx });
        });

        dom.issuesEl.appendChild(groupDiv);
    }

    createGroup("Error", groups.error);
    createGroup("Warning", groups.warning);
    createGroup("Info", groups.info);
}

// Render the components list with isolate/ghost controls and selection highlighting.
function renderComponentsList(state, dom, selection, applyComponentSelection) {
    dom.componentsList.innerHTML = "";
    if (!state.components.length) return;

    const search = (state.componentSearch || "").trim().toLowerCase();
    const matchesSearch = (comp) => {
        if (!search) return true;
        const label = `component ${comp.componentIndex}`;
        return label.toLowerCase().includes(search);
    };

    state.components.filter(matchesSearch).forEach((comp) => {
        const row = document.createElement("div");
        row.className = "component-row";
        const chip = document.createElement("span");
        chip.className = "component-chip";
        chip.style.backgroundColor = getComponentColor(comp.componentIndex);

        const label = document.createElement("span");
        label.textContent = `Component ${comp.componentIndex}`;

        row.appendChild(chip);
        row.appendChild(label);
        const isSelected = selection?.type === "component" && selection.id === comp.componentIndex;
        row.classList.toggle("active", isSelected);
        row.addEventListener("click", () => {
            applyComponentSelection(comp.componentIndex);
        });
        dom.componentsList.appendChild(row);
    });
}

// Render issue details panel; disables controls when no issue is selected.
function renderDetails(dom, issue, meta) {
    if (!issue) {
        dom.issueTitle.textContent = "No issue selected";
        dom.issueMeta.textContent = "";
        dom.issuePageLabel.textContent = "";
        dom.issueHint.textContent = meta?.hint || "";
        dom.issueIndices.textContent = "";
        dom.prevBtn.disabled = true;
        dom.nextBtn.disabled = true;
        dom.showAllBtn.disabled = true;
        return;
    }

    const severity = issue.severity ? issue.severity.toUpperCase() : "INFO";
    dom.issueTitle.textContent = `${severity}: ${issue.type}`;
    const metaParts = [];
    if (issue.message) metaParts.push(issue.message);
    if (issue.count != null) metaParts.push(`Count: ${issue.count}`);
    dom.issueMeta.textContent = metaParts.join(" • ");

    dom.issuePageLabel.textContent = meta.pageLabel || "";
    dom.issueHint.textContent = meta?.hint || "";
    dom.issueIndices.textContent = meta.description;
    dom.prevBtn.disabled = meta.disableNav;
    dom.nextBtn.disabled = meta.disableNav;
    dom.showAllBtn.disabled = false;
}

// Set active class on issue buttons to mirror current selection.
function updateActiveButtons(selection, issueButtons) {
    issueButtons.forEach((info) => {
        const isSelected = selection?.type === "issue" && selection.id === info.index;
        info.el.classList.toggle("active", isSelected);
    });
}

// Fill the summary stats block with mesh analysis data.
function updateSummary(dom, summary) {
    if (summary) {
        dom.summaryWatertight.textContent =
            summary.isWatertight === undefined ? "–" : (summary.isWatertight ? "Yes" : "No");
        dom.summaryComponents.textContent = summary.numComponents ?? "–";
        dom.summaryFaces.textContent = summary.numFaces ?? "–";
        dom.summaryVertices.textContent = summary.numVertices ?? "–";
    }
}

// Show/hide toolbars and buttons based on what the user has selected.
function updateToolbarVisibility(state, dom, selection) {
    const hasIssueSelection = selection?.type === "issue";
    const hasComponentSelection = selection?.type === "component";
    if (dom.cameraToolbar) dom.cameraToolbar.classList.toggle("hidden", false); // always visible
    if (dom.inspectToolbar) dom.inspectToolbar.classList.toggle("hidden", !(hasIssueSelection || hasComponentSelection));
    if (dom.renderToolbar) dom.renderToolbar.classList.toggle("hidden", !(hasIssueSelection || hasComponentSelection));
    dom.modeToggleBtn.disabled = !hasIssueSelection;
    dom.prevBtn.disabled = !hasIssueSelection;
    dom.nextBtn.disabled = !hasIssueSelection;
}

export {
    renderIssuesGrouped,
    renderComponentsList,
    renderDetails,
    updateActiveButtons,
    updateSummary,
    updateToolbarVisibility,
};
