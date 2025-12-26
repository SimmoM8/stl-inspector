import * as THREE from "three";

/**
 * Handle viewport resize events to maintain proper rendering dimensions and aspect ratios.
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
 * Update dynamic lighting positions and orientations based on camera movement.
 * This creates the effect of lights following the camera for consistent illumination.
 * @param {Object} viewerState - The viewer state object containing lights and camera.
 * @param {number} now - Current timestamp for any time-based effects.
 */
export function updateLighting(viewerState, now) {
    // Position head light to follow camera
    viewerState.headLight.position.copy(viewerState.camera.position);
    viewerState.headLight.target.position.copy(viewerState.controls.target);
    viewerState.headLight.target.updateMatrixWorld();

    // Subtle light steering: key and rim lights gently follow camera yaw/pitch
    const camDir = new THREE.Vector3();
    viewerState.camera.getWorldDirection(camDir);
    const right = new THREE.Vector3().crossVectors(camDir, viewerState.camera.up).normalize();
    const up = viewerState.camera.up.clone().normalize();

    // Position key light relative to target
    viewerState.keyLight.position.copy(viewerState.controls.target)
        .addScaledVector(camDir, 6)
        .addScaledVector(up, 4)
        .addScaledVector(right, 2);
    viewerState.keyLight.target.position.copy(viewerState.controls.target);
    viewerState.keyLight.target.updateMatrixWorld();

    // Position rim light for edge highlighting
    viewerState.rimLight.position.copy(viewerState.controls.target)
        .addScaledVector(camDir.clone().negate(), 5)
        .addScaledVector(up, 3)
        .addScaledVector(right.clone().negate(), 1.5);
    viewerState.rimLight.target.position.copy(viewerState.controls.target);
    viewerState.rimLight.target.updateMatrixWorld();
}