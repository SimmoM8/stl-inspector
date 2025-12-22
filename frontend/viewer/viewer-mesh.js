import * as THREE from "three";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";

// Load mesh data from API response and build base geometry arrays.
export function setMeshFromApi(meshData, viewerState) {
    const { vertices, faces } = meshData;
    const { pivot, currentMesh, basePositions, baseIndices, baseFaceCount,
        sourceGeometry, componentOverlays, lastFaceList } = viewerState;

    // Dispose existing resources
    disposeComponentResources(viewerState);

    // Build base geometry arrays
    viewerState.basePositions = new Float32Array(vertices.length * 3);
    for (let i = 0; i < vertices.length; i++) {
        viewerState.basePositions[i * 3 + 0] = vertices[i][0];
        viewerState.basePositions[i * 3 + 1] = vertices[i][1];
        viewerState.basePositions[i * 3 + 2] = vertices[i][2];
    }

    viewerState.baseIndices = new Uint32Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
        viewerState.baseIndices[i * 3 + 0] = faces[i][0];
        viewerState.baseIndices[i * 3 + 1] = faces[i][1];
        viewerState.baseIndices[i * 3 + 2] = faces[i][2];
    }
    viewerState.baseFaceCount = faces.length;

    applyGeometry(null, viewerState, true);
}

// Clear face/vertex remap tables when using full geometry.
export function setIdentityMaps(viewerState) {
    viewerState.faceIndexMap = null;
    viewerState.vertexIndexMap = null;
}

// Build a compact geometry from a subset of faces; keeps maps for remapping.
export function buildGeometryFromFaceList(faceList, viewerState) {
    const { basePositions, baseIndices, baseFaceCount, viewSettings } = viewerState;
    const useFaces = faceList && faceList.length ? faceList : [...Array(baseFaceCount).keys()];
    const positions = [];
    const remappedIndices = new Uint32Array(useFaces.length * 3);
    const vMap = new Map(); // original vertex -> new vertex
    const fMap = new Map(); // original face -> new face

    let outIndex = 0;
    for (let faceCounter = 0; faceCounter < useFaces.length; faceCounter++) {
        const faceIndex = useFaces[faceCounter];
        const i0 = baseIndices[faceIndex * 3 + 0];
        const i1 = baseIndices[faceIndex * 3 + 1];
        const i2 = baseIndices[faceIndex * 3 + 2];
        const verts = [i0, i1, i2];

        for (let v = 0; v < 3; v++) {
            const orig = verts[v];
            let mapped = vMap.get(orig);
            if (mapped === undefined) {
                mapped = vMap.size;
                vMap.set(orig, mapped);
                positions.push(
                    basePositions[orig * 3 + 0],
                    basePositions[orig * 3 + 1],
                    basePositions[orig * 3 + 2]
                );
            }
            remappedIndices[outIndex++] = mapped;
        }
        fMap.set(faceIndex, faceCounter);
    }

    // Stable, indexed geometry that matches our remapped vertex indices.
    // IMPORTANT: highlights and focus calculations should use this geometry so indices stay consistent.
    const sourceGeom = new THREE.BufferGeometry();
    sourceGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    sourceGeom.setIndex(new THREE.BufferAttribute(remappedIndices, 1));

    // Display geometry can be modified for shading (creased normals) without breaking highlight indices.
    let displayGeom = sourceGeom.clone();

    if (viewSettings.cadShading) {
        const creaseAngle = THREE.MathUtils.degToRad(30);
        displayGeom = BufferGeometryUtils.toCreasedNormals(displayGeom, creaseAngle);
    } else {
        displayGeom.computeVertexNormals();
    }

    // Compute bounds for BOTH
    sourceGeom.computeBoundingBox();
    sourceGeom.computeBoundingSphere();
    displayGeom.computeBoundingBox();
    displayGeom.computeBoundingSphere();

    return { sourceGeom, displayGeom, faceMap: fMap, vertexMap: vMap };
}

// Apply a face subset (or full mesh) to the viewer and optionally refit camera.
export function applyGeometry(faceList, viewerState, refitCamera = true) {
    const { pivot, currentMesh, basePositions, baseIndices, viewSettings,
        sourceGeometry, componentOverlays, lastFaceList, sceneScale,
        keyLight, controls, camera, frameTarget } = viewerState;

    if (!basePositions || !baseIndices) return;

    discardHighlights(viewerState);
    viewerState.lastFaceList = faceList && faceList.length ? faceList.slice() : null;
    const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceList, viewerState);

    // Replace sourceGeometry (stable) used for highlight mapping
    if (sourceGeometry) {
        sourceGeometry.dispose();
        sourceGeometry = null;
    }
    viewerState.sourceGeometry = sourceGeom;

    const box = displayGeom.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const minY = box.min.y;

    if (!currentMesh) {
        const material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.8,
            color: viewerState.baseMeshColor,
        });
        viewerState.currentMesh = new THREE.Mesh(displayGeom, material);
        viewerState.currentMesh.castShadow = true;
        viewerState.currentMesh.receiveShadow = true;
        pivot.add(viewerState.currentMesh);
    } else {
        discardHighlights(viewerState);
        currentMesh.geometry.dispose();
        currentMesh.geometry = displayGeom;
        currentMesh.material.color.copy(viewerState.baseMeshColor);
        currentMesh.castShadow = true;
        currentMesh.receiveShadow = true;
    }

    currentMesh.position.set(-center.x, -minY, -center.z);
    const floorY = currentMesh.position.y;
    viewerState.gridHelper.position.y = floorY;
    viewerState.ground.position.y = floorY;

    rebuildEdges(viewerState);
    rebuildGlobalOutline(viewerState);
    applyMaterialSettings(viewerState);
    updateSceneScale(displayGeom, viewerState);
    updateShadowCameraBounds(viewerState);
    rebuildComponentOverlay(displayGeom, faceList, viewerState);
    rebuildComponentOutlines(viewerState);

    viewerState.faceIndexMap = faceList && faceList.length ? faceMap : null;
    viewerState.vertexIndexMap = faceList && faceList.length ? vMap : null;

    if (refitCamera) {
        fitHelpersAndCamera(displayGeom, viewerState);
    } else {
        // keep helpers roughly scaled to new geometry without moving camera/target
        updateHelperScales(displayGeom, viewerState);
    }
}

// Rebuild display geometry using the last face list without moving camera.
export function refreshDisplayGeometry(faceList, viewerState) {
    const { basePositions, baseIndices, currentMesh, sourceGeometry,
        componentOverlays, lastFaceList, viewSettings } = viewerState;

    if (!basePositions || !baseIndices || !currentMesh) return;
    const faceListSafe = faceList && faceList.length ? faceList.slice() : null;
    const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceListSafe, viewerState);

    if (sourceGeometry) {
        sourceGeometry.dispose();
        sourceGeometry = null;
    }
    viewerState.sourceGeometry = sourceGeom;

    const prevPosition = currentMesh.position.clone();
    const prevRotation = currentMesh.rotation.clone();
    const prevScale = currentMesh.scale.clone();

    currentMesh.geometry.dispose();
    currentMesh.geometry = displayGeom;
    currentMesh.position.copy(prevPosition);
    currentMesh.rotation.copy(prevRotation);
    currentMesh.scale.copy(prevScale);

    rebuildEdges(viewerState);
    rebuildGlobalOutline(viewerState);
    applyMaterialSettings(viewerState);
    updateSceneScale(displayGeom, viewerState);
    updateShadowCameraBounds(viewerState);
    rebuildComponentOverlay(displayGeom, faceListSafe, viewerState);
    rebuildComponentOutlines(viewerState);

    viewerState.faceIndexMap = faceListSafe && faceListSafe.length ? faceMap : null;
    viewerState.vertexIndexMap = faceListSafe && faceListSafe.length ? vMap : null;
}

// Dispose of component-related resources.
function disposeComponentResources(viewerState) {
    const { overlayMesh, ghostMesh, selectedMesh, selectionOutline,
        selectionOutlineMaterial, componentOutline, componentOutlineMaterial,
        globalOutline, globalOutlineMaterial, componentOverlays } = viewerState;

    disposeOverlay(viewerState);
    viewerState.componentOverlays = [];
    disposeGhostMesh(viewerState);
    disposeSelectedMesh(viewerState);
    disposeSelectionOutline(viewerState);
    disposeComponentOutlines(viewerState);
    disposeGlobalOutline(viewerState);
}

// Import other mesh-related functions that will be defined in other files
// These will be imported at the top when the files are created
import { rebuildEdges, rebuildGlobalOutline, applyMaterialSettings, updateSceneScale, updateShadowCameraBounds, rebuildComponentOverlay, rebuildComponentOutlines, fitHelpersAndCamera, updateHelperScales, disposeOverlay, disposeGhostMesh, disposeSelectedMesh, disposeSelectionOutline, disposeComponentOutlines, disposeGlobalOutline } from "./viewer-view-settings.js";