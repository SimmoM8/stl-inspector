import * as THREE from "three";

function createSelectionStore() {
    let mesh = null;
    let components = [];
    let selectedComponent = null;

    const tempVec = new THREE.Vector3();

    const findComponent = (componentIndex) => components.find((c) => c.componentIndex === componentIndex) || null;

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

    function setMesh(meshData) {
        mesh = meshData || null;
    }

    function setComponents(list) {
        components = Array.isArray(list) ? list : [];
        if (!findComponent(selectedComponent)) {
            selectedComponent = null;
        }
    }

    function selectComponent(componentIndex) {
        const comp = findComponent(componentIndex);
        selectedComponent = comp ? comp.componentIndex : null;
        return comp;
    }

    function clearSelection() {
        selectedComponent = null;
    }

    function clear() {
        mesh = null;
        components = [];
        selectedComponent = null;
    }

    function getSelectedComponent() {
        return findComponent(selectedComponent);
    }

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
        selectComponent,
        setComponents,
        setMesh,
    };
}

const selectionStore = createSelectionStore();

export { selectionStore };
