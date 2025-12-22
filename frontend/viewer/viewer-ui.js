// Handle viewport resize to keep renderer and outlines sharp.
export function handleResize(container, viewerState) {
    const { camera, renderer, composer, fxaaPass, highlightLineMaterial, edgeLineMaterial,
        selectionOutlineMaterial, componentOutlineMaterial, globalOutlineMaterial, drawBufferSize } = viewerState;

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

// Update lighting in the render loop.
export function updateLighting(viewerState, now) {
    const { camera, controls, keyLight, rimLight, headLight, currentEdges, sceneScale } = viewerState;

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

    // Update headlight position
    headLight.position.copy(camera.position);
    headLight.target.position.copy(controls.target);
    headLight.target.updateMatrixWorld();

    // Update edge opacity based on distance
    if (currentEdges) {
        const r = getMeshRadius(viewerState);
        const distance = camera.position.distanceTo(controls.target);
        const ratio = r / Math.max(distance, 1e-3);
        currentEdges.material.opacity = THREE.MathUtils.clamp(ratio * 0.9, 0.35, 0.95);
    }
}

// Import THREE for the updateLighting function
import * as THREE from "three";

// Import functions that will be defined in other files
import { getMeshRadius } from "./viewer-view-settings.js";