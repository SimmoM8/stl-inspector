import * as THREE from "three";
import { initializeViewerScene, handleResize, startRenderLoop } from "./viewer-init.js";
import { setMeshFromApi, applyGeometry, setIdentityMaps } from "./viewer-mesh.js";
import {
    setViewSettings, getViewSettings, resetViewSettings, applyMaterialSettings,
    updateSceneScale, updateShadowCameraBounds, rebuildGridHelper, updateHelperScales,
    rebuildEdges, rebuildGlobalOutline, rebuildComponentOverlay, rebuildComponentOutlines,
    disposeOverlay, disposeComponentOutlines, disposeGlobalOutline, refreshDisplayGeometry
} from "./viewer-view-settings.js";
import {
    getSafeScale, getMeshOffset, getWorldBounds, getFaceBounds, applyFrameToBounds,
    getMeshRadius, fitHelpersAndCamera, moveCameraToPoint, centerView, frameView,
    frameBounds, getCurrentBounds, stopFocusAnimation, attachInputInterrupts,
    updateCameraAnimation
} from "./viewer-camera.js";
import { MATERIALS } from "../constants/constants.js";
import {
    discardHighlights, clearHighlights, beginHighlighting, highlightFaces,
    highlightEdgePairs, faceCentroid, edgeMidpoint, focusFace, focusEdge,
    showIssueAll, showIssueItem, showIssue, updateHighlightAnimation
} from "./viewer-highlight.js";
import {
    disposeGhostMesh, disposeSelectedMesh, disposeSelectionOutline,
    rebuildGhostMesh, rebuildSelectionOutline, focusComponentFaces,
    clearComponentFocus, showComponent, showAllComponents, setComponentOverlays
} from "./viewer-components.js";
import { handleResize as handleUIResize, updateLighting } from "./viewer-ui.js";

// Construct a Three.js viewer with highlighting utilities and view controls.
export function createViewer(container, initialViewSettings = {}) {
    // Initialize viewer state object
    const viewerState = {
        // Core Three.js objects
        scene: null,
        camera: null,
        renderer: null,
        composer: null,
        controls: null,
        frameTarget: null,
        pivot: null,
        axesHelper: null,
        gridHelper: null,
        ground: null,
        saoPass: null,
        fxaaPass: null,
        keyLight: null,
        rimLight: null,
        headLight: null,
        hemi: null,

        // Mesh and geometry state
        currentMesh: null,
        currentEdges: null,
        edgeLineMaterial: null,
        basePositions: null, // Float32Array
        baseIndices: null,   // Uint32Array
        baseFaceCount: 0,
        faceIndexMap: null,   // Map original face index -> current face index (or null for identity)
        vertexIndexMap: null, // Map original vertex index -> current vertex index (or null for identity)
        lastFaceList: null, // remember last applied component for settings refresh
        sourceGeometry: null, // stable indexed geometry for highlighting/mapping

        // Component and overlay state
        componentOverlays: [],
        overlayMesh: null,
        ghostMesh: null,
        selectedMesh: null,
        selectionOutline: null,
        selectionOutlineMaterial: null,
        componentOutline: null,
        componentOutlineMaterial: null,
        globalOutline: null,
        globalOutlineMaterial: null,

        // Highlighting state
        highlightMesh: null,
        highlightEdges: null,
        highlightLineMaterial: null,
        highlightOpacity: 0,
        highlightOpacityTarget: 0,
        pendingHighlightClear: false,
        highlightFaceOpacity: MATERIALS.HIGHLIGHT_OPACITY,
        highlightLineOpacity: MATERIALS.HIGHLIGHT_LINE_OPACITY,
        highlightFadeSeconds: MATERIALS.HIGHLIGHT_FADE_SECONDS,

        // Animation and interaction state
        lastFrameTime: performance.now(),
        sceneScale: 1,
        desiredTarget: new THREE.Vector3(0, 0, 0),
        desiredCameraPos: new THREE.Vector3(0, 0, 3),
        animatingFocus: false,

        // Temporary objects for calculations
        drawBufferSize: new THREE.Vector2(),
        tempBox: new THREE.Box3(),
        tempSphere: new THREE.Sphere(),
        tempVec: new THREE.Vector3(),
        baseMeshColor: new THREE.Color(0xf2f4f7),

        // View settings
        viewSettings: {
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
        }
    };

    // Apply initial view settings
    Object.assign(viewerState.viewSettings, initialViewSettings);

    // Initialize the Three.js scene and objects
    const sceneObjects = initializeViewerScene(container, viewerState.viewSettings);
    Object.assign(viewerState, sceneObjects);

    // Set up desired positions for animation
    viewerState.desiredTarget.copy(viewerState.controls.target);
    viewerState.desiredCameraPos.copy(viewerState.camera.position);

    // Set up resize handling
    const resizeHandler = () => handleUIResize(container, viewerState);
    window.addEventListener("resize", resizeHandler);
    resizeHandler(); // Initial call

    // Set up input interrupts for animation
    attachInputInterrupts(viewerState.renderer.domElement, viewerState);

    // Start render loop
    startRenderLoop(viewerState.renderer, viewerState.composer, viewerState.controls, (now) => {
        const frameTime = now ?? performance.now();
        const dt = Math.min(0.05, Math.max(0, (frameTime - viewerState.lastFrameTime) / 1000));
        viewerState.lastFrameTime = frameTime;

        // Update renderer exposure
        viewerState.renderer.toneMappingExposure = Math.max(0.2, viewerState.viewSettings.exposure);

        // Update lighting
        updateLighting(viewerState, now);

        // Update camera animation
        updateCameraAnimation(dt, viewerState);

        // Update highlight animation
        updateHighlightAnimation(dt, viewerState);
    });

    // Return the public API
    return {
        setMeshFromApi: (meshData) => setMeshFromApi(meshData, viewerState),
        showIssue: (issue) => showIssue(issue, viewerState),
        showIssueAll: (issue) => showIssueAll(issue, viewerState),
        showIssueItem: (issue, index) => showIssueItem(issue, index, viewerState),
        showComponent: (faceIndices, options) => showComponent(faceIndices, options, viewerState),
        showAllComponents: (options) => showAllComponents(options, viewerState),
        clearHighlights: () => clearHighlights(viewerState),
        focusFace: (faceIndex) => focusFace(faceIndex, viewerState),
        focusEdge: (edgePair) => focusEdge(edgePair, viewerState),
        setViewSettings: (partial) => setViewSettings(partial, viewerState),
        getViewSettings: () => getViewSettings(viewerState),
        getSceneScale: () => viewerState.sceneScale,
        resetViewSettings: () => resetViewSettings(viewerState),
        centerView: () => centerView(viewerState),
        frameBounds: (boundsOrSphere, options) => frameBounds(boundsOrSphere, options, viewerState),
        frameView: () => frameView(viewerState),
        getCurrentBounds: () => getCurrentBounds(viewerState),
        getMeshOffset: () => getMeshOffset(viewerState),
        setComponentOverlays: (list) => setComponentOverlays(list, viewerState),
        focusComponentFaces: (faceIndices) => focusComponentFaces(faceIndices, viewerState),
        clearComponentFocus: () => clearComponentFocus(viewerState)
    };
}