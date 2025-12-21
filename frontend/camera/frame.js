import * as THREE from "three";

// Normalize a Box3 or Sphere into a bounding sphere for framing.
function toSphere(boundsOrSphere, tempBox, tempSphere) {
    if (!boundsOrSphere) return null;
    if (boundsOrSphere.isSphere) return boundsOrSphere;
    if (boundsOrSphere.isBox3) {
        tempBox.copy(boundsOrSphere);
        tempBox.getBoundingSphere(tempSphere);
        return tempSphere;
    }
    return null;
}

// Create a framing helper that moves the camera/controls to fit given bounds.
export function createFrameTarget(camera, controls, options = {}) {
    const {
        distanceMultiplier = 1.15,
        lift = 0.2,
        minDistanceScale = 0.2,
        maxDistanceScale = 10,
        fallbackRadius = 1,
    } = options;

    const tempBox = new THREE.Box3();
    const tempSphere = new THREE.Sphere();

    // Frame the provided bounds/sphere; apply true to move camera immediately.
    return function frameTarget(boundsOrSphere, opts = {}) {
        const apply = opts.apply ?? true;
        const sphere = toSphere(boundsOrSphere, tempBox, tempSphere);
        const fallback = typeof fallbackRadius === "function" ? fallbackRadius() : fallbackRadius;
        const radius = Math.max(opts.radiusOverride ?? sphere?.radius ?? fallback ?? 1, 1e-5);
        const center = (opts.centerOverride && opts.centerOverride.clone())
            || (sphere ? sphere.center.clone() : new THREE.Vector3());
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = (radius / Math.sin(fov / 2)) * distanceMultiplier;

        const target = center.clone();
        const position = center.clone().add(new THREE.Vector3(0, radius * lift, distance));

        const clipScale = radius * 2;
        const near = Math.max(0.01, clipScale / 1000);
        const far = Math.max(near * 1000, clipScale * 10);
        const minDistance = Math.max(0.01, radius * minDistanceScale);
        const maxDistance = Math.max(minDistance * 2, radius * maxDistanceScale);

        if (apply) {
            controls.target.copy(target);
            camera.position.copy(position);
            controls.minDistance = minDistance;
            controls.maxDistance = maxDistance;
            camera.near = near;
            camera.far = far;
            camera.updateProjectionMatrix();
            controls.update();
        }

        return { target, position, near, far, radius, distance, minDistance, maxDistance };
    };
}
