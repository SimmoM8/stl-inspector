import * as THREE from "three";

/**
 * Safe guard for sceneScale to avoid NaNs.
 * @param {Object} viewerState - The viewer state object.
 * @returns {number} The safe scene scale value.
 */
export function getSafeScale(viewerState) {
    return Number.isFinite(viewerState.sceneScale) && viewerState.sceneScale > 0 ? viewerState.sceneScale : 1;
}

/**
 * Get current mesh offset used when framing bounds.
 * @param {Object} viewerState - The viewer state object.
 * @returns {THREE.Vector3} The mesh offset vector.
 */
export function getMeshOffset(viewerState) {
    return viewerState.currentMesh ? viewerState.currentMesh.position.clone() : new THREE.Vector3();
}

/**
 * Compute world-space bounds for a geometry, respecting mesh offset.
 * @param {THREE.BufferGeometry} geometry - The geometry to compute bounds for.
 * @param {Object} viewerState - The viewer state object.
 * @returns {Object|null} Object containing box and sphere bounds, or null if no geometry.
 */
export function getWorldBounds(geometry, viewerState) {
    const geom = geometry || viewerState.currentMesh?.geometry;
    if (!geom) return null;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingSphere) geom.computeBoundingSphere();
    const box = geom.boundingBox ? geom.boundingBox.clone() : null;
    const sphere = geom.boundingSphere ? geom.boundingSphere.clone() : null;
    if (viewerState.currentMesh && viewerState.currentMesh.position) {
        if (box) box.translate(viewerState.currentMesh.position);
        if (sphere) sphere.center.add(viewerState.currentMesh.position);
    }
    return { box, sphere };
}

/**
 * Build bounds for a set of face indices from the base geometry.
 * @param {Array<number>} faceIndices - Array of face indices.
 * @param {Object} viewerState - The viewer state object.
 * @returns {Object|null} Object containing box and sphere bounds, or null if invalid.
 */
export function getFaceBounds(faceIndices, viewerState) {
    if (!viewerState.currentMesh || !Array.isArray(faceIndices) || !faceIndices.length) return null;
    if (!viewerState.basePositions || !viewerState.baseIndices) return null;

    const box = new THREE.Box3();
    box.makeEmpty();

    for (const faceIndex of faceIndices) {
        if (faceIndex < 0 || faceIndex >= viewerState.baseFaceCount) continue;
        const i0 = viewerState.baseIndices[faceIndex * 3 + 0];
        const i1 = viewerState.baseIndices[faceIndex * 3 + 1];
        const i2 = viewerState.baseIndices[faceIndex * 3 + 2];
        const verts = [i0, i1, i2];
        for (const v of verts) {
            viewerState.tempVec.set(
                viewerState.basePositions[v * 3 + 0],
                viewerState.basePositions[v * 3 + 1],
                viewerState.basePositions[v * 3 + 2]
            );
            box.expandByPoint(viewerState.tempVec);
        }
    }

    if (box.isEmpty()) return null;
    box.translate(viewerState.currentMesh.position);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return { box, sphere };
}

/**
 * Frame the camera/controls to the provided bounds; optional animation.
 * @param {Object|THREE.Sphere} boundsOrSphere - Bounds object or sphere to frame.
 * @param {Object} options - Options object with animate flag.
 * @param {Object} viewerState - The viewer state object.
 * @returns {Object|null} The frame result or null if failed.
 */
export function applyFrameToBounds(boundsOrSphere, options = {}, viewerState) {
    const { animate = false } = options;
    const frame = viewerState.frameTarget(boundsOrSphere, { apply: false });
    if (!frame) return null;

    const minDistance = Math.max(0.01, frame.minDistance);
    viewerState.controls.minDistance = minDistance;
    viewerState.controls.maxDistance = Math.max(minDistance * 2, frame.maxDistance);
    viewerState.camera.near = frame.near;
    viewerState.camera.far = frame.far;
    viewerState.camera.updateProjectionMatrix();

    if (animate) {
        viewerState.desiredTarget.copy(frame.target);
        viewerState.desiredCameraPos.copy(frame.position);
        viewerState.animatingFocus = true;
    } else {
        viewerState.animatingFocus = false;
        viewerState.controls.target.copy(frame.target);
        viewerState.camera.position.copy(frame.position);
        viewerState.desiredTarget.copy(frame.target);
        viewerState.desiredCameraPos.copy(frame.position);
        viewerState.controls.update();
    }
    return frame;
}

/**
 * Radius helper for camera constraints; defaults to 1 if missing.
 * @param {Object} viewerState - The viewer state object.
 * @returns {number} The mesh radius.
 */
export function getMeshRadius(viewerState) {
    if (!viewerState.currentMesh || !viewerState.currentMesh.geometry || !viewerState.currentMesh.geometry.boundingSphere) return 1;
    const r = viewerState.currentMesh.geometry.boundingSphere.radius;
    return Number.isFinite(r) && r > 0 ? r : 1;
}

/**
 * Resize helpers and reframe camera to fit given geometry.
 * @param {THREE.BufferGeometry} geometry - The geometry to fit.
 * @param {Object} viewerState - The viewer state object.
 */
export function fitHelpersAndCamera(geometry, viewerState) {
    updateHelperScales(geometry, viewerState);
    const bounds = getWorldBounds(geometry, viewerState);
    if (!bounds) return;
    applyFrameToBounds(bounds.sphere || bounds.box, { animate: false }, viewerState);
}

/**
 * Move camera to focus on a specific point with appropriate distance.
 * @param {THREE.Vector3} point - The point to focus on.
 * @param {number} distance - The distance from the point.
 * @param {Object} viewerState - The viewer state object.
 */
export function moveCameraToPoint(point, distance, viewerState) {
    const offset = viewerState.camera.position.clone().sub(viewerState.controls.target);
    const minDist = Number.isFinite(viewerState.controls.minDistance) ? viewerState.controls.minDistance : 0.01;
    const maxDist = Number.isFinite(viewerState.controls.maxDistance) ? viewerState.controls.maxDistance : Infinity;
    const clampedDist = THREE.MathUtils.clamp(distance, minDist, maxDist);
    offset.setLength(clampedDist);
    viewerState.desiredTarget.copy(point);
    viewerState.desiredCameraPos.copy(point).add(offset);
    viewerState.animatingFocus = true;
}

/**
 * Recenter mesh on grid and refit camera.
 * @param {Object} viewerState - The viewer state object.
 */
export function centerView(viewerState) {
    if (!viewerState.currentMesh) return;
    if (!viewerState.currentMesh.geometry.boundingBox) viewerState.currentMesh.geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    viewerState.currentMesh.geometry.boundingBox.getCenter(center);
    const minY = viewerState.currentMesh.geometry.boundingBox.min.y;

    // Place mesh center at origin in X/Z and rest it on the grid in Y (no cumulative drift)
    viewerState.currentMesh.position.set(-center.x, -minY, -center.z);
    const floorY = viewerState.currentMesh.position.y;
    viewerState.gridHelper.position.y = floorY;
    viewerState.ground.position.y = floorY;
    // TODO: syncGlobalOutlineTransform and updateGlobalOutlineVisibility

    fitHelpersAndCamera(viewerState.currentMesh.geometry, viewerState);
}

/**
 * Frame entire mesh with an animated camera move.
 * @param {Object} viewerState - The viewer state object.
 */
export function frameView(viewerState) {
    if (!viewerState.currentMesh) return;
    const bounds = getWorldBounds(viewerState.currentMesh.geometry, viewerState);
    if (!bounds) return;
    applyFrameToBounds(bounds.sphere || bounds.box, { animate: true }, viewerState);
}

/**
 * Frame arbitrary bounds or sphere; pass animate flag via options.
 * @param {Object|THREE.Sphere} boundsOrSphere - Bounds or sphere to frame.
 * @param {Object} options - Options object.
 * @param {Object} viewerState - The viewer state object.
 * @returns {Object|null} The frame result.
 */
export function frameBounds(boundsOrSphere, options = {}, viewerState) {
    return applyFrameToBounds(boundsOrSphere, options, viewerState);
}

/**
 * Return current mesh bounds for external consumers.
 * @param {Object} viewerState - The viewer state object.
 * @returns {Object|null} The current bounds.
 */
export function getCurrentBounds(viewerState) {
    return getWorldBounds(viewerState.currentMesh?.geometry, viewerState);
}

/**
 * Stop smooth focus animation when user interacts.
 * @param {Object} viewerState - The viewer state object.
 */
export function stopFocusAnimation(viewerState) {
    viewerState.animatingFocus = false;
    viewerState.desiredTarget.copy(viewerState.controls.target);
    viewerState.desiredCameraPos.copy(viewerState.camera.position);
}

/**
 * Cancel focus animation on mouse, scroll, or keyboard input.
 * @param {HTMLElement} domElement - The DOM element to attach listeners to.
 * @param {Object} viewerState - The viewer state object.
 */
export function attachInputInterrupts(domElement, viewerState) {
    const stop = () => stopFocusAnimation(viewerState);
    domElement.addEventListener("pointerdown", stop);
    domElement.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", stop);
}

/**
 * Update camera animation in the render loop.
 * @param {number} dt - Delta time since last frame.
 * @param {Object} viewerState - The viewer state object.
 */
export function updateCameraAnimation(dt, viewerState) {
    if (viewerState.animatingFocus) {
        viewerState.camera.position.lerp(viewerState.desiredCameraPos, 0.15);
        viewerState.controls.target.lerp(viewerState.desiredTarget, 0.18);

        const camDone = viewerState.camera.position.distanceTo(viewerState.desiredCameraPos) < 1e-3;
        const tgtDone = viewerState.controls.target.distanceTo(viewerState.desiredTarget) < 1e-3;
        if (camDone && tgtDone) {
            viewerState.camera.position.copy(viewerState.desiredCameraPos);
            viewerState.controls.target.copy(viewerState.desiredTarget);
            viewerState.animatingFocus = false;
        }
    }
}

// Placeholder functions that need to be implemented
function updateHelperScales(geometry, viewerState) { /* TODO */ }