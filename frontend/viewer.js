import * as THREE from "three";

import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";

import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { SAOPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/SAOPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
import { createFrameTarget } from "./camera/frame.js";

import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js";
import { getComponentColor } from "./components/colors.js";

// Construct a Three.js viewer with highlighting utilities and view controls.
export function createViewer(container, initialViewSettings = {}) {
    let currentMesh = null;
    let currentEdges = null;
    let edgeLineMaterial = null;
    let highlightMesh = null;
    let highlightEdges = null;
    let highlightLineMaterial = null;
    let highlightOpacity = 0;
    let highlightOpacityTarget = 0;
    let pendingHighlightClear = false;
    let lastFrameTime = performance.now();
    const highlightFaceOpacity = 0.85;
    const highlightLineOpacity = 0.9;
    const highlightFadeSeconds = 0.12;
    let sceneScale = 1;
    let desiredTarget = new THREE.Vector3(0, 0, 0);
    let desiredCameraPos = new THREE.Vector3(0, 0, 3);
    let animatingFocus = false;
    let basePositions = null; // Float32Array
    let baseIndices = null;   // Uint32Array
    let baseFaceCount = 0;
    let faceIndexMap = null;   // Map original face index -> current face index (or null for identity)
    let vertexIndexMap = null; // Map original vertex index -> current vertex index (or null for identity)
    let lastFaceList = null; // remember last applied component for settings refresh
    let sourceGeometry = null; // stable indexed geometry for highlighting/mapping
    let componentOverlays = [];
    let overlayMesh = null;
    let ghostMesh = null;
    let selectedMesh = null;
    let selectionOutline = null;
    let selectionOutlineMaterial = null;
    let componentOutline = null;
    let componentOutlineMaterial = null;
    let globalOutline = null;
    let globalOutlineMaterial = null;
    const drawBufferSize = new THREE.Vector2();
    const tempBox = new THREE.Box3();
    const tempSphere = new THREE.Sphere();
    const tempVec = new THREE.Vector3();
    const baseMeshColor = new THREE.Color(0xf2f4f7);
    const viewSettings = {
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
    };

    Object.assign(viewSettings, initialViewSettings);

    const scene = new THREE.Scene();
    // Keep light neutral background for clarity
    scene.background = new THREE.Color(0xf2f2f2);
    const pivot = new THREE.Group();
    scene.add(pivot);

    // Helpers
    const axesHelper = new THREE.AxesHelper(1); // size will be updated after mesh loads
    scene.add(axesHelper);

    let gridHelper = new THREE.GridHelper(10, 20); // size will be updated after mesh loads
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    const groundGeom = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.25,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2; // make it horizontal (XZ plane)
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.01,
        1000
    );
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = viewSettings.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const saoPass = new SAOPass(scene, camera, false, true);
    saoPass.params.output = 0;
    saoPass.params.saoIntensity = 0.05;
    saoPass.params.saoBias = 0.0;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 8;
    saoPass.params.saoBlurStdDev = 4;
    saoPass.params.saoBlurDepthCutoff = 0.01;
    saoPass.enabled = !!viewSettings.ssao;
    composer.addPass(saoPass);
    const fxaaPass = new ShaderPass(FXAAShader);
    composer.addPass(fxaaPass);

    // CAD-style lighting rig
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2f3540, 1.15);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(-4, 3, -2);
    scene.add(rimLight);

    const headLight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(headLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.6;

    controls.screenSpacePanning = true;
    desiredTarget.copy(controls.target);
    desiredCameraPos.copy(camera.position);
    const frameTarget = createFrameTarget(camera, controls, {
        fallbackRadius: () => getSafeScale() * 0.5,
    });
    // Optional: constrain zoom distances once mesh is loaded
    // we’ll set min/max in setMeshFromApi after we know the bounding sphere

    // Clear face/vertex remap tables when using full geometry.
    function setIdentityMaps() {
        faceIndexMap = null;
        vertexIndexMap = null;
    }

    // Build a compact geometry from a subset of faces; keeps maps for remapping.
    function buildGeometryFromFaceList(faceList) {
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

        // vertexMap should map original vertex indices -> sourceGeom vertex indices
        // (these are the indices used by issue.edges)
        return { sourceGeom, displayGeom, faceMap: fMap, vertexMap: vMap };
    }

    // Safe guard for sceneScale to avoid NaNs.
    function getSafeScale() {
        return Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
    }

    // Get current mesh offset used when framing bounds.
    function getMeshOffset() {
        return currentMesh ? currentMesh.position.clone() : new THREE.Vector3();
    }

    // Compute world-space bounds for a geometry, respecting mesh offset.
    function getWorldBounds(geometry = currentMesh?.geometry) {
        if (!geometry) return null;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        const box = geometry.boundingBox ? geometry.boundingBox.clone() : null;
        const sphere = geometry.boundingSphere ? geometry.boundingSphere.clone() : null;
        if (currentMesh && currentMesh.position) {
            if (box) box.translate(currentMesh.position);
            if (sphere) sphere.center.add(currentMesh.position);
        }
        return { box, sphere };
    }

    // Build bounds for a set of face indices from the base geometry.
    function getFaceBounds(faceIndices) {
        if (!currentMesh || !Array.isArray(faceIndices) || !faceIndices.length) return null;
        if (!basePositions || !baseIndices) return null;

        const box = new THREE.Box3();
        box.makeEmpty();

        for (const faceIndex of faceIndices) {
            if (faceIndex < 0 || faceIndex >= baseFaceCount) continue;
            const i0 = baseIndices[faceIndex * 3 + 0];
            const i1 = baseIndices[faceIndex * 3 + 1];
            const i2 = baseIndices[faceIndex * 3 + 2];
            const verts = [i0, i1, i2];
            for (const v of verts) {
                tempVec.set(
                    basePositions[v * 3 + 0],
                    basePositions[v * 3 + 1],
                    basePositions[v * 3 + 2]
                );
                box.expandByPoint(tempVec);
            }
        }

        if (box.isEmpty()) return null;
        box.translate(currentMesh.position);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        return { box, sphere };
    }

    // Frame the camera/controls to the provided bounds; optional animation.
    function applyFrameToBounds(boundsOrSphere, options = {}) {
        const { animate = false } = options;
        const frame = frameTarget(boundsOrSphere, { apply: false });
        if (!frame) return null;

        const minDistance = Math.max(0.01, frame.minDistance);
        controls.minDistance = minDistance;
        controls.maxDistance = Math.max(minDistance * 2, frame.maxDistance);
        camera.near = frame.near;
        camera.far = frame.far;
        camera.updateProjectionMatrix();

        if (animate) {
            desiredTarget.copy(frame.target);
            desiredCameraPos.copy(frame.position);
            animatingFocus = true;
        } else {
            animatingFocus = false;
            controls.target.copy(frame.target);
            camera.position.copy(frame.position);
            desiredTarget.copy(frame.target);
            desiredCameraPos.copy(frame.position);
            controls.update();
        }
        return frame;
    }

    // Update ambient occlusion kernel size based on scene scale.
    function updateSaoKernelRadius() {
        const kernelRadius = THREE.MathUtils.clamp(getSafeScale() * 0.02, 2, 24);
        saoPass.params.saoKernelRadius = kernelRadius;
    }

    // Convert desired edge width to pixel width that scales with model size.
    function getEdgeLineWidthPx() {
        const width = 1.8 / Math.sqrt(getSafeScale());
        return THREE.MathUtils.clamp(width, 1.2, 2.2);
    }

    // Convert highlight edge width to a scale-aware pixel width.
    function getHighlightLineWidthPx() {
        const width = 8 / Math.sqrt(getSafeScale());
        return THREE.MathUtils.clamp(width, 6, 10);
    }

    // Radius helper for camera constraints; defaults to 1 if missing.
    function getMeshRadius() {
        if (!currentMesh || !currentMesh.geometry || !currentMesh.geometry.boundingSphere) return 1;
        const r = currentMesh.geometry.boundingSphere.radius;
        return Number.isFinite(r) && r > 0 ? r : 1;
    }

    // Track overall scene scale so helpers/shadows scale correctly.
    function updateSceneScale(geometry) {
        if (!geometry) {
            sceneScale = 1;
            updateSaoKernelRadius();
            return;
        }
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        const box = geometry.boundingBox;
        if (!box) {
            sceneScale = 1;
            updateSaoKernelRadius();
            return;
        }
        const size = new THREE.Vector3();
        box.getSize(size);
        const diag = size.length();
        sceneScale = diag > 0 ? diag : 1;
        updateSaoKernelRadius();
    }

    // Shadows
    // Resize shadow camera bounds based on model scale to avoid clipping.
    function updateShadowCameraBounds() {
        if (!keyLight.shadow || !keyLight.shadow.camera) return;
        const safeScale = getSafeScale();
        const extent = safeScale * 0.6;
        const near = Math.max(0.1, safeScale * 0.01);
        const far = safeScale * 6;
        const cam = keyLight.shadow.camera;
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
        cam.near = near;
        cam.far = far;
        cam.updateProjectionMatrix();
    }

    // Helpers
    // Choose helper radius based on geometry bounds or fallback scale.
    function getHelperRadius(geometry) {
        const fallback = getSafeScale() * 0.5;
        if (!geometry || !geometry.boundingSphere) return fallback;
        const r = geometry.boundingSphere.radius;
        return Number.isFinite(r) && r > 0 ? r : fallback;
    }

    // Rebuild the grid helper to match current scale/visibility.
    function rebuildGridHelper(size, divisions) {
        if (gridHelper) {
            scene.remove(gridHelper);
            gridHelper.geometry.dispose();
            if (Array.isArray(gridHelper.material)) {
                gridHelper.material.forEach((mat) => mat.dispose());
            } else {
                gridHelper.material.dispose();
            }
        }
        gridHelper = new THREE.GridHelper(size, divisions);
        gridHelper.position.y = 0;
        gridHelper.visible = viewSettings.grid;
        scene.add(gridHelper);
    }

    // Resize helpers (axes, grid, ground) after geometry changes; call post-mesh load.
    function updateHelperScales(geometry) {
        const r = getHelperRadius(geometry);
        axesHelper.scale.setScalar(r);
        const gridSize = Math.max(2, r * 4);
        const divisions = Math.round(THREE.MathUtils.clamp(gridSize / (r * 0.1), 20, 100));
        rebuildGridHelper(gridSize, divisions);
        ground.scale.setScalar(gridSize / 10);
        ground.position.y = 0;
    }

    // Remove component overlay mesh safely.
    function disposeOverlay() {
        if (overlayMesh && overlayMesh.parent) {
            overlayMesh.parent.remove(overlayMesh);
        }
        if (overlayMesh) {
            overlayMesh.geometry.dispose();
            overlayMesh.material.dispose();
        }
        overlayMesh = null;
    }

    // Remove ghost mesh that hides non-selected faces.
    function disposeGhostMesh() {
        if (ghostMesh && ghostMesh.parent) {
            ghostMesh.parent.remove(ghostMesh);
        }
        if (ghostMesh) {
            ghostMesh.geometry.dispose();
            ghostMesh.material.dispose();
        }
        ghostMesh = null;
    }

    // Remove isolated selection mesh copy.
    function disposeSelectedMesh() {
        if (selectedMesh && selectedMesh.parent) {
            selectedMesh.parent.remove(selectedMesh);
        }
        if (selectedMesh) {
            selectedMesh.geometry.dispose();
            if (selectedMesh.material) {
                selectedMesh.material.dispose();
            }
        }
        selectedMesh = null;
    }

    // Clear selection outline lines.
    function disposeSelectionOutline() {
        if (selectionOutline && selectionOutline.parent) {
            selectionOutline.parent.remove(selectionOutline);
        }
        if (selectionOutline) {
            selectionOutline.geometry.dispose();
        }
        if (selectionOutlineMaterial) {
            selectionOutlineMaterial.dispose();
        }
        selectionOutline = null;
        selectionOutlineMaterial = null;
    }

    // Clear component boundary outlines.
    function disposeComponentOutlines() {
        if (componentOutline && componentOutline.parent) {
            componentOutline.parent.remove(componentOutline);
        }
        if (componentOutline) {
            componentOutline.geometry.dispose();
        }
        if (componentOutlineMaterial) {
            componentOutlineMaterial.dispose();
        }
        componentOutline = null;
        componentOutlineMaterial = null;
    }

    // Clear global outline around the current mesh anchor.
    function disposeGlobalOutline() {
        if (globalOutline && globalOutline.parent) {
            globalOutline.parent.remove(globalOutline);
        }
        if (globalOutline) {
            globalOutline.geometry.dispose();
        }
        if (globalOutlineMaterial) {
            globalOutlineMaterial.dispose();
        }
        globalOutline = null;
        globalOutlineMaterial = null;
    }

    // Build a translucent overlay per component to visualize grouping.
    function rebuildComponentOverlay(displayGeom, faceList) {
        // Only show overlays when full mesh is displayed (no face subset)
        disposeOverlay();
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

        overlayMesh = new THREE.Mesh(overlayGeom, overlayMat);
        overlayMesh.renderOrder = 5;
        currentMesh.add(overlayMesh);
    }

    // Create a faded ghost mesh for non-selected faces when isolating.
    function rebuildGhostMesh(selectedFaceList) {
        disposeGhostMesh();
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
            color: 0x6b7280,
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

        ghostMesh = new THREE.Mesh(geom, mat);
        ghostMesh.position.copy(currentMesh.position);
        ghostMesh.renderOrder = 3;
        pivot.add(ghostMesh);
    }

    // Build thick outline lines around the currently selected faces.
    function rebuildSelectionOutline(selectedFaceList, displayGeom, targetMesh = currentMesh) {
        disposeSelectionOutline();
        if (!targetMesh || !selectedFaceList || !selectedFaceList.length) return;
        if (!displayGeom) return;

        const edgesGeom = new THREE.EdgesGeometry(displayGeom, 0.1);
        const lineGeom = new LineSegmentsGeometry();
        lineGeom.setPositions(edgesGeom.getAttribute("position").array);
        edgesGeom.dispose();

        selectionOutlineMaterial = new LineMaterial({
            color: 0x111111,
            linewidth: Math.max(2, getEdgeLineWidthPx() * 1.6),
            transparent: true,
            opacity: 0.85,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        });
        renderer.getDrawingBufferSize(drawBufferSize);
        selectionOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

        selectionOutline = new LineSegments2(lineGeom, selectionOutlineMaterial);
        selectionOutline.renderOrder = 12;
        targetMesh.add(selectionOutline);
    }

    // Recompute per-component outlines for componentMode highlighting.
    function rebuildComponentOutlines() {
        disposeComponentOutlines();
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

            const [aStr, bStr] = key.split("_");
            const a = Number(aStr);
            const b = Number(bStr);
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;

            const compColor = new THREE.Color(getComponentColor(compA));

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

        componentOutlineMaterial = new LineMaterial({
            vertexColors: true,
            linewidth: Math.max(1.8, getEdgeLineWidthPx() * 1.2),
            transparent: true,
            opacity: 0.9,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });
        renderer.getDrawingBufferSize(drawBufferSize);
        componentOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

        componentOutline = new LineSegments2(lineGeom, componentOutlineMaterial);
        componentOutline.renderOrder = 11;
        componentOutline.visible = viewSettings.componentMode;
        currentMesh.add(componentOutline);
    }

    // Decide which mesh the global outline should follow.
    function outlineAnchor() {
        return selectedMesh || currentMesh;
    }

    // Keep global outline aligned with its anchor mesh.
    function syncGlobalOutlineTransform() {
        if (!globalOutline) return;
        const anchor = outlineAnchor();
        if (!anchor) return;
        globalOutline.position.copy(anchor.position);
        globalOutline.rotation.copy(anchor.rotation);
        globalOutline.scale.copy(anchor.scale);
    }

    // Toggle global outline visibility based on settings and anchor visibility.
    function updateGlobalOutlineVisibility() {
        if (!globalOutline) return;
        const anchor = outlineAnchor();
        const anchorVisible = !!anchor && anchor.visible !== false;
        globalOutline.visible = !!viewSettings.outlineEnabled && anchorVisible;
    }

    // Build the outer outline mesh that sits around the active mesh.
    function rebuildGlobalOutline() {
        disposeGlobalOutline();
        if (!viewSettings.outlineEnabled) return;
        const anchor = outlineAnchor();
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

        globalOutlineMaterial = new LineMaterial({
            color: 0x111111,
            linewidth: Math.max(1.5, getEdgeLineWidthPx()),
            transparent: true,
            opacity: 0.9,
            depthTest: true,
        });
        renderer.getDrawingBufferSize(drawBufferSize);
        globalOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

        globalOutline = new LineSegments2(lineGeom, globalOutlineMaterial);
        globalOutline.renderOrder = 9;
        pivot.add(globalOutline);
        syncGlobalOutlineTransform();
        updateGlobalOutlineVisibility();
    }

    // Hide base mesh/edges when showing component-only isolation.
    function hideBaseMeshesAndLines() {
        if (currentMesh) currentMesh.visible = false;
        if (currentEdges) currentEdges.visible = false;
        if (componentOutline) componentOutline.visible = false;
        updateGlobalOutlineVisibility();
        disposeOverlay();
    }

    // Show base mesh/edges after hiding them for isolation.
    function showBaseMeshesAndLines() {
        if (currentMesh) currentMesh.visible = true;
        if (currentEdges) currentEdges.visible = !viewSettings.componentMode && viewSettings.edgeMode !== "off";
        if (componentOutline) componentOutline.visible = viewSettings.componentMode;
        updateGlobalOutlineVisibility();
        if (currentMesh?.geometry && !viewSettings.componentMode) {
            rebuildComponentOverlay(currentMesh.geometry, lastFaceList);
        }
    }

    // Resize helpers and reframe camera to fit given geometry.
    function fitHelpersAndCamera(geometry) {
        updateHelperScales(geometry);
        const bounds = getWorldBounds(geometry);
        if (!bounds) return;
        applyFrameToBounds(bounds.sphere || bounds.box, { animate: false });
    }

    // Build edge lines for the current mesh according to edge mode.
    function rebuildEdges() {
        if (!currentMesh) return;
        if (currentEdges) {
            currentMesh.remove(currentEdges);
            currentEdges.geometry.dispose();
            currentEdges.material.dispose();
            currentEdges = null;
            edgeLineMaterial = null;
        }

        if (viewSettings.edgeMode === "off") return;

        let threshold = viewSettings.edgeThreshold;
        if (viewSettings.edgeMode === "all") threshold = 0.1;

        const edgesGeom = new THREE.EdgesGeometry(currentMesh.geometry, threshold);
        const positions = edgesGeom.getAttribute("position").array;
        const lineGeom = new LineSegmentsGeometry();
        lineGeom.setPositions(positions);
        edgesGeom.dispose();

        edgeLineMaterial = new LineMaterial({
            color: 0x111827,
            linewidth: getEdgeLineWidthPx(),
            transparent: true,
            opacity: 0.95,
            depthTest: true,
        });
        renderer.getDrawingBufferSize(drawBufferSize);
        edgeLineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

        currentEdges = new LineSegments2(lineGeom, edgeLineMaterial);
        currentEdges.renderOrder = 10;
        currentMesh.add(currentEdges);
    }

    // Apply a face subset (or full mesh) to the viewer and optionally refit camera.
    function applyGeometry(faceList, refitCamera = true) {
        if (!basePositions || !baseIndices) return;
        discardHighlights();
        lastFaceList = faceList && faceList.length ? faceList.slice() : null;
        const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceList);

        // Replace sourceGeometry (stable) used for highlight mapping
        if (sourceGeometry) {
            sourceGeometry.dispose();
            sourceGeometry = null;
        }
        sourceGeometry = sourceGeom;

        const box = displayGeom.boundingBox;
        const center = new THREE.Vector3();
        box.getCenter(center);
        const minY = box.min.y;

        if (!currentMesh) {
            const material = new THREE.MeshStandardMaterial({
                metalness: 0.0,
                roughness: 0.8,
                color: baseMeshColor,
            });
            currentMesh = new THREE.Mesh(displayGeom, material);
            currentMesh.castShadow = true;
            currentMesh.receiveShadow = true;
            pivot.add(currentMesh);
        } else {
            discardHighlights();
            currentMesh.geometry.dispose();
            currentMesh.geometry = displayGeom;
            currentMesh.material.color.copy(baseMeshColor);
            currentMesh.castShadow = true;
            currentMesh.receiveShadow = true;
        }

        currentMesh.position.set(-center.x, -minY, -center.z);
        const floorY = currentMesh.position.y;
        gridHelper.position.y = floorY;
        ground.position.y = floorY;
        rebuildEdges();
        rebuildGlobalOutline();
        applyMaterialSettings();
        updateSceneScale(displayGeom);
        updateShadowCameraBounds();
        rebuildComponentOverlay(displayGeom, faceList);
        rebuildComponentOutlines();

        faceIndexMap = faceList && faceList.length ? faceMap : null;
        vertexIndexMap = faceList && faceList.length ? vMap : null;

        if (refitCamera) {
            fitHelpersAndCamera(displayGeom);
        } else {
            // keep helpers roughly scaled to new geometry without moving camera/target
            updateHelperScales(displayGeom);
        }
    }

    // Rebuild display geometry using the last face list without moving camera.
    function refreshDisplayGeometry(faceList = lastFaceList) {
        if (!basePositions || !baseIndices || !currentMesh) return;
        const faceListSafe = faceList && faceList.length ? faceList.slice() : null;
        const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceListSafe);

        if (sourceGeometry) {
            sourceGeometry.dispose();
            sourceGeometry = null;
        }
        sourceGeometry = sourceGeom;

        const prevPosition = currentMesh.position.clone();
        const prevRotation = currentMesh.rotation.clone();
        const prevScale = currentMesh.scale.clone();

        currentMesh.geometry.dispose();
        currentMesh.geometry = displayGeom;
        currentMesh.position.copy(prevPosition);
        currentMesh.rotation.copy(prevRotation);
        currentMesh.scale.copy(prevScale);

        rebuildEdges();
        rebuildGlobalOutline();
        applyMaterialSettings();
        updateSceneScale(displayGeom);
        updateShadowCameraBounds();
        rebuildComponentOverlay(displayGeom, faceListSafe);
        rebuildComponentOutlines();

        faceIndexMap = faceListSafe && faceListSafe.length ? faceMap : null;
        vertexIndexMap = faceListSafe && faceListSafe.length ? vMap : null;
    }

    // Apply render toggles (wireframe, xray, helpers) to current mesh.
    function applyMaterialSettings() {
        if (!currentMesh) return;
        currentMesh.material.wireframe = viewSettings.wireframe;
        currentMesh.material.transparent = viewSettings.xray;
        currentMesh.material.opacity = viewSettings.xray ? 0.4 : 1.0;
        currentMesh.material.needsUpdate = true;

        gridHelper.visible = viewSettings.grid;
        axesHelper.visible = viewSettings.axes;
        ground.visible = viewSettings.grid;
    }

    // Load mesh data from API response and build base geometry arrays.
    function setMeshFromApi(meshData) {
        const { vertices, faces } = meshData;
        disposeOverlay();
        componentOverlays = [];
        disposeGhostMesh();
        disposeSelectedMesh();
        disposeSelectionOutline();
        disposeComponentOutlines();
        disposeGlobalOutline();

        // positions: flat float array length = vertices.length * 3
        basePositions = new Float32Array(vertices.length * 3);
        for (let i = 0; i < vertices.length; i++) {
            basePositions[i * 3 + 0] = vertices[i][0];
            basePositions[i * 3 + 1] = vertices[i][1];
            basePositions[i * 3 + 2] = vertices[i][2];
        }

        // indices: faces are triples of vertex indices
        baseIndices = new Uint32Array(faces.length * 3);
        for (let i = 0; i < faces.length; i++) {
            baseIndices[i * 3 + 0] = faces[i][0];
            baseIndices[i * 3 + 1] = faces[i][1];
            baseIndices[i * 3 + 2] = faces[i][2];
        }
        baseFaceCount = faces.length;
        applyGeometry(null, true);
        setIdentityMaps();
    }

    // Store component overlay data and rebuild overlay visuals.
    function setComponentOverlays(list) {
        componentOverlays = Array.isArray(list) ? list : [];
        if (currentMesh && currentMesh.geometry) {
            rebuildComponentOverlay(currentMesh.geometry, lastFaceList);
        }
        rebuildComponentOutlines();
    }

    // Isolate a set of faces as a temporary selected mesh with ghosted remainder.
    function focusComponentFaces(faceIndices) {
        if (!basePositions || !baseIndices) return;
        if (!faceIndices || !faceIndices.length) return;

        hideBaseMeshesAndLines();
        disposeGhostMesh();
        disposeSelectedMesh();
        disposeSelectionOutline();
        disposeOverlay();

        rebuildGhostMesh(faceIndices);
        const { sourceGeom, displayGeom } = buildGeometryFromFaceList(faceIndices);
        const material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.8,
            color: baseMeshColor,
        });
        selectedMesh = new THREE.Mesh(displayGeom, material);
        selectedMesh.castShadow = true;
        selectedMesh.receiveShadow = true;
        if (currentMesh) {
            selectedMesh.position.copy(currentMesh.position);
            selectedMesh.rotation.copy(currentMesh.rotation);
            selectedMesh.scale.copy(currentMesh.scale);
        }
        pivot.add(selectedMesh);
        syncGlobalOutlineTransform();
        updateGlobalOutlineVisibility();

        rebuildSelectionOutline(faceIndices, displayGeom, selectedMesh);
        sourceGeom.dispose();
    }

    // Clear component isolation, showing the full mesh again.
    function clearComponentFocus() {
        disposeGhostMesh();
        disposeSelectionOutline();
        disposeSelectedMesh();
        showBaseMeshesAndLines();
        rebuildComponentOutlines();
        rebuildGlobalOutline();
        rebuildEdges();
    }

    // Show a specific component (by faces) and optionally frame camera on it.
    function showComponent(faceIndices, options = {}) {
        const { refitCamera = true } = options;
        if (!basePositions || !baseIndices) return;
        if (faceIndices && faceIndices.length) {
            focusComponentFaces(faceIndices);
            const bounds = getFaceBounds(faceIndices);
            if (refitCamera && bounds && (bounds.box || bounds.sphere)) {
                applyFrameToBounds(bounds.sphere || bounds.box, { animate: true });
            }
        } else {
            clearComponentFocus();
        }
    }

    // Reset to showing all components; refit camera when requested.
    function showAllComponents(options = {}) {
        const { refitCamera = true } = options;
        clearComponentFocus();
        if (refitCamera && currentMesh?.geometry) {
            const bounds = getWorldBounds(currentMesh.geometry);
            if (bounds) {
                applyFrameToBounds(bounds.sphere || bounds.box, { animate: true });
            }
        }
        rebuildComponentOutlines();
        rebuildGlobalOutline();
        rebuildEdges();
    }

    // Handle viewport resize to keep renderer and outlines sharp.
    function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        composer.setSize(w, h);
        const ratio = renderer.getPixelRatio();
        fxaaPass.material.uniforms["resolution"].value.set(1 / (w * ratio), 1 / (h * ratio));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.getDrawingBufferSize(drawBufferSize);
        if (highlightLineMaterial) {
            highlightLineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);
        }
        if (edgeLineMaterial) {
            edgeLineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);
        }
        if (selectionOutlineMaterial) {
            selectionOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);
        }
        if (componentOutlineMaterial) {
            componentOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);
        }
        if (globalOutlineMaterial) {
            globalOutlineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);
        }
    }
    window.addEventListener("resize", onResize);
    onResize();

    // Stop smooth focus animation when user interacts.
    function stopFocusAnimation() {
        animatingFocus = false;
        desiredTarget.copy(controls.target);
        desiredCameraPos.copy(camera.position);
    }

    // Cancel focus animation on mouse, scroll, or keyboard input.
    function attachInputInterrupts() {
        const stop = () => stopFocusAnimation();
        renderer.domElement.addEventListener("pointerdown", stop);
        renderer.domElement.addEventListener("wheel", stop, { passive: true });
        window.addEventListener("keydown", stop);
    }
    attachInputInterrupts();

    // Main render loop: updates lighting, animations, and composer rendering.
    function animate(now) {
        requestAnimationFrame(animate);
        const frameTime = now ?? performance.now();
        const dt = Math.min(0.05, Math.max(0, (frameTime - lastFrameTime) / 1000));
        lastFrameTime = frameTime;
        renderer.toneMappingExposure = Math.max(0.2, viewSettings.exposure);
        headLight.position.copy(camera.position);
        headLight.target.position.copy(controls.target);
        headLight.target.updateMatrixWorld();
        // Subtle light steering: key and rim gently follow camera yaw/pitch
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const right = new THREE.Vector3().crossVectors(camDir, camera.up).normalize();
        const up = camera.up.clone().normalize();
        keyLight.position.copy(controls.target)
            .addScaledVector(camDir, 6)
            .addScaledVector(up, 4)
            .addScaledVector(right, 2);
        keyLight.target.position.copy(controls.target);
        keyLight.target.updateMatrixWorld();

        rimLight.position.copy(controls.target)
            .addScaledVector(camDir.clone().negate(), 5)
            .addScaledVector(up, 3)
            .addScaledVector(right.clone().negate(), 1.5);
        rimLight.target.position.copy(controls.target);
        rimLight.target.updateMatrixWorld();
        if (currentEdges) {
            const r = getMeshRadius();
            const distance = camera.position.distanceTo(controls.target);
            const ratio = r / Math.max(distance, 1e-3);
            currentEdges.material.opacity = THREE.MathUtils.clamp(ratio * 0.9, 0.35, 0.95);
        }
        if (animatingFocus) {
            camera.position.lerp(desiredCameraPos, 0.15);
            controls.target.lerp(desiredTarget, 0.18);

            const camDone = camera.position.distanceTo(desiredCameraPos) < 1e-3;
            const tgtDone = controls.target.distanceTo(desiredTarget) < 1e-3;
            if (camDone && tgtDone) {
                camera.position.copy(desiredCameraPos);
                controls.target.copy(desiredTarget);
                animatingFocus = false;
            }
        }
        if (highlightMesh || highlightEdges || pendingHighlightClear) {
            const t = dt > 0 ? (1 - Math.exp(-dt / highlightFadeSeconds)) : 1;
            highlightOpacity += (highlightOpacityTarget - highlightOpacity) * t;
            if (highlightMesh && highlightMesh.material) {
                highlightMesh.material.opacity = highlightOpacity * highlightFaceOpacity;
                highlightMesh.visible = highlightOpacity > 0.01;
            }
            if (highlightLineMaterial) {
                highlightLineMaterial.opacity = highlightOpacity * highlightLineOpacity;
            }
            if (highlightEdges) {
                highlightEdges.visible = highlightOpacity > 0.01;
            }
            if (pendingHighlightClear && highlightOpacity <= 0.02 && highlightOpacityTarget === 0) {
                discardHighlights();
            }
        }
        controls.update();
        composer.render();
    }
    animate();

    // Highlighting
    // Remove highlight meshes/lines immediately.
    function discardHighlights() {
        if (highlightMesh) {
            if (highlightMesh.parent) {
                highlightMesh.parent.remove(highlightMesh);
            }
            highlightMesh.geometry.dispose();
            highlightMesh.material.dispose();
            highlightMesh = null;
        }
        if (highlightEdges) {
            if (highlightEdges.parent) {
                highlightEdges.parent.remove(highlightEdges);
            }
            highlightEdges.geometry.dispose();
            if (highlightLineMaterial) {
                highlightLineMaterial.dispose();
            }
            highlightEdges = null;
            highlightLineMaterial = null;
        }
        highlightOpacity = 0;
        highlightOpacityTarget = 0;
        pendingHighlightClear = false;
    }

    // Fade out highlights; safe to call when nothing is highlighted.
    function clearHighlights() {
        if (!highlightMesh && !highlightEdges) return;
        highlightOpacityTarget = 0;
        pendingHighlightClear = true;
    }

    // Reset highlight state before drawing new highlights.
    function beginHighlighting() {
        discardHighlights();
        highlightOpacity = 0;
        highlightOpacityTarget = 0;
        pendingHighlightClear = false;
    }

    // Remap face indices if a subset geometry is active.
    function mapFaceList(faceIndices) {
        if (!faceIndices || !faceIndices.length) return [];
        if (!faceIndexMap) return faceIndices.slice();
        const out = [];
        for (const f of faceIndices) {
            const mapped = faceIndexMap.get(f);
            if (mapped !== undefined && mapped !== null && mapped >= 0) {
                out.push(mapped);
            }
        }
        return out;
    }

    // Remap edge vertex pairs to current geometry mapping.
    function mapEdgePairs(edgePairs) {
        if (!edgePairs || !edgePairs.length) return [];
        if (!vertexIndexMap) return edgePairs.map((e) => [...e]);
        const out = [];
        for (const [a, b] of edgePairs) {
            const ma = vertexIndexMap.get(a);
            const mb = vertexIndexMap.get(b);
            if (ma !== undefined && mb !== undefined && ma >= 0 && mb >= 0) {
                out.push([ma, mb]);
            }
        }
        return out;
    }

    // Draw translucent faces for provided indices.
    function highlightFaces(faceIndices) {
        if (!currentMesh) return;
        if (!sourceGeometry) return;
        const mappedFaces = mapFaceList(faceIndices);
        if (!mappedFaces.length) return;

        const baseGeom = sourceGeometry;
        const posAttr = baseGeom.getAttribute("position");
        const indexAttr = baseGeom.getIndex();

        // Build a NEW geometry containing ONLY the highlighted triangles
        const highlightGeometry = new THREE.BufferGeometry();

        // We'll create non-indexed triangles for simplicity:
        // each face contributes 3 vertices = 9 floats
        const outPositions = new Float32Array(mappedFaces.length * 9);

        for (let i = 0; i < mappedFaces.length; i++) {
            const faceIndex = mappedFaces[i];

            const i0 = indexAttr.getX(faceIndex * 3 + 0);
            const i1 = indexAttr.getX(faceIndex * 3 + 1);
            const i2 = indexAttr.getX(faceIndex * 3 + 2);

            const v0x = posAttr.getX(i0), v0y = posAttr.getY(i0), v0z = posAttr.getZ(i0);
            const v1x = posAttr.getX(i1), v1y = posAttr.getY(i1), v1z = posAttr.getZ(i1);
            const v2x = posAttr.getX(i2), v2y = posAttr.getY(i2), v2z = posAttr.getZ(i2);

            const o = i * 9;
            outPositions[o + 0] = v0x; outPositions[o + 1] = v0y; outPositions[o + 2] = v0z;
            outPositions[o + 3] = v1x; outPositions[o + 4] = v1y; outPositions[o + 5] = v1z;
            outPositions[o + 6] = v2x; outPositions[o + 7] = v2y; outPositions[o + 8] = v2z;
        }

        highlightGeometry.setAttribute("position", new THREE.BufferAttribute(outPositions, 3));
        highlightGeometry.computeVertexNormals();

        const highlightMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0,
            depthTest: false,      // draw on top
            side: THREE.DoubleSide // show even if normals are flipped
        });

        highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        highlightMesh.renderOrder = 999; // draw after the base mesh
        currentMesh.add(highlightMesh);
        highlightOpacityTarget = 1;
        pendingHighlightClear = false;
    }

    // Draw overlay line segments for provided edge pairs.
    function highlightEdgePairs(edgePairs) {
        if (!currentMesh) return;
        if (!sourceGeometry) return;
        const mappedEdges = mapEdgePairs(edgePairs);
        if (!mappedEdges.length) return;

        const baseGeom = sourceGeometry;
        const posAttr = baseGeom.getAttribute("position");

        // Flatten into [x1,y1,z1, x2,y2,z2, ...]
        const positions = new Float32Array(mappedEdges.length * 6);

        for (let i = 0; i < mappedEdges.length; i++) {
            const [a, b] = mappedEdges[i];

            const o = i * 6;
            positions[o + 0] = posAttr.getX(a);
            positions[o + 1] = posAttr.getY(a);
            positions[o + 2] = posAttr.getZ(a);

            positions[o + 3] = posAttr.getX(b);
            positions[o + 4] = posAttr.getY(b);
            positions[o + 5] = posAttr.getZ(b);
        }

        const geom = new LineGeometry();
        geom.setPositions(positions);

        highlightLineMaterial = new LineMaterial({
            color: 0xff0000,
            linewidth: getHighlightLineWidthPx(),        // pixels (this is what we want)
            transparent: true,
            opacity: 0,
            depthTest: false      // draw on top
        });

        // IMPORTANT: LineMaterial needs renderer resolution
        renderer.getDrawingBufferSize(drawBufferSize);
        highlightLineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

        highlightEdges = new Line2(geom, highlightLineMaterial);
        highlightEdges.computeLineDistances();
        highlightEdges.renderOrder = 1000;

        currentMesh.add(highlightEdges);
        highlightOpacityTarget = 1;
        pendingHighlightClear = false;
    }

    // Compute world-space centroid for a face index.
    function faceCentroid(faceIndex) {
        const baseGeom = sourceGeometry || currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");
        const indexAttr = baseGeom.getIndex();

        const i0 = indexAttr.getX(faceIndex * 3 + 0);
        const i1 = indexAttr.getX(faceIndex * 3 + 1);
        const i2 = indexAttr.getX(faceIndex * 3 + 2);

        const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
        const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
        const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

        // Centroid = average of the 3 vertices
        const centroid = new THREE.Vector3();
        centroid.add(v0).add(v1).add(v2).multiplyScalar(1 / 3);

        return currentMesh.localToWorld(centroid);
    }

    // Compute world-space midpoint for an edge pair.
    function edgeMidpoint(edgePair) {
        const baseGeom = sourceGeometry || currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");
        const [a, b] = edgePair;

        const va = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
        const vb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));

        // Midpoint of the two vertices
        const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
        return currentMesh.localToWorld(mid);
    }

    // Animate camera toward a point while keeping relative offset reasonable.
    function moveCameraToPoint(point, preferredRadius) {
        if (!currentMesh) return;
        // Preserve current camera offset; only shorten for tighter framing, never lengthen.
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        const hasOffset = offset.lengthSq() >= 1e-6;
        const r = preferredRadius || getMeshRadius();
        const desiredDistance = r * 1.1; // tighter framing

        if (!hasOffset) {
            offset.set(0, r * 0.3, desiredDistance);
        } else if (preferredRadius) {
            const currentDist = offset.length();
            // Only tighten if current distance is larger; never zoom out
            const targetDist = Math.min(currentDist, desiredDistance);
            offset.setLength(targetDist);
        }
        const minDist = Number.isFinite(controls.minDistance) ? controls.minDistance : 0;
        const maxDist = Number.isFinite(controls.maxDistance) ? controls.maxDistance : Infinity;
        const clampedDist = THREE.MathUtils.clamp(offset.length(), minDist, maxDist);
        offset.setLength(clampedDist);
        desiredTarget.copy(point);
        desiredCameraPos.copy(point).add(offset);
        animatingFocus = true;
    }

    // Recenter mesh on grid and refit camera.
    function centerView() {
        if (!currentMesh) return;
        if (!currentMesh.geometry.boundingBox) currentMesh.geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        currentMesh.geometry.boundingBox.getCenter(center);
        const minY = currentMesh.geometry.boundingBox.min.y;

        // Place mesh center at origin in X/Z and rest it on the grid in Y (no cumulative drift)
        currentMesh.position.set(-center.x, -minY, -center.z);
        const floorY = currentMesh.position.y;
        gridHelper.position.y = floorY;
        ground.position.y = floorY;
        syncGlobalOutlineTransform();
        updateGlobalOutlineVisibility();

        fitHelpersAndCamera(currentMesh.geometry);
    }

    // Frame entire mesh with an animated camera move.
    function frameView() {
        if (!currentMesh) return;
        const bounds = getWorldBounds(currentMesh.geometry);
        if (!bounds) return;
        applyFrameToBounds(bounds.sphere || bounds.box, { animate: true });
    }

    // Frame arbitrary bounds or sphere; pass animate flag via options.
    function frameBounds(boundsOrSphere, options = {}) {
        return applyFrameToBounds(boundsOrSphere, options);
    }

    // Return current mesh bounds for external consumers.
    function getCurrentBounds() {
        return getWorldBounds(currentMesh?.geometry);
    }

    // Highlight and focus a single face by index.
    function focusFace(faceIndex) {
        if (!currentMesh || faceIndex == null) return;
        beginHighlighting();
        highlightFaces([faceIndex]);
        const mapped = mapFaceList([faceIndex]);
        if (!mapped.length) return;
        const centroid = faceCentroid(mapped[0]);
        const r = getMeshRadius();
        moveCameraToPoint(centroid, r * 0.6);
        controls.update();
    }

    // Highlight and focus a single edge pair.
    function focusEdge(edgePair) {
        if (!currentMesh || !edgePair) return;
        beginHighlighting();
        highlightEdgePairs([edgePair]);
        const mapped = mapEdgePairs([edgePair]);
        if (!mapped.length) return;
        const mid = edgeMidpoint(mapped[0]);
        const r = getMeshRadius();
        moveCameraToPoint(mid, r * 0.6);
        controls.update();
    }

    // Highlight all faces/edges for an issue without stepping.
    function showIssueAll(issue) {
        beginHighlighting();
        if (!issue) return;

        if (issue.faces && issue.faces.length) {
            highlightFaces(issue.faces);
        }

        if (issue.edges && issue.edges.length) {
            highlightEdgePairs(issue.edges);
        }
    }

    // Highlight a specific item of an issue; falls back to show all.
    function showIssueItem(issue, index) {
        if (!issue) {
            clearHighlights();
            return;
        }
        const faces = Array.isArray(issue.faces) ? issue.faces : [];
        const edges = Array.isArray(issue.edges) ? issue.edges : [];

        if (faces.length) {
            const safe = ((index % faces.length) + faces.length) % faces.length;
            focusFace(faces[safe]);
        } else if (edges.length) {
            const safe = ((index % edges.length) + edges.length) % edges.length;
            focusEdge(edges[safe]);
        } else {
            showIssueAll(issue);
        }
    }

    // keep backward compatibility
    // Deprecated alias for showIssueAll.
    function showIssue(issue) {
        showIssueAll(issue);
    }

    // Apply view settings updates and rebuild dependent visuals.
    function setViewSettings(partial) {
        clearHighlights();
        Object.assign(viewSettings, partial);
        renderer.toneMappingExposure = Math.max(0.2, viewSettings.exposure);

        if (partial.ssao !== undefined) {
            saoPass.enabled = !!viewSettings.ssao;
        }

        if (partial.cadShading !== undefined) {
            refreshDisplayGeometry(lastFaceList);
        } else {
            rebuildEdges();
            applyMaterialSettings();
            if (partial.edgeThreshold !== undefined) {
                rebuildGlobalOutline();
            }
        }

        if (partial.componentMode !== undefined) {
            disposeOverlay();
            if (currentMesh?.geometry && !viewSettings.componentMode) {
                rebuildComponentOverlay(currentMesh.geometry, lastFaceList);
            }
            rebuildComponentOutlines();
            updateGlobalOutlineVisibility();
        }

        if (partial.outlineEnabled !== undefined) {
            rebuildGlobalOutline();
        } else {
            updateGlobalOutlineVisibility();
        }
    }

    // Return a copy of current view settings.
    function getViewSettings() {
        return { ...viewSettings };
    }

    // Expose current scene scale for UI.
    function getSceneScale() {
        return sceneScale;
    }

    // Restore default view settings and re-render.
    function resetViewSettings() {
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
        });
    }

    return {
        setMeshFromApi,
        showIssue,
        showIssueAll,
        showIssueItem,
        showComponent,
        showAllComponents,
        clearHighlights,
        focusFace,
        focusEdge,
        setViewSettings,
        getViewSettings,
        getSceneScale,
        resetViewSettings,
        centerView,
        frameBounds,
        frameView,
        getCurrentBounds,
        getMeshOffset,
        setComponentOverlays,
        focusComponentFaces,
        clearComponentFocus
    };
}
