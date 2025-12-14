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
const showAllBtn = document.getElementById("showAllBtn");
const componentsList = document.getElementById("componentsList");
const showAllComponentsBtn = document.getElementById("showAllComponentsBtn");
const autoLargestInput = document.getElementById("autoLargest");

const state = {
    issues: [],
    selectedIndex: -1,
    itemIndex: 0,
    mode: "step",
    components: [],
    selectedComponent: null,
};

const issueButtons = [];

function getIssueItems(issue) {
    const faces = Array.isArray(issue.faces) ? issue.faces : [];
    const edges = Array.isArray(issue.edges) ? issue.edges : [];
    if (faces.length) return { kind: "face", items: faces };
    if (edges.length) return { kind: "edge", items: edges };
    return { kind: "none", items: [] };
}

function computeComponents(meshData) {
    const faces = Array.isArray(meshData.faces) ? meshData.faces : [];
    if (!faces.length) return [];

    const adjacency = Array.from({ length: faces.length }, () => []);
    const edgeMap = new Map();

    for (let fi = 0; fi < faces.length; fi++) {
        const [a, b, c] = faces[fi];
        const edges = [
            [a, b],
            [b, c],
            [c, a],
        ];
        for (const [u, v] of edges) {
            const k = u < v ? `${u}-${v}` : `${v}-${u}`;
            if (!edgeMap.has(k)) edgeMap.set(k, []);
            edgeMap.get(k).push(fi);
        }
    }

    // Build adjacency from shared edges
    for (const facesList of edgeMap.values()) {
        if (facesList.length < 2) continue;
        const first = facesList[0];
        for (let i = 1; i < facesList.length; i++) {
            const other = facesList[i];
            adjacency[first].push(other);
            adjacency[other].push(first);
        }
    }

    const visited = new Array(faces.length).fill(false);
    const components = [];

    for (let i = 0; i < faces.length; i++) {
        if (visited[i]) continue;
        const queue = [i];
        const compFaces = [];
        const compVerts = new Set();
        visited[i] = true;
        while (queue.length) {
            const f = queue.pop();
            compFaces.push(f);
            const [a, b, c] = faces[f];
            compVerts.add(a);
            compVerts.add(b);
            compVerts.add(c);
            for (const nbr of adjacency[f]) {
                if (!visited[nbr]) {
                    visited[nbr] = true;
                    queue.push(nbr);
                }
            }
        }
        components.push({
            componentIndex: components.length,
            faceIndices: compFaces,
            counts: {
                numFaces: compFaces.length,
                numVertices: compVerts.size,
            },
        });
    }

    return components;
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
        showAllBtn.disabled = true;
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
    showAllBtn.disabled = false;
}

function renderComponentsList() {
    componentsList.innerHTML = "";
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
        componentsList.appendChild(btn);
    });
}

function applyComponentSelection(componentIndex) {
    state.selectedComponent = componentIndex;
    const comp = state.components.find((c) => c.componentIndex === componentIndex);
    if (comp) {
        viewer.showComponent(comp.faceIndices);
    } else {
        viewer.showAllComponents();
        state.selectedComponent = null;
    }
    renderSelection();
    renderComponentsList();
}

function selectLargestComponent() {
    if (!state.components.length) return;
    const largest = state.components.reduce((best, comp) =>
        comp.counts.numFaces > best.counts.numFaces ? comp : best,
        state.components[0]
    );
    applyComponentSelection(largest.componentIndex);
}

function renderSelection() {
    const issue = state.issues[state.selectedIndex];
    updateActiveButtons();

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
        pageLabel = total ? `All ${total} items` : "All items";
        description = total ? "Highlighting all items for this issue." : description;
        disableNav = total <= 1;
    } else {
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
    state.mode = "step";
    renderSelection();
}

function moveItem(delta) {
    state.mode = "step"; // auto-switch to stepping when iterating
    if (state.selectedIndex < 0) return;
    const issue = state.issues[state.selectedIndex];
    const { items } = getIssueItems(issue);
    const total = items.length;
    if (!total) return;
    state.itemIndex = ((state.itemIndex + delta) % total + total) % total;
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
        state.itemIndex = 0;
        state.mode = "step";
        state.components = computeComponents(data.mesh);
        state.selectedComponent = null;
        renderSelection();
        renderComponentsList();

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

        if (autoLargestInput.checked && state.components.length) {
            const largest = state.components.reduce((best, comp) =>
                comp.counts.numFaces > best.counts.numFaces ? comp : best,
                state.components[0]
            );
            applyComponentSelection(largest.componentIndex);
        } else {
            viewer.showAllComponents();
            state.selectedComponent = null;
            renderSelection();
            renderComponentsList();
        }

        console.log("Full response:", data);
    } catch (err) {
        output.textContent = "Error: " + err.message;
    }
});

clearBtn.addEventListener("click", () => {
    viewer.clearHighlights();
    state.selectedIndex = -1;
    state.itemIndex = 0;
    state.mode = "step";
    renderSelection();
});

prevBtn.addEventListener("click", () => moveItem(-1));
nextBtn.addEventListener("click", () => moveItem(1));

showAllBtn.addEventListener("click", () => {
    state.mode = "all";
    renderSelection();
});

showAllComponentsBtn.addEventListener("click", () => {
    state.selectedComponent = null;
    viewer.showAllComponents();
    renderSelection();
    renderComponentsList();
});

autoLargestInput.addEventListener("change", () => {
    if (autoLargestInput.checked) {
        selectLargestComponent();
    }
});
