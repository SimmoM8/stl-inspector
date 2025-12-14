import { createViewer } from "./viewer.js";

const fileInput = document.getElementById("fileInput");
const output = document.getElementById("output");

const viewerContainer = document.getElementById("viewer");
const viewer = createViewer(viewerContainer);

const issuesEl = document.getElementById("issues");
const clearBtn = document.getElementById("clearBtn");

const issueTitle = document.getElementById("issueTitle");
const issueMeta = document.getElementById("issueMeta");
const issueIndices = document.getElementById("issueIndices");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const pageInfo = document.getElementById("pageInfo");
const modeInputs = document.querySelectorAll('input[name="mode"]');

const state = {
    issues: [],
    selectedIndex: -1,
    itemIndex: 0,
    mode: "all",
};

const issueButtons = [];

function getIssueItems(issue) {
    const faces = Array.isArray(issue.faces) ? issue.faces : [];
    const edges = Array.isArray(issue.edges) ? issue.edges : [];
    if (faces.length) return { kind: "face", items: faces };
    if (edges.length) return { kind: "edge", items: edges };
    return { kind: "none", items: [] };
}

function updateActiveButtons() {
    issueButtons.forEach((btn, idx) => {
        btn.classList.toggle("active", idx === state.selectedIndex);
    });
}

function updateModeInputs() {
    modeInputs.forEach((input) => {
        input.checked = input.value === state.mode;
    });
}

function renderDetails(issue, meta) {
    if (!issue) {
        issueTitle.textContent = "No issue selected";
        issueMeta.textContent = "";
        issueIndices.textContent = "";
        pageInfo.textContent = "–";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    const severity = issue.severity ? issue.severity.toUpperCase() : "INFO";
    issueTitle.textContent = `${severity}: ${issue.type}`;
    const metaParts = [];
    if (issue.message) metaParts.push(issue.message);
    if (issue.count != null) metaParts.push(`Count: ${issue.count}`);
    issueMeta.textContent = metaParts.join(" • ");

    issueIndices.textContent = meta.description;
    pageInfo.textContent = meta.pageLabel;
    prevBtn.disabled = meta.disableNav;
    nextBtn.disabled = meta.disableNav;
}

function renderSelection() {
    const issue = state.issues[state.selectedIndex];
    updateActiveButtons();
    updateModeInputs();

    if (!issue) {
        viewer.clearHighlights();
        renderDetails(null, { description: "", pageLabel: "–", disableNav: true });
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
        viewer.showIssueAll(issue);
        pageLabel = "All items";
        disableNav = true;
    } else if (state.mode === "step") {
        if (kind === "face" && total) {
            const faceIndex = items[safeIndex];
            pageLabel = `Face ${safeIndex + 1} of ${total}`;
            description = `Face index: ${faceIndex}`;
            viewer.showIssueItem(issue, safeIndex);
            disableNav = total <= 1;
        } else if (kind === "edge" && total) {
            const edgePair = items[safeIndex];
            pageLabel = `Edge ${safeIndex + 1} of ${total}`;
            description = `Edge vertices: ${edgePair.join(" - ")}`;
            viewer.showIssueItem(issue, safeIndex);
            disableNav = total <= 1;
        } else {
            viewer.showIssueAll(issue);
        }
    } else {
        viewer.showIssueAll(issue);
    }

    renderDetails(issue, {
        pageLabel,
        description,
        disableNav,
    });
}

function selectIssue(idx) {
    state.selectedIndex = idx;
    state.itemIndex = 0;
    state.mode = "all";
    renderSelection();
}

function moveItem(delta) {
    if (state.selectedIndex < 0) return;
    const issue = state.issues[state.selectedIndex];
    const { items } = getIssueItems(issue);
    const total = items.length;
    if (!total) return;
    state.itemIndex = ((state.itemIndex + delta) % total + total) % total;
    renderSelection();
}

function setMode(mode) {
    state.mode = mode === "step" ? "step" : "all";
    renderSelection();
}

renderSelection();

modeInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
        if (e.target.checked) {
            setMode(e.target.value);
        }
    });
});

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    output.textContent = "Uploading and analyzing...";

    try {
        const res = await fetch("http://127.0.0.1:5000/api/analyze", {
            method: "POST",
            body: formData
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        output.textContent = JSON.stringify(data.summary, null, 2);
        viewer.setMeshFromApi(data.mesh);

        const issues = Array.isArray(data.issues) ? data.issues : [];
        issuesEl.innerHTML = "";
        issueButtons.length = 0;
        state.issues = issues;
        state.selectedIndex = -1;
        state.itemIndex = 0;
        state.mode = "all";
        renderSelection();

        issues.forEach((issue, idx) => {
            const btn = document.createElement("button");
            const countText = issue.count != null ? ` (${issue.count})` : "";
            btn.textContent = `${issue.severity.toUpperCase()}: ${issue.type}${countText}`;
            btn.title = issue.message;

            btn.addEventListener("click", () => {
                selectIssue(idx);
            });

            issuesEl.appendChild(btn);
            issueButtons.push(btn);
        });

        console.log("Full response:", data);
    } catch (err) {
        output.textContent = "Error: " + err.message;
    }
});

clearBtn.addEventListener("click", () => {
    viewer.clearHighlights();
    state.selectedIndex = -1;
    state.itemIndex = 0;
    state.mode = "all";
    renderSelection();
});

prevBtn.addEventListener("click", () => moveItem(-1));
nextBtn.addEventListener("click", () => moveItem(1));
