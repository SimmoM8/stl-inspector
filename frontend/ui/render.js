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

function renderComponentsList(state, dom, applyComponentSelection) {
    dom.componentsList.innerHTML = "";
    if (!state.components.length) return;

    state.components.forEach((comp) => {
        const btn = document.createElement("button");
        const facesText = `${comp.counts.numFaces} faces`;
        const vertsText = `${comp.counts.numVertices} verts`;
        btn.textContent = `Component ${comp.componentIndex} (${facesText}, ${vertsText})`;
        const isSelected = state.selection?.type === "component" && state.selection.id === comp.componentIndex;
        btn.classList.toggle("active", isSelected);
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

function updateActiveButtons(state, issueButtons) {
    issueButtons.forEach((info) => {
        const isSelected = state.selection?.type === "issue" && state.selection.id === info.index;
        info.el.classList.toggle("active", isSelected);
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
    const hasIssueSelection = state.selection?.type === "issue";
    const hasComponentSelection = state.selection?.type === "component";
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
