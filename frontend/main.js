import { createViewer } from "./viewer.js";

const CHUNK_SIZE = 200;

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

const state = {
    issues: [],
    selectedIndex: -1,
    page: 0,
};

const issueButtons = [];

function formatPreview(list, formatter = (v) => v, limit = 12) {
    if (!list || list.length === 0) return "";
    const values = list.slice(0, limit).map(formatter);
    const suffix = list.length > limit ? " …" : "";
    return values.join(", ") + suffix;
}

function sliceInfo(list, page) {
    const total = Array.isArray(list) ? list.length : 0;
    const pageCount = total > 0 ? Math.ceil(total / CHUNK_SIZE) : 1;
    const safePage = Math.max(0, Math.min(page, pageCount - 1));
    const start = total > 0 ? safePage * CHUNK_SIZE : 0;
    const end = total > 0 ? Math.min(start + CHUNK_SIZE, total) : 0;

    return {
        total,
        pageCount,
        start,
        end,
        page: safePage,
        slice: total > 0 ? list.slice(start, end) : [],
    };
}

function totalPagesForIssue(issue) {
    const counts = [];
    if (issue.faces && issue.faces.length) {
        counts.push(Math.ceil(issue.faces.length / CHUNK_SIZE));
    }
    if (issue.edges && issue.edges.length) {
        counts.push(Math.ceil(issue.edges.length / CHUNK_SIZE));
    }
    return counts.length ? Math.max(...counts) : 1;
}

function buildSelectionMeta(issue, requestedPage) {
    const totalPages = totalPagesForIssue(issue);
    const normalizedPage = ((requestedPage % totalPages) + totalPages) % totalPages;
    const faces = sliceInfo(issue.faces || [], normalizedPage);
    const edges = sliceInfo(issue.edges || [], normalizedPage);
    return { faces, edges, totalPages, page: normalizedPage };
}

function updateActiveButtons() {
    issueButtons.forEach((btn, idx) => {
        btn.classList.toggle("active", idx === state.selectedIndex);
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

    const lines = [];
    if (meta.faces.total) {
        lines.push(`Faces ${meta.faces.start + 1}-${meta.faces.end} of ${meta.faces.total}`);
    }
    if (meta.edges.total) {
        lines.push(`Edges ${meta.edges.start + 1}-${meta.edges.end} of ${meta.edges.total}`);
    }

    const facePreview = formatPreview(meta.faces.slice);
    if (facePreview) {
        lines.push(`Face indices: ${facePreview}`);
    }

    const edgePreview = formatPreview(meta.edges.slice, (pair) => pair.join("-"));
    if (edgePreview) {
        lines.push(`Edge pairs: ${edgePreview}`);
    }

    issueIndices.textContent = lines.join("\n");
    pageInfo.textContent = meta.totalPages > 1 ? `Page ${meta.page + 1}/${meta.totalPages}` : "–";
    const enablePaging = meta.totalPages > 1;
    prevBtn.disabled = !enablePaging;
    nextBtn.disabled = !enablePaging;
}

function renderSelection() {
    const issue = state.issues[state.selectedIndex];
    updateActiveButtons();

    if (!issue) {
        viewer.clearHighlights();
        renderDetails(null, {});
        return;
    }

    const meta = buildSelectionMeta(issue, state.page);
    state.page = meta.page;

    const issueForViewer = { ...issue };
    issueForViewer.faces = meta.faces.slice;
    issueForViewer.edges = meta.edges.slice;

    viewer.showIssue(issueForViewer);
    renderDetails(issue, meta);
}

function selectIssue(idx) {
    state.selectedIndex = idx;
    state.page = 0;
    renderSelection();
}

function movePage(delta) {
    if (state.selectedIndex < 0) return;
    const issue = state.issues[state.selectedIndex];
    const pages = totalPagesForIssue(issue);
    state.page = ((state.page + delta) % pages + pages) % pages;
    renderSelection();
}

renderSelection();

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
        state.page = 0;
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
    state.page = 0;
    renderSelection();
});

prevBtn.addEventListener("click", () => movePage(-1));
nextBtn.addEventListener("click", () => movePage(1));
