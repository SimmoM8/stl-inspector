import * as THREE from "three";

import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";

import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { SAOPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/SAOPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
import { createFrameTarget } from "../camera/frame.js";

// Initialize the Three.js scene, camera, renderer, lights, and post-processing.
export function initializeViewerScene(container, viewSettings) {
    // Create scene with neutral background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f2);
    const pivot = new THREE.Group();
    scene.add(pivot);

    // Create camera
    const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.01,
        1000
    );
    camera.position.set(0, 0, 3);

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = viewSettings.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Create composer and passes
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

    // Create CAD-style lighting rig
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

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.6;
    controls.screenSpacePanning = true;

    // Create frame target helper
    const frameTarget = createFrameTarget(camera, controls, {
        fallbackRadius: () => 0.5, // Will be updated when mesh is loaded
    });

    // Create helpers
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    let gridHelper = new THREE.GridHelper(10, 20);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    const groundGeom = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.25,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.receiveShadow = true;
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

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
        hemi
    };
}

// Handle viewport resize for renderer and composer.
export function handleResize(container, camera, renderer, composer, fxaaPass) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    composer.setSize(w, h);
    const ratio = renderer.getPixelRatio();
    fxaaPass.material.uniforms["resolution"].value.set(1 / (w * ratio), 1 / (h * ratio));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

// Start the main render loop.
export function startRenderLoop(renderer, composer, controls, updateCallback) {
    function animate(now) {
        requestAnimationFrame(animate);
        updateCallback(now);
        controls.update();
        composer.render();
    }
    animate();
}