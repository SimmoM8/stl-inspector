import * as THREE from "three";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Builds a compact geometry from a subset of faces, maintaining maps for remapping.
 * This function creates both source geometry (for stable indexing) and display geometry (for rendering).
 * @param {Array<number>} faceList - Array of face indices to include, or null for all faces.
 * @param {Object} viewerState - The viewer state containing base geometry data.
 * @returns {Object} Object containing sourceGeom, displayGeom, faceMap, and vertexMap.
 */
export function buildGeometryFromFaceList(faceList, viewerState) {
    const { basePositions, baseIndices, baseFaceCount, viewSettings } = viewerState;
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

    // Compute bounds for BOTH geometries
    sourceGeom.computeBoundingBox();
    sourceGeom.computeBoundingSphere();
    displayGeom.computeBoundingBox();
    displayGeom.computeBoundingSphere();

    // vertexMap should map original vertex indices -> sourceGeom vertex indices
    // (these are the indices used by issue.edges)
    return { sourceGeom, displayGeom, faceMap: fMap, vertexMap: vMap };
}