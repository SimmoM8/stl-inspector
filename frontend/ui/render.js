function renderIssuesGrouped(state, dom, issueButtons, selectIssue, toggleGroup, previewIssue, restoreSelectionHighlight) {
    dom.issuesEl.innerHTML = "";
    issueButtons.length = 0;

    const filter = (state.issueFilter || "all").toLowerCase();
    const groups = { error: [], warning: [], info: [] };
    state.issues.forEach((issue, idx) => {
        const sev = (issue.severity || "info").toLowerCase();
        if (!groups[sev]) groups[sev] = [];
        groups[sev].push({ issue, idx });
    });

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
            const countText = issue.count != null ? ` (${issue.count})` : "";
            btn.textContent = `${issue.severity.toUpperCase()}: ${issue.type}${countText}`;
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

function renderComponentsList(state, dom, applyComponentSelection) {
    dom.componentsList.innerHTML = "";
    if (!state.components.length) return;

    state.components.forEach((comp) => {
        const btn = document.createElement("button");
        const facesText = `${comp.counts.numFaces} faces`;
        const vertsText = `${comp.counts.numVertices} verts`;
        btn.textContent = `Component ${comp.componentIndex} (${facesText}, ${vertsText})`;
        btn.classList.toggle("active", state.selectedComponent === comp.componentIndex);
        btn.addEventListener("click", () => {
            applyComponentSelection(comp.componentIndex);
        });
        dom.componentsList.appendChild(btn);
    });
}

function renderDetails(dom, issue, meta) {
    if (!issue) {
        dom.issueTitle.textContent = "No issue selected";
        dom.issueMeta.textContent = "";
        dom.issuePageLabel.textContent = "";
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
    dom.issueIndices.textContent = meta.description;
    dom.prevBtn.disabled = meta.disableNav;
    dom.nextBtn.disabled = meta.disableNav;
    dom.showAllBtn.disabled = false;
}

function updateActiveButtons(state, issueButtons) {
    issueButtons.forEach((info) => {
        info.el.classList.toggle("active", info.index === state.selectedIndex);
    });
}

function updateSummary(dom, summary) {
    if (summary) {
        dom.summaryWatertight.textContent =
            summary.isWatertight === undefined ? "–" : (summary.isWatertight ? "Yes" : "No");
        dom.summaryComponents.textContent = summary.numComponents ?? "–";
        dom.summaryFaces.textContent = summary.numFaces ?? "–";
        dom.summaryVertices.textContent = summary.numVertices ?? "–";
    }
}

function updateToolbarVisibility(state, dom) {
    const hasIssueSelection = state.selectedIndex >= 0;
    const hasComponentSelection = state.selectedComponent !== null;
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
