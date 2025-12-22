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

// Draw translucent faces for provided indices.
export function highlightFaces(faceIndices, viewerState) {
    const { currentMesh, sourceGeometry, highlightFaceOpacity } = viewerState;
    if (!currentMesh) return;
    if (!sourceGeometry) return;
    const mappedFaces = mapFaceList(faceIndices, viewerState);
    if (!mappedFaces.length) return;

    const baseGeom = sourceGeometry;
    const posAttr = baseGeom.getAttribute("position");
    const indexAttr = baseGeom.getIndex();

    // Build a NEW geometry containing ONLY the highlighted triangles
    const highlightGeometry = new THREE.BufferGeometry();

    // We'll create non-indexed triangles for simplicity:
    // each face contributes 3 vertices = 9 floats
    const outPositions = new Float32Array(mappedFaces.length * 9);

    for (let i = 0; i < mappedFaces.length; i++) {
        const faceIndex = mappedFaces[i];

        const i0 = indexAttr.getX(faceIndex * 3 + 0);
        const i1 = indexAttr.getX(faceIndex * 3 + 1);
        const i2 = indexAttr.getX(faceIndex * 3 + 2);

        const v0x = posAttr.getX(i0), v0y = posAttr.getY(i0), v0z = posAttr.getZ(i0);
        const v1x = posAttr.getX(i1), v1y = posAttr.getY(i1), v1z = posAttr.getZ(i1);
        const v2x = posAttr.getX(i2), v2y = posAttr.getY(i2), v2z = posAttr.getZ(i2);

        const o = i * 9;
        outPositions[o + 0] = v0x; outPositions[o + 1] = v0y; outPositions[o + 2] = v0z;
        outPositions[o + 3] = v1x; outPositions[o + 4] = v1y; outPositions[o + 5] = v1z;
        outPositions[o + 6] = v2x; outPositions[o + 7] = v2y; outPositions[o + 8] = v2z;
    }

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

// Draw overlay line segments for provided edge pairs.
export function highlightEdgePairs(edgePairs, viewerState) {
    const { currentMesh, sourceGeometry, renderer, drawBufferSize, highlightLineOpacity } = viewerState;
    if (!currentMesh) return;
    if (!sourceGeometry) return;
    const mappedEdges = mapEdgePairs(edgePairs, viewerState);
    if (!mappedEdges.length) return;

    const baseGeom = sourceGeometry;
    const posAttr = baseGeom.getAttribute("position");

    // Flatten into [x1,y1,z1, x2,y2,z2, ...]
    const positions = new Float32Array(mappedEdges.length * 6);

    for (let i = 0; i < mappedEdges.length; i++) {
        const [a, b] = mappedEdges[i];

        const o = i * 6;
        positions[o + 0] = posAttr.getX(a);
        positions[o + 1] = posAttr.getY(a);
        positions[o + 2] = posAttr.getZ(a);

        positions[o + 3] = posAttr.getX(b);
        positions[o + 4] = posAttr.getY(b);
        positions[o + 5] = posAttr.getZ(b);
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
    const { sourceGeometry, currentMesh } = viewerState;
    const baseGeom = sourceGeometry || currentMesh.geometry;
    const posAttr = baseGeom.getAttribute("position");
    const indexAttr = baseGeom.getIndex();

    const i0 = indexAttr.getX(faceIndex * 3 + 0);
    const i1 = indexAttr.getX(faceIndex * 3 + 1);
    const i2 = indexAttr.getX(faceIndex * 3 + 2);

    const v0 = new THREE.Vector3(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
    const v1 = new THREE.Vector3(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
    const v2 = new THREE.Vector3(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

    // Centroid = average of the 3 vertices
    const centroid = new THREE.Vector3();
    centroid.add(v0).add(v1).add(v2).multiplyScalar(1 / 3);

    return currentMesh.localToWorld(centroid);
}

// Compute world-space midpoint for an edge pair.
export function edgeMidpoint(edgePair, viewerState) {
    const { sourceGeometry, currentMesh } = viewerState;
    const baseGeom = sourceGeometry || currentMesh.geometry;
    const posAttr = baseGeom.getAttribute("position");
    const [a, b] = edgePair;

    const va = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
    const vb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));

    // Midpoint of the two vertices
    const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
    return currentMesh.localToWorld(mid);
}

// Highlight and focus a single face by index.
export function focusFace(faceIndex, viewerState) {
    const { currentMesh } = viewerState;
    if (!currentMesh || faceIndex == null) return;
    beginHighlighting(viewerState);
    highlightFaces([faceIndex], viewerState);
    const mapped = mapFaceList([faceIndex], viewerState);
    if (!mapped.length) return;
    const centroid = faceCentroid(mapped[0], viewerState);
    const r = getMeshRadius(viewerState);
    moveCameraToPoint(centroid, r * 0.6, viewerState);
    viewerState.controls.update();
}

// Highlight and focus a single edge pair.
export function focusEdge(edgePair, viewerState) {
    const { currentMesh } = viewerState;
    if (!currentMesh || !edgePair) return;
    beginHighlighting(viewerState);
    highlightEdgePairs([edgePair], viewerState);
    const mapped = mapEdgePairs([edgePair], viewerState);
    if (!mapped.length) return;
    const mid = edgeMidpoint(mapped[0], viewerState);
    const r = getMeshRadius(viewerState);
    moveCameraToPoint(mid, r * 0.6, viewerState);
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
export function showIssueItem(issue, index, viewerState) {
    if (!issue) {
        clearHighlights(viewerState);
        return;
    }
    const faces = Array.isArray(issue.faces) ? issue.faces : [];
    const edges = Array.isArray(issue.edges) ? issue.edges : [];

    if (faces.length) {
        const safe = ((index % faces.length) + faces.length) % faces.length;
        focusFace(faces[safe], viewerState);
    } else if (edges.length) {
        const safe = ((index % edges.length) + edges.length) % edges.length;
        focusEdge(edges[safe], viewerState);
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

// Import functions that will be defined in other files
import { getHighlightLineWidthPx, getMeshRadius, moveCameraToPoint } from "./viewer-view-settings.js";