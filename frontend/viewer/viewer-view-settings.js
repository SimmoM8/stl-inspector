import * as THREE from "three";
import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js";
import { getComponentColor } from "../components/colors.js";

// Apply render toggles (wireframe, xray, helpers) to current mesh.
export function applyMaterialSettings(viewerState) {
    const { currentMesh, viewSettings, gridHelper, axesHelper, ground } = viewerState;
    if (!currentMesh) return;
    currentMesh.material.wireframe = viewSettings.wireframe;
    currentMesh.material.transparent = viewSettings.xray;
    currentMesh.material.opacity = viewSettings.xray ? 0.4 : 1.0;
    currentMesh.material.needsUpdate = true;

    gridHelper.visible = viewSettings.grid;
    axesHelper.visible = viewSettings.axes;
    ground.visible = viewSettings.grid;
}

// Update ambient occlusion kernel size based on scene scale.
export function updateSaoKernelRadius(viewerState) {
    const { sceneScale, saoPass } = viewerState;
    const kernelRadius = THREE.MathUtils.clamp(sceneScale * 0.02, 2, 24);
    saoPass.params.saoKernelRadius = kernelRadius;
}

// Convert desired edge width to pixel width that scales with model size.
export function getEdgeLineWidthPx(viewerState) {
    const { sceneScale } = viewerState;
    const width = 1.8 / Math.sqrt(sceneScale);
    return THREE.MathUtils.clamp(width, 1.2, 2.2);
}

// Convert highlight edge width to a scale-aware pixel width.
export function getHighlightLineWidthPx(viewerState) {
    const { sceneScale } = viewerState;
    const width = 8 / Math.sqrt(sceneScale);
    return THREE.MathUtils.clamp(width, 6, 10);
}

// Track overall scene scale so helpers/shadows scale correctly.
export function updateSceneScale(geometry, viewerState) {
    const { sceneScale } = viewerState;
    if (!geometry) {
        viewerState.sceneScale = 1;
        updateSaoKernelRadius(viewerState);
        return;
    }
    if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
    }
    const box = geometry.boundingBox;
    if (!box) {
        viewerState.sceneScale = 1;
        updateSaoKernelRadius(viewerState);
        return;
    }
    const size = new THREE.Vector3();
    box.getSize(size);
    const diag = size.length();
    viewerState.sceneScale = diag > 0 ? diag : 1;
    updateSaoKernelRadius(viewerState);
}

// Shadows - Resize shadow camera bounds based on model scale to avoid clipping.
export function updateShadowCameraBounds(viewerState) {
    const { keyLight, sceneScale } = viewerState;
    if (!keyLight.shadow || !keyLight.shadow.camera) return;
    const extent = sceneScale * 0.6;
    const near = Math.max(0.1, sceneScale * 0.01);
    const far = sceneScale * 6;
    const cam = keyLight.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = near;
    cam.far = far;
    cam.updateProjectionMatrix();
}

// Helpers - Choose helper radius based on geometry bounds or fallback scale.
export function getHelperRadius(geometry, viewerState) {
    const { sceneScale } = viewerState;
    const fallback = sceneScale * 0.5;
    if (!geometry || !geometry.boundingSphere) return fallback;
    const r = geometry.boundingSphere.radius;
    return Number.isFinite(r) && r > 0 ? r : fallback;
}

// Rebuild the grid helper to match current scale/visibility.
export function rebuildGridHelper(size, divisions, viewerState) {
    const { gridHelper, viewSettings, scene } = viewerState;
    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper.geometry.dispose();
        if (Array.isArray(gridHelper.material)) {
            gridHelper.material.forEach((mat) => mat.dispose());
        } else {
            gridHelper.material.dispose();
        }
    }
    viewerState.gridHelper = new THREE.GridHelper(size, divisions);
    viewerState.gridHelper.position.y = 0;
    viewerState.gridHelper.visible = viewSettings.grid;
    scene.add(viewerState.gridHelper);
}

// Resize helpers (axes, grid, ground) after geometry changes; call post-mesh load.
export function updateHelperScales(geometry, viewerState) {
    const { axesHelper, gridHelper, ground, sceneScale } = viewerState;
    const r = getHelperRadius(geometry, viewerState);
    axesHelper.scale.setScalar(r);
    const gridSize = Math.max(2, r * 4);
    const divisions = Math.round(THREE.MathUtils.clamp(gridSize / (r * 0.1), 20, 100));
    rebuildGridHelper(gridSize, divisions, viewerState);
    ground.scale.setScalar(gridSize / 10);
    ground.position.y = 0;
}

// Build edge lines for the current mesh according to edge mode.
export function rebuildEdges(viewerState) {
    const { currentMesh, viewSettings, scene, pivot, edgeLineMaterial, drawBufferSize, renderer } = viewerState;
    if (!currentMesh) return;
    if (currentMesh.edges) {
        currentMesh.remove(currentMesh.edges);
        currentMesh.edges.geometry.dispose();
        currentMesh.edges.material.dispose();
        currentMesh.edges = null;
        viewerState.edgeLineMaterial = null;
    }

    if (viewSettings.edgeMode === "off") return;

    let threshold = viewSettings.edgeThreshold;
    if (viewSettings.edgeMode === "all") threshold = 0.1;

    const edgesGeom = new THREE.EdgesGeometry(currentMesh.geometry, threshold);
    const positions = edgesGeom.getAttribute("position").array;
    const lineGeom = new LineSegmentsGeometry();
    lineGeom.setPositions(positions);
    edgesGeom.dispose();

    viewerState.edgeLineMaterial = new LineMaterial({
        color: 0x111827,
        linewidth: getEdgeLineWidthPx(viewerState),
        transparent: true,
        opacity: 0.95,
        depthTest: true,
    });
    renderer.getDrawingBufferSize(drawBufferSize);
    viewerState.edgeLineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

    currentMesh.edges = new LineSegments2(lineGeom, viewerState.edgeLineMaterial);
    currentMesh.edges.renderOrder = 10;
    currentMesh.add(currentMesh.edges);
}

// Remove component overlay mesh safely.
export function disposeOverlay(viewerState) {
    const { overlayMesh } = viewerState;
    if (overlayMesh && overlayMesh.parent) {
        overlayMesh.parent.remove(overlayMesh);
    }
    if (overlayMesh) {
        overlayMesh.geometry.dispose();
        overlayMesh.material.dispose();
    }
    viewerState.overlayMesh = null;
}

// Build a translucent overlay per component to visualize grouping.
export function rebuildComponentOverlay(displayGeom, faceList, viewerState) {
    const { currentMesh, componentOverlays, viewSettings, baseFaceCount, baseIndices } = viewerState;
    // Only show overlays when full mesh is displayed (no face subset)
    disposeOverlay(viewerState);
    if (!currentMesh || !displayGeom || faceList) return;
    if (!Array.isArray(componentOverlays) || !componentOverlays.length) return;
    if (viewSettings.componentMode) return;
    const indexAttr = displayGeom.getIndex();
    const posAttr = displayGeom.getAttribute("position");
    if (!indexAttr || !posAttr) return;
    const faceCount = indexAttr.count / 3;
    if (!Number.isFinite(faceCount) || faceCount <= 0) return;

    const colorArray = new Float32Array(posAttr.count * 3);
    colorArray.fill(1); // default white so unassigned verts stay bright
    for (const comp of componentOverlays) {
        const colorHex = getComponentColor(comp.componentIndex);
        const c = new THREE.Color(colorHex);
        const ghosted = !!comp.ghosted;
        if (ghosted) {
            c.lerp(new THREE.Color(0x8a8f9a), 0.8); // soften ghosted components
        }
        for (const faceIndex of comp.faceIndices) {
            if (faceIndex < 0 || faceIndex >= faceCount) continue;
            const i0 = indexAttr.getX(faceIndex * 3 + 0);
            const i1 = indexAttr.getX(faceIndex * 3 + 1);
            const i2 = indexAttr.getX(faceIndex * 3 + 2);
            const assign = (vi) => {
                colorArray[vi * 3 + 0] = c.r;
                colorArray[vi * 3 + 1] = c.g;
                colorArray[vi * 3 + 2] = c.b;
            };
            assign(i0);
            assign(i1);
            assign(i2);
        }
    }

    const overlayGeom = displayGeom.clone();
    overlayGeom.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));

    const overlayMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });

    viewerState.overlayMesh = new THREE.Mesh(overlayGeom, overlayMat);
    viewerState.overlayMesh.renderOrder = 5;
    currentMesh.add(viewerState.overlayMesh);
}

// Clear component boundary outlines.
export function disposeComponentOutlines(viewerState) {
    const { componentOutline, componentOutlineMaterial } = viewerState;
    if (componentOutline && componentOutline.parent) {
        componentOutline.parent.remove(componentOutline);
    }
    if (componentOutline) {
        componentOutline.geometry.dispose();
    }
    if (componentOutlineMaterial) {
        componentOutlineMaterial.dispose();
    }
    viewerState.componentOutline = null;
    viewerState.componentOutlineMaterial = null;
}

// Recompute per-component outlines for componentMode highlighting.
export function rebuildComponentOutlines(viewerState) {
    const { viewSettings, currentMesh, componentOverlays, basePositions, baseIndices,
        baseFaceCount, componentOutline, componentOutlineMaterial, renderer, drawBufferSize } = viewerState;
    disposeComponentOutlines(viewerState);
    if (!viewSettings.componentMode) return;
    if (!currentMesh) return;
    if (!Array.isArray(componentOverlays) || !componentOverlays.length) return;
    if (!basePositions || !baseIndices || !baseFaceCount) return;

    const faceToComponent = new Int32Array(baseFaceCount).fill(-1);
    for (const comp of componentOverlays) {
        const faces = Array.isArray(comp.faceIndices) ? comp.faceIndices : [];
        for (const faceIndex of faces) {
            if (faceIndex < 0 || faceIndex >= baseFaceCount) continue;
            faceToComponent[faceIndex] = comp.componentIndex;
        }
    }

    const edgeMap = new Map();
    for (let faceIndex = 0; faceIndex < baseFaceCount; faceIndex++) {
        const i0 = baseIndices[faceIndex * 3 + 0];
        const i1 = baseIndices[faceIndex * 3 + 1];
        const i2 = baseIndices[faceIndex * 3 + 2];
        const edges = [
            [i0, i1],
            [i1, i2],
            [i2, i0],
        ];
        for (const [a, b] of edges) {
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            const arr = edgeMap.get(key);
            if (arr) {
                if (arr.length < 2) arr.push(faceIndex);
            } else {
                edgeMap.set(key, [faceIndex]);
            }
        }
    }

    const boundaryPositions = [];
    const boundaryColors = [];
    for (const [key, faces] of edgeMap.entries()) {
        if (!faces.length || faces.length > 2) continue;
        const faceA = faces[0];
        const faceB = faces.length === 2 ? faces[1] : -1;
        const compA = faceToComponent[faceA];
        const compB = faceB >= 0 ? faceToComponent[faceB] : -1;

        const isBoundary = faces.length === 1;
        const isBetweenComponents = faces.length === 2 && compA !== compB;
        if (!isBoundary && !isBetweenComponents) continue;
        if (compA < 0) continue;

        const compColor = new THREE.Color(getComponentColor(compA));

        const [aStr, bStr] = key.split("_");
        const a = Number(aStr);
        const b = Number(bStr);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

        boundaryPositions.push(
            basePositions[a * 3 + 0], basePositions[a * 3 + 1], basePositions[a * 3 + 2],
            basePositions[b * 3 + 0], basePositions[b * 3 + 1], basePositions[b * 3 + 2]
        );
        boundaryColors.push(
            compColor.r, compColor.g, compColor.b,
            compColor.r, compColor.g, compColor.b
        );
    }

    if (!boundaryPositions.length) return;

    const lineGeom = new LineSegmentsGeometry();
    lineGeom.setPositions(new Float32Array(boundaryPositions));
    lineGeom.setColors(new Float32Array(boundaryColors));

    viewerState.componentOutlineMaterial = new LineMaterial({
        vertexColors: true,
        linewidth: Math.max(1.8, getEdgeLineWidthPx(viewerState) * 1.2),
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
    renderer.getDrawingBufferSize(drawBufferSize);
    viewerState.componentOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

    viewerState.componentOutline = new LineSegments2(lineGeom, viewerState.componentOutlineMaterial);
    viewerState.componentOutline.renderOrder = 11;
    viewerState.componentOutline.visible = viewSettings.componentMode;
    currentMesh.add(viewerState.componentOutline);
}

// Decide which mesh the global outline should follow.
export function outlineAnchor(viewerState) {
    return viewerState.selectedMesh || viewerState.currentMesh;
}

// Keep global outline aligned with its anchor mesh.
export function syncGlobalOutlineTransform(viewerState) {
    const { globalOutline } = viewerState;
    if (!globalOutline) return;
    const anchor = outlineAnchor(viewerState);
    if (!anchor) return;
    globalOutline.position.copy(anchor.position);
    globalOutline.rotation.copy(anchor.rotation);
    globalOutline.scale.copy(anchor.scale);
}

// Toggle global outline visibility based on settings and anchor visibility.
export function updateGlobalOutlineVisibility(viewerState) {
    const { globalOutline, viewSettings } = viewerState;
    if (!globalOutline) return;
    const anchor = outlineAnchor(viewerState);
    const anchorVisible = !!anchor && anchor.visible !== false;
    globalOutline.visible = !!viewSettings.outlineEnabled && anchorVisible;
}

// Build the outer outline mesh that sits around the active mesh.
export function rebuildGlobalOutline(viewerState) {
    const { viewSettings, globalOutline, globalOutlineMaterial, pivot, renderer, drawBufferSize } = viewerState;
    disposeGlobalOutline(viewerState);
    if (!viewSettings.outlineEnabled) return;
    const anchor = outlineAnchor(viewerState);
    if (!anchor || !anchor.geometry) return;

    const threshold = Number.isFinite(viewSettings.edgeThreshold) ? viewSettings.edgeThreshold : 12;
    const edgesGeom = new THREE.EdgesGeometry(anchor.geometry, threshold);

    const posAttr = edgesGeom.getAttribute("position");
    if (!posAttr || !posAttr.array || !posAttr.array.length) {
        edgesGeom.dispose();
        return;
    }
    const lineGeom = new LineSegmentsGeometry();
    lineGeom.setPositions(posAttr.array);
    edgesGeom.dispose();

    viewerState.globalOutlineMaterial = new LineMaterial({
        color: 0x111111,
        linewidth: Math.max(1.5, getEdgeLineWidthPx(viewerState)),
        transparent: true,
        opacity: 0.9,
        depthTest: true,
    });
    renderer.getDrawingBufferSize(drawBufferSize);
    viewerState.globalOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

    viewerState.globalOutline = new LineSegments2(lineGeom, viewerState.globalOutlineMaterial);
    viewerState.globalOutline.renderOrder = 9;
    pivot.add(viewerState.globalOutline);
    syncGlobalOutlineTransform(viewerState);
    updateGlobalOutlineVisibility(viewerState);
}

// Clear global outline around the current mesh anchor.
export function disposeGlobalOutline(viewerState) {
    const { globalOutline, globalOutlineMaterial } = viewerState;
    if (globalOutline && globalOutline.parent) {
        globalOutline.parent.remove(globalOutline);
    }
    if (globalOutline) {
        globalOutline.geometry.dispose();
    }
    if (globalOutlineMaterial) {
        globalOutlineMaterial.dispose();
    }
    viewerState.globalOutline = null;
    viewerState.globalOutlineMaterial = null;
}

// Apply view settings updates and rebuild dependent visuals.
export function setViewSettings(partial, viewerState) {
    const { viewSettings, renderer, saoPass, currentMesh, lastFaceList } = viewerState;
    clearHighlights(viewerState);
    Object.assign(viewSettings, partial);
    renderer.toneMappingExposure = Math.max(0.2, viewSettings.exposure);

    if (partial.ssao !== undefined) {
        saoPass.enabled = !!viewSettings.ssao;
    }

    if (partial.cadShading !== undefined) {
        refreshDisplayGeometry(lastFaceList, viewerState);
    } else {
        rebuildEdges(viewerState);
        applyMaterialSettings(viewerState);
        if (partial.edgeThreshold !== undefined) {
            rebuildGlobalOutline(viewerState);
        }
    }

    if (partial.componentMode !== undefined) {
        disposeOverlay(viewerState);
        if (currentMesh?.geometry && !viewSettings.componentMode) {
            rebuildComponentOverlay(currentMesh.geometry, lastFaceList, viewerState);
        }
        rebuildComponentOutlines(viewerState);
        updateGlobalOutlineVisibility(viewerState);
    }

    if (partial.outlineEnabled !== undefined) {
        rebuildGlobalOutline(viewerState);
    } else {
        updateGlobalOutlineVisibility(viewerState);
    }
}

// Return a copy of current view settings.
export function getViewSettings(viewerState) {
    return { ...viewerState.viewSettings };
}

// Restore default view settings and re-render.
export function resetViewSettings(viewerState) {
    setViewSettings({
        edgeThreshold: 12,
        edgeMode: "feature",
        cadShading: true,
        wireframe: false,
        xray: false,
        grid: true,
        axes: true,
        exposure: 1.9,
        ssao: false,
        outlineEnabled: true,
        componentMode: false,
    }, viewerState);
}

// Import functions that will be defined in other files
import { clearHighlights, refreshDisplayGeometry } from "./viewer-highlight.js";
import { buildGeometryFromFaceList } from "./viewer-mesh.js";