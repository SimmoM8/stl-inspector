import * as THREE from "three";

// Safe guard for sceneScale to avoid NaNs.
export function getSafeScale(viewerState) {
    const { sceneScale } = viewerState;
    return Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
}

// Get current mesh offset used when framing bounds.
export function getMeshOffset(viewerState) {
    const { currentMesh } = viewerState;
    return currentMesh ? currentMesh.position.clone() : new THREE.Vector3();
}

// Compute world-space bounds for a geometry, respecting mesh offset.
export function getWorldBounds(geometry, viewerState) {
    const { currentMesh } = viewerState;
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
export function getFaceBounds(faceIndices, viewerState) {
    const { currentMesh, basePositions, baseIndices } = viewerState;
    if (!currentMesh || !Array.isArray(faceIndices) || !faceIndices.length) return null;
    if (!basePositions || !baseIndices) return null;

    const box = new THREE.Box3();
    box.makeEmpty();

    for (const faceIndex of faceIndices) {
        if (faceIndex < 0 || faceIndex >= viewerState.baseFaceCount) continue;
        const i0 = baseIndices[faceIndex * 3 + 0];
        const i1 = baseIndices[faceIndex * 3 + 1];
        const i2 = baseIndices[faceIndex * 3 + 2];
        const verts = [i0, i1, i2];
        for (const v of verts) {
            viewerState.tempVec.set(
                basePositions[v * 3 + 0],
                basePositions[v * 3 + 1],
                basePositions[v * 3 + 2]
            );
            box.expandByPoint(viewerState.tempVec);
        }
    }

    if (box.isEmpty()) return null;
    box.translate(currentMesh.position);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    return { box, sphere };
}

// Frame the camera/controls to the provided bounds; optional animation.
export function applyFrameToBounds(boundsOrSphere, options, viewerState) {
    const { animatingFocus, desiredTarget, desiredCameraPos, controls, camera, frameTarget } = viewerState;
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
        viewerState.animatingFocus = true;
    } else {
        viewerState.animatingFocus = false;
        controls.target.copy(frame.target);
        camera.position.copy(frame.position);
        desiredTarget.copy(frame.target);
        desiredCameraPos.copy(frame.position);
        controls.update();
    }
    return frame;
}

// Radius helper for camera constraints; defaults to 1 if missing.
export function getMeshRadius(viewerState) {
    const { currentMesh } = viewerState;
    if (!currentMesh || !currentMesh.geometry || !currentMesh.geometry.boundingSphere) return 1;
    const r = currentMesh.geometry.boundingSphere.radius;
    return Number.isFinite(r) && r > 0 ? r : 1;
}

// Resize helpers and reframe camera to fit given geometry.
export function fitHelpersAndCamera(geometry, viewerState) {
    updateHelperScales(geometry, viewerState);
    const bounds = getWorldBounds(geometry, viewerState);
    if (!bounds) return;
    applyFrameToBounds(bounds.sphere || bounds.box, { animate: false }, viewerState);
}

// Animate camera toward a point while keeping relative offset reasonable.
export function moveCameraToPoint(point, preferredRadius, viewerState) {
    const { currentMesh, camera, controls, desiredTarget, desiredCameraPos } = viewerState;
    if (!currentMesh) return;
    // Preserve current camera offset; only shorten for tighter framing, never lengthen.
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const hasOffset = offset.lengthSq() >= 1e-6;
    const r = preferredRadius || getMeshRadius(viewerState);
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
    viewerState.animatingFocus = true;
}

// Recenter mesh on grid and refit camera.
export function centerView(viewerState) {
    const { currentMesh, gridHelper, ground, axesHelper } = viewerState;
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
    syncGlobalOutlineTransform(viewerState);
    updateGlobalOutlineVisibility(viewerState);

    fitHelpersAndCamera(currentMesh.geometry, viewerState);
}

// Frame entire mesh with an animated camera move.
export function frameView(viewerState) {
    const { currentMesh } = viewerState;
    if (!currentMesh) return;
    const bounds = getWorldBounds(currentMesh.geometry, viewerState);
    if (!bounds) return;
    applyFrameToBounds(bounds.sphere || bounds.box, { animate: true }, viewerState);
}

// Frame arbitrary bounds or sphere; pass animate flag via options.
export function frameBounds(boundsOrSphere, options, viewerState) {
    return applyFrameToBounds(boundsOrSphere, options, viewerState);
}

// Return current mesh bounds for external consumers.
export function getCurrentBounds(viewerState) {
    return getWorldBounds(viewerState.currentMesh?.geometry, viewerState);
}

// Stop smooth focus animation when user interacts.
export function stopFocusAnimation(viewerState) {
    viewerState.animatingFocus = false;
    viewerState.desiredTarget.copy(viewerState.controls.target);
    viewerState.desiredCameraPos.copy(viewerState.camera.position);
}

// Cancel focus animation on mouse, scroll, or keyboard input.
export function attachInputInterrupts(container, viewerState) {
    const stop = () => stopFocusAnimation(viewerState);
    container.addEventListener("pointerdown", stop);
    container.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", stop);
}

// Update camera animation in the render loop.
export function updateCameraAnimation(dt, viewerState) {
    const { animatingFocus, camera, controls, desiredCameraPos, desiredTarget } = viewerState;
    if (animatingFocus) {
        camera.position.lerp(desiredCameraPos, 0.15);
        controls.target.lerp(desiredTarget, 0.18);

        const camDone = camera.position.distanceTo(desiredCameraPos) < 1e-3;
        const tgtDone = controls.target.distanceTo(desiredTarget) < 1e-3;
        if (camDone && tgtDone) {
            camera.position.copy(desiredCameraPos);
            controls.target.copy(desiredTarget);
            viewerState.animatingFocus = false;
        }
    }
}

// Import functions that will be defined in other files
import { updateHelperScales, syncGlobalOutlineTransform, updateGlobalOutlineVisibility } from "./viewer-view-settings.js";