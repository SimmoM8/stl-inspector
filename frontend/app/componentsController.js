// Handle mesh component data: computing groups, ghosting, overlays, and selection.
function createComponentsController({ state, viewer, selectionStore, onChange = () => { } }) {
    let notifyChange = typeof onChange === "function" ? onChange : () => { };

    function setOnChange(fn) {
        notifyChange = typeof fn === "function" ? fn : () => { };
    }

    function ensureComponentVisibility() {
        if (!state.componentVisibility || !(state.componentVisibility.ghosted instanceof Set)) {
            state.componentVisibility = { ghosted: new Set() };
        }
    }

    function isComponentGhosted(componentIndex) {
        ensureComponentVisibility();
        return state.componentVisibility.ghosted.has(componentIndex);
    }

    function buildComponentOverlayData() {
        ensureComponentVisibility();
        return state.components.map((comp) => ({
            ...comp,
            ghosted: isComponentGhosted(comp.componentIndex),
        }));
    }

    function updateComponentOverlays() {
        viewer.setComponentOverlays(buildComponentOverlayData());
    }

    function setComponentGhosted(componentIndex, ghosted) {
        ensureComponentVisibility();
        if (ghosted) {
            state.componentVisibility.ghosted.add(componentIndex);
        } else {
            state.componentVisibility.ghosted.delete(componentIndex);
        }
        updateComponentOverlays();
        notifyChange();
    }

    function clearComponentGhosting() {
        ensureComponentVisibility();
        state.componentVisibility.ghosted.clear();
        updateComponentOverlays();
        notifyChange();
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

    function applyComponentSelection(componentIndex) {
        const hasSelection = componentIndex !== null && componentIndex !== undefined;
        const comp = hasSelection ? selectionStore.selectComponent(componentIndex) : null;
        let bounds = null;

        if (comp) {
            viewer.clearHighlights();
            viewer.showComponent(comp.faceIndices, { refitCamera: false });
            const offset = viewer.getMeshOffset();
            bounds = selectionStore.getComponentBounds(comp.componentIndex, offset);
            if (bounds?.sphere || bounds?.box) {
                viewer.frameBounds(bounds.sphere || bounds.box, { animate: true });
            } else {
                viewer.frameView();
            }
        } else {
            viewer.showAllComponents({ refitCamera: false });
            const allBounds = viewer.getCurrentBounds();
            bounds = allBounds;
            if (allBounds?.sphere || allBounds?.box) {
                viewer.frameBounds(allBounds.sphere || allBounds.box, { animate: true });
            } else {
                viewer.frameView();
            }
            updateComponentOverlays();
        }
        selectionStore.setSelection(comp ? { type: "component", id: comp.componentIndex, bounds: bounds?.box || null } : null);
        notifyChange();
    }

    function selectLargestComponent() {
        if (!state.components.length) return;
        const largest = state.components.reduce((best, comp) =>
            comp.counts.numFaces > best.counts.numFaces ? comp : best,
            state.components[0]
        );
        applyComponentSelection(largest.componentIndex);
    }

    return {
        applyComponentSelection,
        buildComponentOverlayData,
        clearComponentGhosting,
        computeComponents,
        ensureComponentVisibility,
        isComponentGhosted,
        selectLargestComponent,
        setComponentGhosted,
        setOnChange,
        updateComponentOverlays,
    };
}

export { createComponentsController };
