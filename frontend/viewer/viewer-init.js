import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { SAOPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/SAOPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
import { createFrameTarget } from "../camera/frame.js";

/**
 * Initializes the core Three.js scene, camera, renderer, composer, controls, and lighting.
 * This function sets up the foundational elements of the 3D viewer.
 * @param {HTMLElement} container - The DOM element to attach the renderer to.
 * @param {Object} viewSettings - Initial view settings object containing configuration options.
 * @returns {Object} An object containing all initialized Three.js objects and helpers.
 */
export function initializeViewerScene(container, viewSettings) {
    // Create the main scene with a neutral background color for clarity
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f2);

    // Create a pivot group to allow for scene-wide transformations
    const pivot = new THREE.Group();
    scene.add(pivot);

    // Initialize helpers for visual reference
    const axesHelper = new THREE.AxesHelper(1); // Size will be updated after mesh loads
    scene.add(axesHelper);

    // Create a grid helper for spatial reference; size will be updated after mesh loads
    let gridHelper = new THREE.GridHelper(10, 20);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Create a ground plane with subtle transparency for depth perception
    const groundGeom = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.25,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2; // Rotate to horizontal (XZ plane)
    scene.add(ground);

    // Set up the camera with perspective projection
    const camera = new THREE.PerspectiveCamera(
        60, // Field of view
        container.clientWidth / container.clientHeight, // Aspect ratio
        0.01, // Near clipping plane
        1000 // Far clipping plane
    );
    camera.position.set(0, 0, 3); // Initial camera position

    // Initialize the WebGL renderer with antialiasing for smoother edges
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; // Ensure correct color space
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // High-quality tone mapping
    renderer.toneMappingExposure = viewSettings.exposure; // Initial exposure from settings
    renderer.shadowMap.enabled = true; // Enable shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadow mapping
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Set up post-processing composer for effects like SSAO and FXAA
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Configure SSAO (Screen Space Ambient Occlusion) pass for depth perception
    const saoPass = new SAOPass(scene, camera, false, true);
    saoPass.params.output = 0; // Output mode
    saoPass.params.saoIntensity = 0.05; // Intensity of ambient occlusion
    saoPass.params.saoBias = 0.0; // Bias to avoid artifacts
    saoPass.params.saoBlur = true; // Enable blurring for smoother results
    saoPass.params.saoBlurRadius = 8; // Blur radius
    saoPass.params.saoBlurStdDev = 4; // Standard deviation for blur
    saoPass.params.saoBlurDepthCutoff = 0.01; // Depth cutoff for blur
    saoPass.enabled = !!viewSettings.ssao; // Enable based on view settings
    composer.addPass(saoPass);

    // Add FXAA (Fast Approximate Anti-Aliasing) pass for smoother edges
    const fxaaPass = new ShaderPass(FXAAShader);
    composer.addPass(fxaaPass);

    // Set up CAD-style lighting rig for professional 3D visualization
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2f3540, 1.15); // Ambient hemisphere light
    scene.add(hemi);

    // Key light: main directional light with shadows
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048); // High-resolution shadow map
    keyLight.shadow.bias = -0.0006; // Shadow bias to reduce artifacts
    keyLight.shadow.normalBias = 0.02; // Normal bias for better shadow edges
    scene.add(keyLight);

    // Rim light: secondary directional light for edge highlighting
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(-4, 3, -2);
    scene.add(rimLight);

    // Head light: follows the camera for consistent illumination
    const headLight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(headLight);

    // Set up orbit controls for camera manipulation
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.08; // Damping strength
    controls.rotateSpeed = 0.6; // Rotation speed
    controls.zoomSpeed = 1.0; // Zoom speed
    controls.panSpeed = 0.6; // Pan speed
    controls.screenSpacePanning = true; // Allow panning in screen space

    // Create frame target for automatic camera framing
    const frameTarget = createFrameTarget(camera, controls, {
        fallbackRadius: () => 0.5, // Will be updated with getSafeScale later
    });

    // Return all initialized objects for use in the viewer state
    return {
        scene,
        camera,
        renderer,
        composer,
        controls,
        frameTarget,
        pivot,
        axesHelper,
        gridHelper,
        ground,
        saoPass,
        fxaaPass,
        keyLight,
        rimLight,
        headLight,
        hemi,
    };
}

/**
 * Handles viewport resize events to maintain proper rendering dimensions and aspect ratios.
 * Updates renderer, composer, camera, and material resolutions as needed.
 * @param {HTMLElement} container - The container element.
 * @param {Object} viewerState - The viewer state object containing renderer, composer, camera, and materials.
 */
export function handleResize(container, viewerState) {
    const w = container.clientWidth;
    const h = container.clientHeight;

    // Update renderer pixel ratio and size
    viewerState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewerState.renderer.setSize(w, h);

    // Update composer size
    viewerState.composer.setSize(w, h);

    // Update FXAA resolution uniform
    const ratio = viewerState.renderer.getPixelRatio();
    viewerState.fxaaPass.material.uniforms["resolution"].value.set(1 / (w * ratio), 1 / (h * ratio));

    // Update camera aspect ratio and projection matrix
    viewerState.camera.aspect = w / h;
    viewerState.camera.updateProjectionMatrix();

    // Update drawing buffer size for line materials
    viewerState.renderer.getDrawingBufferSize(viewerState.drawBufferSize);

    // Update resolution for all line materials to maintain crispness
    if (viewerState.highlightLineMaterial) {
        viewerState.highlightLineMaterial.resolution.set(viewerState.drawBufferSize.x, viewerState.drawBufferSize.y);
    }
    if (viewerState.edgeLineMaterial) {
        viewerState.edgeLineMaterial.resolution.set(viewerState.drawBufferSize.x, viewerState.drawBufferSize.y);
    }
    if (viewerState.selectionOutlineMaterial) {
        viewerState.selectionOutlineMaterial.resolution.set(viewerState.drawBufferSize.x, viewerState.drawBufferSize.y);
    }
    if (viewerState.componentOutlineMaterial) {
        viewerState.componentOutlineMaterial.resolution.set(viewerState.drawBufferSize.x, viewerState.drawBufferSize.y);
    }
    if (viewerState.globalOutlineMaterial) {
        viewerState.globalOutlineMaterial.resolution.set(viewerState.drawBufferSize.x, viewerState.drawBufferSize.y);
    }
}

/**
 * Starts the main render loop using requestAnimationFrame.
 * Calls the provided update callback each frame and renders the scene.
 * @param {THREE.WebGLRenderer} renderer - The WebGL renderer.
 * @param {EffectComposer} composer - The post-processing composer.
 * @param {OrbitControls} controls - The camera controls.
 * @param {Function} updateCallback - Callback function called each frame with timestamp.
 */
export function startRenderLoop(renderer, composer, controls, updateCallback) {
    // Main render loop function
    function animate(now) {
        requestAnimationFrame(animate);

        // Call the update callback for custom logic (lighting, animations, etc.)
        updateCallback(now);

        // Update controls for damping
        controls.update();

        // Render the scene through the composer
        composer.render();
    }

    // Start the animation loop
    animate();
}