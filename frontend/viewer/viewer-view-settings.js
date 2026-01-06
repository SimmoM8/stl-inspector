import * as THREE from "three";
import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js";
import { getComponentColor } from "../components/colors.js";
import { refreshSelectedComponentColor } from "./viewer-components.js";

// Compute world-space floor (mesh minY after translation). This should be ~0 when the mesh is seated on the grid.
function getFloorY(viewerState) {
    const mesh = viewerState.currentMesh;
    if (!mesh || !mesh.geometry) return 0;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const minY = mesh.geometry.boundingBox?.min?.y;
    const posY = mesh.position?.y;
    if (!Number.isFinite(minY) || !Number.isFinite(posY)) return 0;
    return minY + posY;
}

// Keep helpers aligned to the computed mesh floor (expected to be y≈0).
export function setFloorHeight(viewerState) {
    const floorY = getFloorY(viewerState);
    if (viewerState.gridHelper) viewerState.gridHelper.position.y = floorY;
    if (viewerState.axesHelper) viewerState.axesHelper.position.y = floorY;
    if (viewerState.ground) viewerState.ground.position.y = floorY;
}

// Apply render toggles (wireframe, xray, helpers) to current mesh.
export function applyMaterialSettings(viewerState) {
    const { currentMesh, selectedMesh, viewSettings, gridHelper, axesHelper, ground, selectedComponentIndex, baseMeshColor,
        componentOutlineMaterial, selectionOutline, selectionOutlineMaterial } = viewerState;
    applyShadingMode(viewerState);

    // Apply vertex colors before setting material flags
    const hasVertexColors = applyComponentVertexColors(viewerState);

    const targets = [currentMesh, selectedMesh].filter(Boolean);
    for (const mesh of targets) {
        if (!mesh.material) continue;
        // Vertex colors should ONLY be used in wireframe mode with colors enabled
        const shouldUseVertexColors = !!(hasVertexColors && mesh === currentMesh && viewSettings.wireframe);

        // Vertex colors requires shader recompilation - dispose old material if flag changes
        if (mesh.material.vertexColors !== shouldUseVertexColors) {
            const oldMat = mesh.material;

            // Use MeshBasicMaterial for wireframe+vertexColors since StandardMaterial doesn't support it well
            if (viewSettings.wireframe && shouldUseVertexColors) {
                mesh.material = new THREE.MeshBasicMaterial({
                    vertexColors: true,
                    wireframe: true,
                });
            } else {
                mesh.material = new THREE.MeshStandardMaterial({
                    metalness: oldMat.metalness,
                    roughness: oldMat.roughness,
                    color: oldMat.color.clone(),
                    vertexColors: shouldUseVertexColors,
                    wireframe: viewSettings.wireframe,
                    transparent: viewSettings.xray,
                    opacity: viewSettings.xray ? 0.4 : 1.0,
                    flatShading: oldMat.flatShading,
                });
            }
            oldMat.dispose();
        } else {
            mesh.material.wireframe = viewSettings.wireframe;
            mesh.material.transparent = viewSettings.xray;
            mesh.material.opacity = viewSettings.xray ? 0.4 : 1.0;
        }
        mesh.material.needsUpdate = true;
    }

    // Handle selectedMesh colors: in wireframe mode with colors enabled, apply vertex colors to isolated component
    if (selectedMesh && selectedMesh.material) {
        const hasComponent = Number.isInteger(selectedComponentIndex);
        
        if (viewSettings.wireframe && viewSettings.componentColors && hasComponent) {
            // Apply vertex colors to the selected mesh in wireframe mode
            applySelectedMeshVertexColors(selectedMesh, selectedComponentIndex, viewerState);
        } else if (!viewSettings.wireframe) {
            // In non-wireframe mode, use material color instead
            const targetColor = hasComponent && viewSettings.componentColors
                ? new THREE.Color(getComponentColor(selectedComponentIndex))
                : baseMeshColor;
            if (targetColor) {
                selectedMesh.material.color.copy(targetColor);
                selectedMesh.material.vertexColors = false;
                selectedMesh.material.needsUpdate = true;
            }
        }
    }

    gridHelper.visible = viewSettings.grid;
    axesHelper.visible = viewSettings.axes;
    ground.visible = viewSettings.grid;

    // In xray mode the mesh still writes depth, so outlines can get hidden.
    const outlineDepthTest = !viewSettings.xray;
    const outlineDepthWrite = !viewSettings.xray;
    const outlineMats = [componentOutlineMaterial, selectionOutlineMaterial].filter(Boolean);
    for (const mat of outlineMats) {
        mat.depthTest = outlineDepthTest;
        mat.depthWrite = outlineDepthWrite;
        mat.needsUpdate = true;
    }

    // Selection outline stays visible while a component is selected.
    if (selectionOutline) selectionOutline.visible = !!selectedMesh && selectedMesh.visible !== false;
}

// Apply vertex colors to an isolated selected mesh in wireframe mode.
function applySelectedMeshVertexColors(selectedMesh, componentIndex, viewerState) {
    if (!selectedMesh || !selectedMesh.geometry) return;
    const geom = selectedMesh.geometry;
    const posAttr = geom.getAttribute("position");
    const indexAttr = geom.getIndex();
    if (!posAttr || !indexAttr) return;

    const colorArray = new Float32Array(posAttr.count * 3);
    const colorHex = getComponentColor(componentIndex);
    const c = new THREE.Color(colorHex);

    // Set all vertices to the component color
    for (let i = 0; i < posAttr.count; i++) {
        colorArray[i * 3 + 0] = c.r;
        colorArray[i * 3 + 1] = c.g;
        colorArray[i * 3 + 2] = c.b;
    }

    const colorAttr = new THREE.BufferAttribute(colorArray, 3);
    geom.setAttribute("color", colorAttr);
    colorAttr.needsUpdate = true;

    // Update material to use vertex colors
    if (selectedMesh.material) {
        if (!selectedMesh.material.vertexColors) {
            const oldMat = selectedMesh.material;
            selectedMesh.material = new THREE.MeshBasicMaterial({
                vertexColors: true,
                wireframe: true,
            });
            oldMat.dispose();
        }
        selectedMesh.material.needsUpdate = true;
    }
}

// When wireframe + componentColors are enabled, color vertices per-component on the main mesh.
// Returns true if vertex colors were applied, false otherwise.
function applyComponentVertexColors(viewerState) {
    const { currentMesh, viewSettings, componentOverlays, faceIndexMap } = viewerState;
    if (!currentMesh || !currentMesh.geometry) return false;
    const geom = currentMesh.geometry;
    const posAttr = geom.getAttribute("position");
    const indexAttr = geom.getIndex();
    if (!posAttr || !indexAttr) return false;

    const shouldColor = !!(viewSettings.componentColors && viewSettings.wireframe && !viewSettings.componentMode);

    if (!shouldColor) {
        if (geom.getAttribute("color")) {
            geom.deleteAttribute("color");
            geom.attributes.position.needsUpdate = true;
        }
        return false;
    }

    const faceCount = indexAttr.count / 3;
    const colorArray = new Float32Array(posAttr.count * 3);

    // Default all vertices to white
    for (let i = 0; i < colorArray.length; i++) {
        colorArray[i] = 1.0;
    }

    // Apply component colors if overlays exist
    if (componentOverlays && componentOverlays.length > 0) {
        const faceMap = faceIndexMap instanceof Map ? faceIndexMap : null;

        for (const comp of componentOverlays) {
            const colorHex = getComponentColor(comp.componentIndex);
            const c = new THREE.Color(colorHex);
            if (comp.ghosted) {
                c.lerp(new THREE.Color(0x8a8f9a), 0.8);
            }
            const faces = Array.isArray(comp.faceIndices) ? comp.faceIndices : [];
            for (const originalFace of faces) {
                const mappedFace = faceMap ? faceMap.get(originalFace) : originalFace;
                if (!Number.isInteger(mappedFace) || mappedFace < 0 || mappedFace >= faceCount) continue;
                const i0 = indexAttr.getX(mappedFace * 3 + 0);
                const i1 = indexAttr.getX(mappedFace * 3 + 1);
                const i2 = indexAttr.getX(mappedFace * 3 + 2);
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
    }

    const colorAttr = new THREE.BufferAttribute(colorArray, 3);
    geom.setAttribute("color", colorAttr);
    colorAttr.needsUpdate = true;

    return true;
}

// Toggle flat/smooth shading on active meshes based on cadShading flag.
export function applyShadingMode(viewerState) {
    const flat = !!viewerState.viewSettings.cadShading;
    const applyToMesh = (mesh) => {
        if (!mesh || !mesh.material) return;
        if (mesh.material.flatShading !== flat) {
            mesh.material.flatShading = flat;
            mesh.material.needsUpdate = true;
        }
    };
    applyToMesh(viewerState.currentMesh);
    applyToMesh(viewerState.selectedMesh);
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
    const { axesHelper, ground, currentMesh } = viewerState;
    const r = getHelperRadius(geometry, viewerState);
    axesHelper.scale.setScalar(r);
    const gridSize = Math.max(2, r * 4);
    const divisions = Math.round(THREE.MathUtils.clamp(gridSize / (r * 0.1), 20, 100));
    rebuildGridHelper(gridSize, divisions, viewerState);
    setFloorHeight(viewerState);
    ground.scale.setScalar(gridSize / 10);
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
    // Skip overlay when wireframe+componentColors: we rely on vertex colors instead of face overlay.
    if (viewSettings.wireframe && viewSettings.componentColors) return;
    if (!currentMesh || !displayGeom || faceList) return;
    if (!Array.isArray(componentOverlays) || !componentOverlays.length) return;
    if (!viewSettings.componentColors || viewSettings.componentMode) return;
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


// Rebuild selection outline when view settings change (used to update colors)
function rebuildSelectionOutlineForSettings(faceList, viewerState) {
    const { selectedMesh } = viewerState;
    if (!selectedMesh || !selectedMesh.geometry || !faceList) return;
    rebuildSelectionOutline(faceList, selectedMesh.geometry, selectedMesh, viewerState);
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
        applyShadingMode(viewerState);
        rebuildEdges(viewerState);
    } else {
        rebuildEdges(viewerState);
    }

    if (partial.componentMode !== undefined) {
        disposeOverlay(viewerState);
        if (currentMesh?.geometry && viewSettings.componentColors && !viewSettings.componentMode) {
            rebuildComponentOverlay(currentMesh.geometry, lastFaceList, viewerState);
        }
        rebuildComponentOutlines(viewerState);
    }

    if (partial.componentColors !== undefined) {
        disposeOverlay(viewerState);
        if (currentMesh?.geometry && viewSettings.componentColors && !viewSettings.componentMode) {
            rebuildComponentOverlay(currentMesh.geometry, lastFaceList, viewerState);
        }
        refreshSelectedComponentColor(viewerState);
        // Rebuild selection outline to apply/remove component colors
        if (viewerState.selectedMesh && lastFaceList) {
            rebuildSelectionOutlineForSettings(lastFaceList, viewerState);
        }
    }

    if (partial.wireframe !== undefined) {
        disposeOverlay(viewerState);
        if (currentMesh?.geometry && viewSettings.componentColors && !viewSettings.componentMode && !viewSettings.wireframe) {
            rebuildComponentOverlay(currentMesh.geometry, lastFaceList, viewerState);
        }
        // Rebuild selection outline when entering/exiting wireframe mode
        if (viewerState.selectedMesh && lastFaceList) {
            rebuildSelectionOutlineForSettings(lastFaceList, viewerState);
        }
    }

    applyMaterialSettings(viewerState);
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
        componentMode: false,
        componentColors: false,
    }, viewerState);
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
    applyMaterialSettings(viewerState);

    // Update mappings
    viewerState.faceIndexMap = faceListSafe && faceListSafe.length ? faceMap : null;
    viewerState.vertexIndexMap = faceListSafe && faceListSafe.length ? vMap : null;
}

// Import functions that will be defined in other files
import { clearHighlights } from "./viewer-highlight.js";
import { buildGeometryFromFaceList } from "./viewer-geometry.js";
import { rebuildSelectionOutline } from "./viewer-components.js";
