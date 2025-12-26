import * as THREE from "three";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import { applyMaterialSettings, updateSceneScale, updateShadowCameraBounds, rebuildComponentOverlay, rebuildComponentOutlines, rebuildGlobalOutline, rebuildEdges, updateHelperScales, disposeOverlay } from "./viewer-view-settings.js";
import { discardHighlights } from "./viewer-highlight.js";
import { disposeGhostMesh, disposeSelectedMesh, disposeSelectionOutline, disposeComponentOutlines, disposeGlobalOutline } from "./viewer-components.js";
import { fitHelpersAndCamera } from "./viewer-camera.js";
import { buildGeometryFromFaceList } from "./viewer-geometry.js";

/**
 * Clears face and vertex remap tables when using full geometry.
 * This is used to reset mappings back to identity when displaying the complete mesh.
 */
export function setIdentityMaps(viewerState) {
    viewerState.faceIndexMap = null;
    viewerState.vertexIndexMap = null;
}

/**
 * Loads mesh data from API response and builds base geometry arrays.
 * This function processes vertex and face data from the server and prepares it for rendering.
 * @param {Object} meshData - Object containing vertices and faces arrays from the API.
 * @param {Object} viewerState - The viewer state object to update with mesh data.
 */
export function setMeshFromApi(meshData, viewerState) {
    const { vertices, faces } = meshData;

    // Dispose of existing overlays and components
    disposeOverlay(viewerState);
    viewerState.componentOverlays = [];
    disposeGhostMesh(viewerState);
    disposeSelectedMesh(viewerState);
    disposeSelectionOutline(viewerState);
    disposeComponentOutlines(viewerState);
    disposeGlobalOutline(viewerState);

    // Convert vertices array to flat Float32Array
    viewerState.basePositions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i++) {
        viewerState.basePositions[i * 3 + 0] = vertices[i][0];
        viewerState.basePositions[i * 3 + 1] = vertices[i][1];
        viewerState.basePositions[i * 3 + 2] = vertices[i][2];
    }

    // Convert faces array to flat Uint32Array of indices
    viewerState.baseIndices = new Uint32Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
        viewerState.baseIndices[i * 3 + 0] = faces[i][0];
        viewerState.baseIndices[i * 3 + 1] = faces[i][1];
        viewerState.baseIndices[i * 3 + 2] = faces[i][2];
    }
    viewerState.baseFaceCount = faces.length;

    // Apply the full geometry and reset mappings
    applyGeometry(null, true, viewerState);
    setIdentityMaps(viewerState);
}

/**
 * Applies a face subset (or full mesh) to the viewer and optionally refits the camera.
 * This function builds the geometry for the specified faces and updates the scene.
 * @param {Array<number>} faceList - Array of face indices to display, or null for all faces.
 * @param {boolean} refitCamera - Whether to automatically adjust camera position and helpers.
 * @param {Object} viewerState - The viewer state object.
 */
export function applyGeometry(faceList, refitCamera = true, viewerState) {
    if (!viewerState.basePositions || !viewerState.baseIndices) return;

    // Clear any existing highlights
    discardHighlights(viewerState);

    // Store the current face list for refresh operations
    viewerState.lastFaceList = faceList && faceList.length ? faceList.slice() : null;

    // Build geometry from the face list
    const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceList, viewerState);

    // Replace sourceGeometry (stable geometry for highlight mapping)
    if (viewerState.sourceGeometry) {
        viewerState.sourceGeometry.dispose();
        viewerState.sourceGeometry = null;
    }
    viewerState.sourceGeometry = sourceGeom;

    // Calculate mesh positioning based on bounding box
    const box = displayGeom.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const minY = box.min.y;

    // Create or update the current mesh
    if (!viewerState.currentMesh) {
        const material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.8,
            color: viewerState.baseMeshColor,
        });
        viewerState.currentMesh = new THREE.Mesh(displayGeom, material);
        viewerState.currentMesh.castShadow = true;
        viewerState.currentMesh.receiveShadow = true;
        viewerState.pivot.add(viewerState.currentMesh);
    } else {
        discardHighlights(viewerState);
        viewerState.currentMesh.geometry.dispose();
        viewerState.currentMesh.geometry = displayGeom;
        viewerState.currentMesh.material.color.copy(viewerState.baseMeshColor);
        viewerState.currentMesh.castShadow = true;
        viewerState.currentMesh.receiveShadow = true;
    }

    // Position the mesh so it sits on the ground plane
    viewerState.currentMesh.position.set(-center.x, -minY, -center.z);
    const floorY = viewerState.currentMesh.position.y;
    viewerState.gridHelper.position.y = floorY;
    viewerState.ground.position.y = floorY;

    // Update various visual elements
    rebuildEdges(viewerState);
    rebuildGlobalOutline(viewerState);
    applyMaterialSettings(viewerState);
    updateSceneScale(displayGeom, viewerState);
    updateShadowCameraBounds(viewerState);
    rebuildComponentOverlay(displayGeom, faceList, viewerState);
    rebuildComponentOutlines(viewerState);

    // Update index mappings
    viewerState.faceIndexMap = faceList && faceList.length ? faceMap : null;
    viewerState.vertexIndexMap = faceList && faceList.length ? vMap : null;

    if (refitCamera) {
        fitHelpersAndCamera(displayGeom, viewerState);
    } else {
        // Keep helpers roughly scaled to new geometry without moving camera/target
        updateHelperScales(displayGeom, viewerState);
    }
}

/**
 * Rebuilds display geometry using the last face list without moving the camera.
 * This is useful for updating visual settings without changing the view.
 * @param {Array<number>} faceList - Optional face list to use instead of the last one.
 * @param {Object} viewerState - The viewer state object.
 */
export function refreshDisplayGeometry(faceList = null, viewerState) {
    if (!viewerState.basePositions || !viewerState.baseIndices || !viewerState.currentMesh) return;

    const faceListSafe = faceList && faceList.length ? faceList.slice() : viewerState.lastFaceList;
    const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceListSafe, viewerState);

    // Replace source geometry
    if (viewerState.sourceGeometry) {
        viewerState.sourceGeometry.dispose();
        viewerState.sourceGeometry = null;
    }
    viewerState.sourceGeometry = sourceGeom;

    // Preserve current mesh transform
    const prevPosition = viewerState.currentMesh.position.clone();
    const prevRotation = viewerState.currentMesh.rotation.clone();
    const prevScale = viewerState.currentMesh.scale.clone();

    // Update geometry
    viewerState.currentMesh.geometry.dispose();
    viewerState.currentMesh.geometry = displayGeom;
    viewerState.currentMesh.position.copy(prevPosition);
    viewerState.currentMesh.rotation.copy(prevRotation);
    viewerState.currentMesh.scale.copy(prevScale);

    // Update visual elements
    rebuildEdges(viewerState);
    rebuildGlobalOutline(viewerState);
    applyMaterialSettings(viewerState);

    // Update mappings
    viewerState.faceIndexMap = faceListSafe && faceListSafe.length ? faceMap : null;
    viewerState.vertexIndexMap = faceListSafe && faceListSafe.length ? vMap : null;
}

