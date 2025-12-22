import * as THREE from "three";
import { LineSegmentsGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegments2.js";

// Remove ghost mesh that hides non-selected faces.
export function disposeGhostMesh(viewerState) {
    const { ghostMesh } = viewerState;
    if (ghostMesh && ghostMesh.parent) {
        ghostMesh.parent.remove(ghostMesh);
    }
    if (ghostMesh) {
        ghostMesh.geometry.dispose();
        ghostMesh.material.dispose();
    }
    viewerState.ghostMesh = null;
}

// Remove isolated selection mesh copy.
export function disposeSelectedMesh(viewerState) {
    const { selectedMesh } = viewerState;
    if (selectedMesh && selectedMesh.parent) {
        selectedMesh.parent.remove(selectedMesh);
    }
    if (selectedMesh) {
        selectedMesh.geometry.dispose();
        if (selectedMesh.material) {
            selectedMesh.material.dispose();
        }
    }
    viewerState.selectedMesh = null;
}

// Clear selection outline lines.
export function disposeSelectionOutline(viewerState) {
    const { selectionOutline, selectionOutlineMaterial } = viewerState;
    if (selectionOutline && selectionOutline.parent) {
        selectionOutline.parent.remove(selectionOutline);
    }
    if (selectionOutline) {
        selectionOutline.geometry.dispose();
    }
    if (selectionOutlineMaterial) {
        selectionOutlineMaterial.dispose();
    }
    viewerState.selectionOutline = null;
    viewerState.selectionOutlineMaterial = null;
}

// Create a faded ghost mesh for non-selected faces when isolating.
export function rebuildGhostMesh(selectedFaceList, viewerState) {
    const { currentMesh, basePositions, baseIndices, baseFaceCount, pivot } = viewerState;
    disposeGhostMesh(viewerState);
    if (!currentMesh || !selectedFaceList || !selectedFaceList.length) return;
    if (!basePositions || !baseIndices) return;

    const selectedSet = new Set(selectedFaceList);
    const remainingFaces = [];
    for (let f = 0; f < baseFaceCount; f++) {
        if (!selectedSet.has(f)) remainingFaces.push(f);
    }
    if (!remainingFaces.length) return;

    // Build non-indexed geometry for remaining faces
    const positions = new Float32Array(remainingFaces.length * 9);
    for (let i = 0; i < remainingFaces.length; i++) {
        const faceIndex = remainingFaces[i];
        const i0 = baseIndices[faceIndex * 3 + 0];
        const i1 = baseIndices[faceIndex * 3 + 1];
        const i2 = baseIndices[faceIndex * 3 + 2];
        const o = i * 9;
        positions[o + 0] = basePositions[i0 * 3 + 0];
        positions[o + 1] = basePositions[i0 * 3 + 1];
        positions[o + 2] = basePositions[i0 * 3 + 2];
        positions[o + 3] = basePositions[i1 * 3 + 0];
        positions[o + 4] = basePositions[i1 * 3 + 1];
        positions[o + 5] = basePositions[i1 * 3 + 2];
        positions[o + 6] = basePositions[i2 * 3 + 0];
        positions[o + 7] = basePositions[i2 * 3 + 1];
        positions[o + 8] = basePositions[i2 * 3 + 2];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.15,
        metalness: 0.0,
        roughness: 0.9,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
    });

    viewerState.ghostMesh = new THREE.Mesh(geom, mat);
    viewerState.ghostMesh.position.copy(currentMesh.position);
    viewerState.ghostMesh.renderOrder = 3;
    pivot.add(viewerState.ghostMesh);
}

// Build thick outline lines around the currently selected faces.
export function rebuildSelectionOutline(selectedFaceList, displayGeom, targetMesh, viewerState) {
    const { renderer, drawBufferSize } = viewerState;
    disposeSelectionOutline(viewerState);
    if (!targetMesh || !selectedFaceList || !selectedFaceList.length) return;
    if (!displayGeom) return;

    const edgesGeom = new THREE.EdgesGeometry(displayGeom, 0.1);
    const lineGeom = new LineSegmentsGeometry();
    lineGeom.setPositions(edgesGeom.getAttribute("position").array);
    edgesGeom.dispose();

    viewerState.selectionOutlineMaterial = new LineMaterial({
        color: 0x111111,
        linewidth: Math.max(2, getEdgeLineWidthPx(viewerState) * 1.6),
        transparent: true,
        opacity: 0.85,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    });
    renderer.getDrawingBufferSize(drawBufferSize);
    viewerState.selectionOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

    viewerState.selectionOutline = new LineSegments2(lineGeom, viewerState.selectionOutlineMaterial);
    viewerState.selectionOutline.renderOrder = 12;
    targetMesh.add(viewerState.selectionOutline);
}

// Isolate a set of faces as a temporary selected mesh with ghosted remainder.
export function focusComponentFaces(faceIndices, viewerState) {
    const { basePositions, baseIndices, currentMesh, pivot } = viewerState;
    if (!basePositions || !baseIndices) return;
    if (!faceIndices || !faceIndices.length) return;

    hideBaseMeshesAndLines(viewerState);
    disposeGhostMesh(viewerState);
    disposeSelectedMesh(viewerState);
    disposeSelectionOutline(viewerState);
    disposeOverlay(viewerState);

    rebuildGhostMesh(faceIndices, viewerState);
    const { sourceGeom, displayGeom } = buildGeometryFromFaceList(faceIndices, viewerState);
    const material = new THREE.MeshStandardMaterial({
        metalness: 0.0,
        roughness: 0.8,
        color: viewerState.baseMeshColor,
    });
    viewerState.selectedMesh = new THREE.Mesh(displayGeom, material);
    viewerState.selectedMesh.castShadow = true;
    viewerState.selectedMesh.receiveShadow = true;
    if (currentMesh) {
        viewerState.selectedMesh.position.copy(currentMesh.position);
        viewerState.selectedMesh.rotation.copy(currentMesh.rotation);
        viewerState.selectedMesh.scale.copy(currentMesh.scale);
    }
    pivot.add(viewerState.selectedMesh);
    syncGlobalOutlineTransform(viewerState);
    updateGlobalOutlineVisibility(viewerState);

    rebuildSelectionOutline(faceIndices, displayGeom, viewerState.selectedMesh, viewerState);
    sourceGeom.dispose();
}

// Clear component isolation, showing the full mesh again.
export function clearComponentFocus(viewerState) {
    disposeGhostMesh(viewerState);
    disposeSelectionOutline(viewerState);
    disposeSelectedMesh(viewerState);
    showBaseMeshesAndLines(viewerState);
    rebuildComponentOutlines(viewerState);
    rebuildGlobalOutline(viewerState);
    rebuildEdges(viewerState);
}

// Show a specific component (by faces) and optionally frame camera on it.
export function showComponent(faceIndices, options, viewerState) {
    const { refitCamera = true } = options || {};
    if (!faceIndices || !faceIndices.length) {
        clearComponentFocus(viewerState);
        return;
    }
    focusComponentFaces(faceIndices, viewerState);
    if (refitCamera) {
        const bounds = getFaceBounds(faceIndices, viewerState);
        if (bounds && (bounds.box || bounds.sphere)) {
            applyFrameToBounds(bounds.sphere || bounds.box, { animate: true }, viewerState);
        }
    }
}

// Reset to showing all components; refit camera when requested.
export function showAllComponents(options, viewerState) {
    const { refitCamera = true } = options || {};
    clearComponentFocus(viewerState);
    if (refitCamera && viewerState.currentMesh?.geometry) {
        const bounds = getWorldBounds(viewerState.currentMesh.geometry, viewerState);
        if (bounds) {
            applyFrameToBounds(bounds.sphere || bounds.box, { animate: true }, viewerState);
        }
    }
    rebuildComponentOutlines(viewerState);
    rebuildGlobalOutline(viewerState);
    rebuildEdges(viewerState);
}

// Store component overlay data and rebuild overlay visuals.
export function setComponentOverlays(list, viewerState) {
    viewerState.componentOverlays = Array.isArray(list) ? list : [];
    if (viewerState.currentMesh && viewerState.currentMesh.geometry) {
        rebuildComponentOverlay(viewerState.currentMesh.geometry, viewerState.lastFaceList, viewerState);
    }
    rebuildComponentOutlines(viewerState);
}

// Hide base mesh/edges when showing component-only isolation.
function hideBaseMeshesAndLines(viewerState) {
    const { currentMesh, currentEdges, componentOutline } = viewerState;
    if (currentMesh) currentMesh.visible = false;
    if (currentEdges) currentEdges.visible = false;
    if (componentOutline) componentOutline.visible = false;
    updateGlobalOutlineVisibility(viewerState);
    disposeOverlay(viewerState);
}

// Show base mesh/edges after hiding them for isolation.
function showBaseMeshesAndLines(viewerState) {
    const { currentMesh, viewSettings, componentOutline } = viewerState;
    if (currentMesh) currentMesh.visible = true;
    if (currentEdges) currentEdges.visible = !viewSettings.componentMode && viewSettings.edgeMode !== "off";
    if (componentOutline) componentOutline.visible = viewSettings.componentMode;
    updateGlobalOutlineVisibility(viewerState);
    if (currentMesh?.geometry && !viewSettings.componentMode) {
        rebuildComponentOverlay(currentMesh.geometry, viewerState.lastFaceList, viewerState);
    }
}

// Import functions that will be defined in other files
import {
    getEdgeLineWidthPx, disposeOverlay, rebuildComponentOverlay,
    rebuildComponentOutlines, syncGlobalOutlineTransform, updateGlobalOutlineVisibility,
    rebuildGlobalOutline, rebuildEdges, getFaceBounds, getWorldBounds, applyFrameToBounds
} from "./viewer-view-settings.js";
import { buildGeometryFromFaceList } from "./viewer-mesh.js";