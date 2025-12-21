import * as THREE from "three";

// Factory for a selection store handling current mesh, components, and listeners.
function createSelectionStore() {
    let mesh = null;
    let components = [];
    let selectedComponent = null;
    let selection = { type: null, id: null, bounds: null, meta: null };
    const listeners = new Set();

    const tempVec = new THREE.Vector3();

    // Find a component by index; returns null if missing.
    const findComponent = (componentIndex) => components.find((c) => c.componentIndex === componentIndex) || null;

    // Notify subscribers of the latest selection state.
    function emit() {
        listeners.forEach((fn) => {
            try {
                fn(selection);
            } catch (e) {
                console.warn("selectionStore listener error", e);
            }
        });
    }

    // Normalize and set the current selection payload.
    function setSelection(next) {
        const normalized = next
            ? {
                type: next.type ?? null,
                id: next.id ?? null,
                bounds: next.bounds ?? null,
                meta: next.meta ?? null,
            }
            : { type: null, id: null, bounds: null, meta: null };

        selection = normalized;

        // Keep existing component selection API compatible
        if (selection.type === "component") {
            const comp = findComponent(selection.id);
            selectedComponent = comp ? comp.componentIndex : null;
        } else {
            selectedComponent = null;
        }

        emit();
        return selection;
    }

    // Read the current selection object.
    function getSelection() {
        return selection;
    }

    // Subscribe to selection changes; returns unsubscribe callback.
    function subscribe(listener) {
        if (typeof listener !== "function") return () => { };
        listeners.add(listener);

        // Immediately notify with current selection
        try {
            listener(selection);
        } catch (e) {
            console.warn("selectionStore listener error", e);
        }

        return () => listeners.delete(listener);
    }

    // Compute bounding box/sphere for a component, optionally applying an offset.
    function computeBounds(component, offset = new THREE.Vector3()) {
        if (!mesh || !component) return null;
        const faces = Array.isArray(mesh.faces) ? mesh.faces : [];
        const vertices = Array.isArray(mesh.vertices) ? mesh.vertices : [];
        if (!faces.length || !vertices.length) return null;

        const box = new THREE.Box3();
        box.makeEmpty();

        for (const faceIndex of component.faceIndices) {
            const face = faces[faceIndex];
            if (!Array.isArray(face) || face.length < 3) continue;
            for (let i = 0; i < 3; i++) {
                const vertIndex = face[i];
                const vert = vertices[vertIndex];
                if (!Array.isArray(vert) || vert.length < 3) continue;
                tempVec.set(vert[0], vert[1], vert[2]);
                box.expandByPoint(tempVec);
            }
        }

        if (box.isEmpty()) return null;
        box.translate(offset);

        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        return { box, sphere };
    }

    // Store the mesh data used for bounds calculations.
    function setMesh(meshData) {
        mesh = meshData || null;
    }

    // Replace the component list and drop invalid selection.
    function setComponents(list) {
        components = Array.isArray(list) ? list : [];
        if (!findComponent(selectedComponent)) {
            selectedComponent = null;
        }
    }

    // Select a component by index and emit selection change.
    function selectComponent(componentIndex) {
        const comp = findComponent(componentIndex);
        selectedComponent = comp ? comp.componentIndex : null;
        setSelection(comp ? { type: "component", id: comp.componentIndex, bounds: null, meta: null } : null);
        return comp;
    }

    // Clear any active selection.
    function clearSelection() {
        selectedComponent = null;
        setSelection(null);
    }

    // Reset mesh, components, and selection to defaults.
    function clear() {
        mesh = null;
        components = [];
        clearSelection();
    }

    // Get the currently selected component object.
    function getSelectedComponent() {
        return findComponent(selectedComponent);
    }

    // Compute bounds for a component by index; returns null if not found.
    function getComponentBounds(componentIndex, offset = new THREE.Vector3()) {
        const comp = findComponent(componentIndex);
        if (!comp) return null;
        return computeBounds(comp, offset);
    }

    return {
        clear,
        clearSelection,
        computeBounds,
        getComponent: findComponent,
        getComponentBounds,
        getSelectedComponent,
        getSelectedIndex: () => selectedComponent,
        getSelection,
        selectComponent,
        setSelection,
        setComponents,
        setMesh,
        subscribe,
    };
}

const selectionStore = createSelectionStore();

export { selectionStore };
