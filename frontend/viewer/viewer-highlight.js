import * as THREE from "three";
import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineGeometry.js";
import { LineSegments2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineSegmentsGeometry.js";

// Remove highlight meshes/lines immediately.
export function discardHighlights(viewerState) {
    const { highlightMesh, highlightEdges, highlightLineMaterial } = viewerState;
    if (highlightMesh) {
        if (highlightMesh.parent) {
            highlightMesh.parent.remove(highlightMesh);
        }
        highlightMesh.geometry.dispose();
        highlightMesh.material.dispose();
        viewerState.highlightMesh = null;
    }
    if (highlightEdges) {
        if (highlightEdges.parent) {
            highlightEdges.parent.remove(highlightEdges);
        }
        highlightEdges.geometry.dispose();
        if (highlightLineMaterial) {
            highlightLineMaterial.dispose();
        }
        viewerState.highlightEdges = null;
        viewerState.highlightLineMaterial = null;
    }
    viewerState.highlightOpacity = 0;
    viewerState.highlightOpacityTarget = 0;
    viewerState.pendingHighlightClear = false;
}

// Fade out highlights; safe to call when nothing is highlighted.
export function clearHighlights(viewerState) {
    const { highlightMesh, highlightEdges } = viewerState;
    if (!highlightMesh && !highlightEdges) return;
    viewerState.highlightOpacityTarget = 0;
    viewerState.pendingHighlightClear = true;
}

// Reset highlight state before drawing new highlights.
export function beginHighlighting(viewerState) {
    discardHighlights(viewerState);
    viewerState.highlightOpacity = 0;
    viewerState.highlightOpacityTarget = 0;
    viewerState.pendingHighlightClear = false;
}

// Remap face indices if a subset geometry is active.
export function mapFaceList(faceIndices, viewerState) {
    const { faceIndexMap } = viewerState;
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
export function mapEdgePairs(edgePairs, viewerState) {
    const { vertexIndexMap } = viewerState;
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

// Draw translucent faces for provided indices against the ORIGINAL mesh geometry (no subset remapping).
export function highlightFaces(faceIndices, viewerState) {
    const { currentMesh, highlightFaceOpacity, basePositions, baseIndices, baseFaceCount } = viewerState;
    if (!currentMesh) return;
    if (!basePositions || !baseIndices) return;
    if (!Array.isArray(faceIndices) || !faceIndices.length) return;

    const clamped = faceIndices.filter((f) => Number.isInteger(f) && f >= 0 && f < baseFaceCount);
    if (!clamped.length) return;

    // Build non-indexed triangles directly from base geometry so all issue faces render, even if a subset mesh is active.
    const outPositions = new Float32Array(clamped.length * 9);
    for (let i = 0; i < clamped.length; i++) {
        const faceIndex = clamped[i];
        const i0 = baseIndices[faceIndex * 3 + 0];
        const i1 = baseIndices[faceIndex * 3 + 1];
        const i2 = baseIndices[faceIndex * 3 + 2];

        const o = i * 9;
        outPositions[o + 0] = basePositions[i0 * 3 + 0];
        outPositions[o + 1] = basePositions[i0 * 3 + 1];
        outPositions[o + 2] = basePositions[i0 * 3 + 2];
        outPositions[o + 3] = basePositions[i1 * 3 + 0];
        outPositions[o + 4] = basePositions[i1 * 3 + 1];
        outPositions[o + 5] = basePositions[i1 * 3 + 2];
        outPositions[o + 6] = basePositions[i2 * 3 + 0];
        outPositions[o + 7] = basePositions[i2 * 3 + 1];
        outPositions[o + 8] = basePositions[i2 * 3 + 2];
    }

    const highlightGeometry = new THREE.BufferGeometry();
    highlightGeometry.setAttribute("position", new THREE.BufferAttribute(outPositions, 3));
    highlightGeometry.computeVertexNormals();

    const highlightMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0,
        depthTest: false,      // draw on top
        side: THREE.DoubleSide // show even if normals are flipped
    });

    viewerState.highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
    viewerState.highlightMesh.renderOrder = 999; // draw after the base mesh
    currentMesh.add(viewerState.highlightMesh);
    viewerState.highlightOpacityTarget = 1;
    viewerState.pendingHighlightClear = false;
}

// Draw overlay line segments for provided edge pairs against the ORIGINAL mesh geometry (no subset remapping).
export function highlightEdgePairs(edgePairs, viewerState) {
    const { currentMesh, renderer, drawBufferSize, basePositions, highlightLineOpacity } = viewerState;
    if (!currentMesh) return;
    if (!basePositions) return;
    if (!Array.isArray(edgePairs) || !edgePairs.length) return;

    const valid = edgePairs.filter((e) => Array.isArray(e) && e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]));
    if (!valid.length) return;

    const positions = new Float32Array(valid.length * 6);

    for (let i = 0; i < valid.length; i++) {
        const [a, b] = valid[i];
        const ia = a | 0;
        const ib = b | 0;

        const o = i * 6;
        positions[o + 0] = basePositions[ia * 3 + 0];
        positions[o + 1] = basePositions[ia * 3 + 1];
        positions[o + 2] = basePositions[ia * 3 + 2];

        positions[o + 3] = basePositions[ib * 3 + 0];
        positions[o + 4] = basePositions[ib * 3 + 1];
        positions[o + 5] = basePositions[ib * 3 + 2];
    }

    const geom = new LineGeometry();
    geom.setPositions(positions);

    viewerState.highlightLineMaterial = new LineMaterial({
        color: 0xff0000,
        linewidth: getHighlightLineWidthPx(viewerState),        // pixels (this is what we want)
        transparent: true,
        opacity: 0,
        depthTest: false      // draw on top
    });

    // IMPORTANT: LineMaterial needs renderer resolution
    renderer.getDrawingBufferSize(drawBufferSize);
    viewerState.highlightLineMaterial.resolution.set(drawBufferSize.x, drawBufferSize.y);

    viewerState.highlightEdges = new Line2(geom, viewerState.highlightLineMaterial);
    viewerState.highlightEdges.computeLineDistances();
    viewerState.highlightEdges.renderOrder = 1000;

    currentMesh.add(viewerState.highlightEdges);
    viewerState.highlightOpacityTarget = 1;
    viewerState.pendingHighlightClear = false;
}

// Compute world-space centroid for a face index.
export function faceCentroid(faceIndex, viewerState) {
    const { currentMesh, basePositions, baseIndices, baseFaceCount } = viewerState;
    if (!currentMesh || !basePositions || !baseIndices) return new THREE.Vector3();
    if (faceIndex < 0 || faceIndex >= baseFaceCount) return new THREE.Vector3();

    const i0 = baseIndices[faceIndex * 3 + 0];
    const i1 = baseIndices[faceIndex * 3 + 1];
    const i2 = baseIndices[faceIndex * 3 + 2];

    const v0 = new THREE.Vector3(
        basePositions[i0 * 3 + 0],
        basePositions[i0 * 3 + 1],
        basePositions[i0 * 3 + 2]
    );
    const v1 = new THREE.Vector3(
        basePositions[i1 * 3 + 0],
        basePositions[i1 * 3 + 1],
        basePositions[i1 * 3 + 2]
    );
    const v2 = new THREE.Vector3(
        basePositions[i2 * 3 + 0],
        basePositions[i2 * 3 + 1],
        basePositions[i2 * 3 + 2]
    );

    const centroid = new THREE.Vector3().add(v0).add(v1).add(v2).multiplyScalar(1 / 3);
    return currentMesh.localToWorld(centroid);
}

// Compute world-space midpoint for an edge pair.
export function edgeMidpoint(edgePair, viewerState) {
    const { currentMesh, basePositions } = viewerState;
    if (!currentMesh || !basePositions) return new THREE.Vector3();
    const [a, b] = edgePair || [];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return new THREE.Vector3();

    const va = new THREE.Vector3(
        basePositions[a * 3 + 0],
        basePositions[a * 3 + 1],
        basePositions[a * 3 + 2]
    );
    const vb = new THREE.Vector3(
        basePositions[b * 3 + 0],
        basePositions[b * 3 + 1],
        basePositions[b * 3 + 2]
    );

    const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
    return currentMesh.localToWorld(mid);
}

// Highlight and focus a single face by index.
export function highlightFaceOnly(faceIndex, viewerState) {
    const { currentMesh } = viewerState;
    if (!currentMesh || faceIndex == null) return;
    beginHighlighting(viewerState);
    highlightFaces([faceIndex], viewerState);
}

// Highlight and focus a single face by index.
export function focusFace(faceIndex, viewerState) {
    const { currentMesh, camera, controls } = viewerState;
    if (!currentMesh || faceIndex == null) return;
    beginHighlighting(viewerState);
    highlightFaces([faceIndex], viewerState);
    const mapped = mapFaceList([faceIndex], viewerState);
    if (!mapped.length) return;
    const centroid = faceCentroid(mapped[0], viewerState);
    const dist = camera.position.distanceTo(controls.target);
    moveCameraToPoint(centroid, dist, viewerState);
    viewerState.controls.update();
}

// Highlight and focus a single edge pair.
export function highlightEdgeOnly(edgePair, viewerState) {
    const { currentMesh } = viewerState;
    if (!currentMesh || !edgePair) return;
    beginHighlighting(viewerState);
    highlightEdgePairs([edgePair], viewerState);
}

// Highlight and focus a single edge pair.
export function focusEdge(edgePair, viewerState) {
    const { currentMesh, camera, controls } = viewerState;
    if (!currentMesh || !edgePair) return;
    beginHighlighting(viewerState);
    highlightEdgePairs([edgePair], viewerState);
    const mapped = mapEdgePairs([edgePair], viewerState);
    if (!mapped.length) return;
    const mid = edgeMidpoint(mapped[0], viewerState);
    const dist = camera.position.distanceTo(controls.target);
    moveCameraToPoint(mid, dist, viewerState);
    viewerState.controls.update();
}

// Highlight all faces/edges for an issue without stepping.
export function showIssueAll(issue, viewerState) {
    beginHighlighting(viewerState);
    if (!issue) return;

    if (issue.faces && issue.faces.length) {
        highlightFaces(issue.faces, viewerState);
    }

    if (issue.edges && issue.edges.length) {
        highlightEdgePairs(issue.edges, viewerState);
    }
}

// Highlight a specific item of an issue; falls back to show all.
export function showIssueItem(issue, index, options = {}, viewerState) {
    const { focusCamera = true } = options || {};
    if (!issue) {
        clearHighlights(viewerState);
        return;
    }
    const faces = Array.isArray(issue.faces) ? issue.faces : [];
    const edges = Array.isArray(issue.edges) ? issue.edges : [];

    if (faces.length) {
        const safe = ((index % faces.length) + faces.length) % faces.length;
        if (focusCamera) {
            focusFace(faces[safe], viewerState);
        } else {
            highlightFaceOnly(faces[safe], viewerState);
        }
    } else if (edges.length) {
        const safe = ((index % edges.length) + edges.length) % edges.length;
        if (focusCamera) {
            focusEdge(edges[safe], viewerState);
        } else {
            highlightEdgeOnly(edges[safe], viewerState);
        }
    } else {
        showIssueAll(issue, viewerState);
    }
}

// Keep backward compatibility
// Deprecated alias for showIssueAll.
export function showIssue(issue, viewerState) {
    showIssueAll(issue, viewerState);
}

// Update highlight opacity animation in render loop.
export function updateHighlightAnimation(dt, viewerState) {
    const { highlightMesh, highlightEdges, highlightLineMaterial, highlightOpacity,
        highlightOpacityTarget, pendingHighlightClear, highlightFaceOpacity,
        highlightLineOpacity } = viewerState;

    if (highlightMesh || highlightEdges || pendingHighlightClear) {
        const t = dt > 0 ? (1 - Math.exp(-dt / viewerState.highlightFadeSeconds)) : 1;
        viewerState.highlightOpacity += (highlightOpacityTarget - highlightOpacity) * t;
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
            discardHighlights(viewerState);
        }
    }
}

// Import functions from other modules
import { getHighlightLineWidthPx } from "./viewer-view-settings.js";
import { moveCameraToPoint } from "./viewer-camera.js";
