import * as THREE from "three";
import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js";
import { buildGeometryFromFaceList } from "./viewer-geometry.js";
import { getFaceBounds, getWorldBounds, applyFrameToBounds } from "./viewer-camera.js";
import { getEdgeLineWidthPx } from "./viewer-view-settings.js";
import { MATERIALS } from "../constants/constants.js";

/**
 * Remove ghost mesh that hides non-selected faces.
 * @param {Object} viewerState - The viewer state object.
 */
export function disposeGhostMesh(viewerState) {
    if (viewerState.ghostMesh && viewerState.ghostMesh.parent) {
        viewerState.ghostMesh.parent.remove(viewerState.ghostMesh);
    }
    if (viewerState.ghostMesh) {
        viewerState.ghostMesh.geometry.dispose();
        viewerState.ghostMesh.material.dispose();
    }
    viewerState.ghostMesh = null;
}

/**
 * Remove isolated selection mesh copy.
 * @param {Object} viewerState - The viewer state object.
 */
export function disposeSelectedMesh(viewerState) {
    if (viewerState.selectedMesh && viewerState.selectedMesh.parent) {
        viewerState.selectedMesh.parent.remove(viewerState.selectedMesh);
    }
    if (viewerState.selectedMesh) {
        viewerState.selectedMesh.geometry.dispose();
        if (viewerState.selectedMesh.material) {
            viewerState.selectedMesh.material.dispose();
        }
    }
    viewerState.selectedMesh = null;
}

/**
 * Clear selection outline lines.
 * @param {Object} viewerState - The viewer state object.
 */
export function disposeSelectionOutline(viewerState) {
    if (viewerState.selectionOutline && viewerState.selectionOutline.parent) {
        viewerState.selectionOutline.parent.remove(viewerState.selectionOutline);
    }
    if (viewerState.selectionOutline) {
        viewerState.selectionOutline.geometry.dispose();
    }
    if (viewerState.selectionOutlineMaterial) {
        viewerState.selectionOutlineMaterial.dispose();
    }
    viewerState.selectionOutline = null;
    viewerState.selectionOutlineMaterial = null;
}

/**
 * Clear component boundary outlines.
 * @param {Object} viewerState - The viewer state object.
 */
export function disposeComponentOutlines(viewerState) {
    if (viewerState.componentOutline && viewerState.componentOutline.parent) {
        viewerState.componentOutline.parent.remove(viewerState.componentOutline);
    }
    if (viewerState.componentOutline) {
        viewerState.componentOutline.geometry.dispose();
    }
    if (viewerState.componentOutlineMaterial) {
        viewerState.componentOutlineMaterial.dispose();
    }
    viewerState.componentOutline = null;
    viewerState.componentOutlineMaterial = null;
}

/**
 * Clear global outline around the current mesh anchor.
 * @param {Object} viewerState - The viewer state object.
 */
export function disposeGlobalOutline(viewerState) {
    if (viewerState.globalOutline && viewerState.globalOutline.parent) {
        viewerState.globalOutline.parent.remove(viewerState.globalOutline);
    }
    if (viewerState.globalOutline) {
        viewerState.globalOutline.geometry.dispose();
    }
    if (viewerState.globalOutlineMaterial) {
        viewerState.globalOutlineMaterial.dispose();
    }
    viewerState.globalOutline = null;
    viewerState.globalOutlineMaterial = null;
}

/**
 * Create a faded ghost mesh for non-selected faces when isolating.
 * @param {Array<number>} selectedFaceList - List of selected face indices.
 * @param {Object} viewerState - The viewer state object.
 */
export function rebuildGhostMesh(selectedFaceList, viewerState) {
    disposeGhostMesh(viewerState);
    if (!viewerState.currentMesh || !selectedFaceList || !selectedFaceList.length) return;
    if (!viewerState.basePositions || !viewerState.baseIndices) return;

    const selectedSet = new Set(selectedFaceList);
    const remainingFaces = [];
    for (let f = 0; f < viewerState.baseFaceCount; f++) {
        if (!selectedSet.has(f)) remainingFaces.push(f);
    }
    if (!remainingFaces.length) return;

    // Build non-indexed geometry for remaining faces
    const positions = new Float32Array(remainingFaces.length * 9);
    for (let i = 0; i < remainingFaces.length; i++) {
        const faceIndex = remainingFaces[i];
        const i0 = viewerState.baseIndices[faceIndex * 3 + 0];
        const i1 = viewerState.baseIndices[faceIndex * 3 + 1];
        const i2 = viewerState.baseIndices[faceIndex * 3 + 2];
        const o = i * 9;
        positions[o + 0] = viewerState.basePositions[i0 * 3 + 0];
        positions[o + 1] = viewerState.basePositions[i0 * 3 + 1];
        positions[o + 2] = viewerState.basePositions[i0 * 3 + 2];
        positions[o + 3] = viewerState.basePositions[i1 * 3 + 0];
        positions[o + 4] = viewerState.basePositions[i1 * 3 + 1];
        positions[o + 5] = viewerState.basePositions[i1 * 3 + 2];
        positions[o + 6] = viewerState.basePositions[i2 * 3 + 0];
        positions[o + 7] = viewerState.basePositions[i2 * 3 + 1];
        positions[o + 8] = viewerState.basePositions[i2 * 3 + 2];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        transparent: true,
        opacity: MATERIALS.EDGE_OPACITY,
        metalness: MATERIALS.METALNESS,
        roughness: 0.9,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
    });

    viewerState.ghostMesh = new THREE.Mesh(geom, mat);
    viewerState.ghostMesh.position.copy(viewerState.currentMesh.position);
    viewerState.ghostMesh.renderOrder = 3;
    viewerState.pivot.add(viewerState.ghostMesh);
}

/**
 * Build thick outline lines around the currently selected faces.
 * @param {Array<number>} selectedFaceList - List of selected face indices.
 * @param {THREE.BufferGeometry} displayGeom - The display geometry.
 * @param {THREE.Mesh} targetMesh - The target mesh to attach to.
 * @param {Object} viewerState - The viewer state object.
 */
export function rebuildSelectionOutline(selectedFaceList, displayGeom, targetMesh, viewerState) {
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
        opacity: MATERIALS.HIGHLIGHT_OPACITY,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
    });
    viewerState.renderer.getDrawingBufferSize(viewerState.drawBufferSize);
    viewerState.selectionOutlineMaterial.resolution.set(viewerState.drawBufferSize.x, viewerState.drawBufferSize.y);

    viewerState.selectionOutline = new LineSegments2(lineGeom, viewerState.selectionOutlineMaterial);
    viewerState.selectionOutline.renderOrder = 12;
    targetMesh.add(viewerState.selectionOutline);
}

/**
 * Isolate a set of faces as a temporary selected mesh with ghosted remainder.
 * @param {Array<number>} faceIndices - Array of face indices to focus on.
 * @param {Object} viewerState - The viewer state object.
 */
export function focusComponentFaces(faceIndices, viewerState) {
    if (!viewerState.basePositions || !viewerState.baseIndices) return;
    if (!faceIndices || !faceIndices.length) return;

    // TODO: hideBaseMeshesAndLines
    disposeGhostMesh(viewerState);
    disposeSelectedMesh(viewerState);
    disposeSelectionOutline(viewerState);
    // TODO: disposeOverlay

    rebuildGhostMesh(faceIndices, viewerState);
    const { sourceGeom, displayGeom } = buildGeometryFromFaceList(faceIndices, viewerState);
    const material = new THREE.MeshStandardMaterial({
        metalness: MATERIALS.METALNESS,
        roughness: MATERIALS.ROUGHNESS,
        color: viewerState.baseMeshColor,
    });
    viewerState.selectedMesh = new THREE.Mesh(displayGeom, material);
    viewerState.selectedMesh.castShadow = true;
    viewerState.selectedMesh.receiveShadow = true;
    if (viewerState.currentMesh) {
        viewerState.selectedMesh.position.copy(viewerState.currentMesh.position);
        viewerState.selectedMesh.rotation.copy(viewerState.currentMesh.rotation);
        viewerState.selectedMesh.scale.copy(viewerState.currentMesh.scale);
    }
    viewerState.pivot.add(viewerState.selectedMesh);
    // TODO: syncGlobalOutlineTransform and updateGlobalOutlineVisibility

    rebuildSelectionOutline(faceIndices, displayGeom, viewerState.selectedMesh, viewerState);
    sourceGeom.dispose();
}

/**
 * Clear component isolation, showing the full mesh again.
 * @param {Object} viewerState - The viewer state object.
 */
export function clearComponentFocus(viewerState) {
    disposeGhostMesh(viewerState);
    disposeSelectionOutline(viewerState);
    disposeSelectedMesh(viewerState);
    // TODO: showBaseMeshesAndLines
    // TODO: rebuildComponentOutlines, rebuildGlobalOutline, rebuildEdges
}

/**
 * Show a specific component (by faces) and optionally frame camera on it.
 * @param {Array<number>} faceIndices - Array of face indices.
 * @param {Object} options - Options object with refitCamera flag.
 * @param {Object} viewerState - The viewer state object.
 */
export function showComponent(faceIndices, options = {}, viewerState) {
    const { refitCamera = true } = options;
    if (!viewerState.basePositions || !viewerState.baseIndices) return;
    if (faceIndices && faceIndices.length) {
        focusComponentFaces(faceIndices, viewerState);
        const bounds = getFaceBounds(faceIndices, viewerState);
        if (refitCamera && bounds && (bounds.box || bounds.sphere)) {
            applyFrameToBounds(bounds.sphere || bounds.box, { animate: true }, viewerState);
        }
    } else {
        clearComponentFocus(viewerState);
    }
}

/**
 * Reset to showing all components; refit camera when requested.
 * @param {Object} options - Options object with refitCamera flag.
 * @param {Object} viewerState - The viewer state object.
 */
export function showAllComponents(options = {}, viewerState) {
    const { refitCamera = true } = options;
    clearComponentFocus(viewerState);
    if (refitCamera && viewerState.currentMesh?.geometry) {
        const bounds = getWorldBounds(viewerState.currentMesh.geometry, viewerState);
        if (bounds) {
            applyFrameToBounds(bounds.sphere || bounds.box, { animate: true }, viewerState);
        }
    }
    // TODO: rebuildComponentOutlines, rebuildGlobalOutline, rebuildEdges
}

/**
 * Store component overlay data and rebuild overlay visuals.
 * @param {Array} list - List of component overlay data.
 * @param {Object} viewerState - The viewer state object.
 */
export function setComponentOverlays(list, viewerState) {
    viewerState.componentOverlays = Array.isArray(list) ? list : [];
    if (viewerState.currentMesh && viewerState.currentMesh.geometry) {
        // TODO: rebuildComponentOverlay(viewerState.currentMesh.geometry, viewerState.lastFaceList, viewerState);
    }
    // TODO: rebuildComponentOutlines(viewerState);
}

