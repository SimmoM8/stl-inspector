import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineGeometry.js";

export function createViewer(container) {
    let currentMesh = null;
    let currentEdges = null;
    let highlightMesh = null;
    let highlightEdges = null;
    let highlightLineMaterial = null;
    let desiredTarget = new THREE.Vector3(0, 0, 0);
    let desiredCameraPos = new THREE.Vector3(0, 0, 3);
    let animatingFocus = false;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf2f2f2);

    // Helpers
    const axesHelper = new THREE.AxesHelper(1); // size will be updated after mesh loads
    scene.add(axesHelper);

    const gridHelper = new THREE.GridHelper(10, 20); // size will be updated after mesh loads
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    const groundGeom = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.25,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2; // make it horizontal (XZ plane)
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.01,
        1000
    );
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Simple lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(5, 5, 5);
    scene.add(dir1);

    // Second light to reduce harsh shadows
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-5, -5, 3);
    scene.add(dir2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.6;

    controls.screenSpacePanning = true;
    desiredTarget.copy(controls.target);
    desiredCameraPos.copy(camera.position);

    // Optional: constrain zoom distances once mesh is loaded
    // we’ll set min/max in setMeshFromApi after we know the bounding sphere

    function setMeshFromApi(meshData) {
        const { vertices, faces } = meshData;

        // positions: flat float array length = vertices.length * 3
        const positions = new Float32Array(vertices.length * 3);
        for (let i = 0; i < vertices.length; i++) {
            positions[i * 3 + 0] = vertices[i][0];
            positions[i * 3 + 1] = vertices[i][1];
            positions[i * 3 + 2] = vertices[i][2];
        }

        // indices: faces are triples of vertex indices
        // Use Uint32Array to support meshes with > 65535 vertices
        const indices = new Uint32Array(faces.length * 3);
        for (let i = 0; i < faces.length; i++) {
            indices[i * 3 + 0] = faces[i][0];
            indices[i * 3 + 1] = faces[i][1];
            indices[i * 3 + 2] = faces[i][2];
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        // Center the model at origin and optionally place it on the ground plane
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);

        const center = new THREE.Vector3();
        box.getCenter(center);

        // Move geometry so its center is at origin
        geometry.translate(-center.x, -center.y, -center.z);

        // Recompute bounds after translation
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.8,
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Now place mesh so it sits on the ground (y = 0)
        const box2 = geometry.boundingBox;
        const minY = box2.min.y;

        // Move mesh upward so lowest point touches y=0
        mesh.position.y = -minY;

        // Remove old mesh (edges are children of the mesh)
        if (currentMesh) scene.remove(currentMesh);
        currentEdges = null;

        currentMesh = mesh;
        scene.add(mesh);

        // Build crisp edge lines
        const edgesGeom = new THREE.EdgesGeometry(geometry, 20); // threshold angle in degrees
        const edgesMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 });
        currentEdges = new THREE.LineSegments(edgesGeom, edgesMat);
        mesh.add(currentEdges);

        // Fit camera to mesh
        const sphere = geometry.boundingSphere;
        const r = sphere.radius;
        const c = sphere.center;

        // Resize helpers to match the model scale
        axesHelper.scale.setScalar(r);
        gridHelper.scale.setScalar(r);
        ground.scale.setScalar(r / 5);

        // Keep ground at y=0
        ground.position.y = 0;

        // After mesh.position.y has been set
        const target = new THREE.Vector3(0, mesh.position.y + r * 0.2, 0);
        controls.target.copy(target);

        camera.position.set(target.x, target.y + r * 0.5, target.z + r * 2.5);
        camera.near = r / 100;
        camera.far = r * 100;
        camera.updateProjectionMatrix();

        controls.minDistance = r * 0.2;
        controls.maxDistance = r * 10;
        controls.update();

        desiredTarget.copy(target);
        desiredCameraPos.copy(camera.position);
    }

    function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (highlightLineMaterial) {
            highlightLineMaterial.resolution.set(
                renderer.domElement.width,
                renderer.domElement.height
            );
        }
    }
    window.addEventListener("resize", onResize);

    function stopFocusAnimation() {
        animatingFocus = false;
        desiredTarget.copy(controls.target);
        desiredCameraPos.copy(camera.position);
    }

    function attachInputInterrupts() {
        const stop = () => stopFocusAnimation();
        renderer.domElement.addEventListener("pointerdown", stop);
        renderer.domElement.addEventListener("wheel", stop, { passive: true });
        window.addEventListener("keydown", stop);
    }
    attachInputInterrupts();

    function animate() {
        requestAnimationFrame(animate);
        if (animatingFocus) {
            camera.position.lerp(desiredCameraPos, 0.15);
            controls.target.lerp(desiredTarget, 0.18);

            const camDone = camera.position.distanceTo(desiredCameraPos) < 1e-3;
            const tgtDone = controls.target.distanceTo(desiredTarget) < 1e-3;
            if (camDone && tgtDone) {
                camera.position.copy(desiredCameraPos);
                controls.target.copy(desiredTarget);
                animatingFocus = false;
            }
        }
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    function clearHighlights() {
        if (highlightMesh) {
            if (highlightMesh.parent) {
                highlightMesh.parent.remove(highlightMesh);
            }
            highlightMesh.geometry.dispose();
            highlightMesh.material.dispose();
            highlightMesh = null;
        }
        if (highlightEdges) {
            if (highlightEdges.parent) {
                highlightEdges.parent.remove(highlightEdges);
            }
            highlightEdges.geometry.dispose();
            if (highlightLineMaterial) {
                highlightLineMaterial.dispose();
            }
            highlightEdges = null;
            highlightLineMaterial = null;
        }
    }

    function highlightFaces(faceIndices) {
        if (!currentMesh) return;

        const baseGeom = currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");
        const indexAttr = baseGeom.getIndex();

        // Build a NEW geometry containing ONLY the highlighted triangles
        const highlightGeometry = new THREE.BufferGeometry();

        // We'll create non-indexed triangles for simplicity:
        // each face contributes 3 vertices = 9 floats
        const outPositions = new Float32Array(faceIndices.length * 9);

        for (let i = 0; i < faceIndices.length; i++) {
            const faceIndex = faceIndices[i];

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
            opacity: 0.85,
            depthTest: false,      // draw on top
            side: THREE.DoubleSide // show even if normals are flipped
        });

        highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        highlightMesh.renderOrder = 999; // draw after the base mesh
        currentMesh.add(highlightMesh);
    }

    function faceCentroid(faceIndex) {
        const baseGeom = currentMesh.geometry;
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

    function edgeMidpoint(edgePair) {
        const baseGeom = currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");
        const [a, b] = edgePair;

        const va = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
        const vb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));

        // Midpoint of the two vertices
        const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
        return currentMesh.localToWorld(mid);
    }

    function moveCameraToPoint(point) {
        if (!currentMesh) return;
        const r = currentMesh.geometry.boundingSphere
            ? currentMesh.geometry.boundingSphere.radius
            : 1;

        desiredTarget.copy(point);

        // Offset upward and backwards by a fraction of mesh radius to keep framing comfortable
        const offset = new THREE.Vector3(0, r * 0.3, r * 1.2);
        desiredCameraPos.copy(point).add(offset);
    }

    function focusFace(faceIndex) {
        if (!currentMesh || faceIndex == null) return;
        clearHighlights();
        highlightFaces([faceIndex]);
        const centroid = faceCentroid(faceIndex);
        moveCameraToPoint(centroid);
    }

    function focusEdge(edgePair) {
        if (!currentMesh || !edgePair) return;
        clearHighlights();
        highlightEdgePairs([edgePair]);
        const mid = edgeMidpoint(edgePair);
        moveCameraToPoint(mid);
    }

    function highlightEdgePairs(edgePairs) {
        if (!currentMesh) return;

        const baseGeom = currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");

        // Flatten into [x1,y1,z1, x2,y2,z2, ...]
        const positions = new Float32Array(edgePairs.length * 6);

        for (let i = 0; i < edgePairs.length; i++) {
            const [a, b] = edgePairs[i];

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

        highlightLineMaterial = new LineMaterial({
            color: 0xff0000,
            linewidth: 4,        // pixels (this is what we want)
            transparent: true,
            opacity: 1.0,
            depthTest: false      // draw on top
        });

        // IMPORTANT: LineMaterial needs renderer resolution
        highlightLineMaterial.resolution.set(
            renderer.domElement.width,
            renderer.domElement.height
        );

        highlightEdges = new Line2(geom, highlightLineMaterial);
        highlightEdges.computeLineDistances();
        highlightEdges.renderOrder = 1000;

        currentMesh.add(highlightEdges);
    }

    function faceCentroid(faceIndex) {
        const baseGeom = currentMesh.geometry;
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

    function edgeMidpoint(edgePair) {
        const baseGeom = currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");
        const [a, b] = edgePair;

        const va = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
        const vb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));

        // Midpoint of the two vertices
        const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
        return currentMesh.localToWorld(mid);
    }

    function moveCameraToPoint(point) {
        if (!currentMesh) return;
        const r = currentMesh.geometry.boundingSphere
            ? currentMesh.geometry.boundingSphere.radius
            : 1;

        desiredTarget.copy(point);

        // Offset upward and backwards by a fraction of mesh radius to keep framing comfortable
        const offset = new THREE.Vector3(0, r * 0.3, r * 1.2);
        desiredCameraPos.copy(point).add(offset);
        animatingFocus = true;
    }

    function focusFace(faceIndex) {
        if (!currentMesh || faceIndex == null) return;
        clearHighlights();
        highlightFaces([faceIndex]);
        const centroid = faceCentroid(faceIndex);
        moveCameraToPoint(centroid);
        controls.update();
    }

    function focusEdge(edgePair) {
        if (!currentMesh || !edgePair) return;
        clearHighlights();
        highlightEdgePairs([edgePair]);
        const mid = edgeMidpoint(edgePair);
        moveCameraToPoint(mid);
        controls.update();
    }

    function showIssueAll(issue) {
        clearHighlights();
        if (!issue) return;

        if (issue.faces && issue.faces.length) {
            highlightFaces(issue.faces);
        }

        if (issue.edges && issue.edges.length) {
            highlightEdgePairs(issue.edges);
        }
    }

    function showIssueItem(issue, index) {
        if (!issue) {
            clearHighlights();
            return;
        }
        const faces = Array.isArray(issue.faces) ? issue.faces : [];
        const edges = Array.isArray(issue.edges) ? issue.edges : [];

        if (faces.length) {
            const safe = ((index % faces.length) + faces.length) % faces.length;
            focusFace(faces[safe]);
        } else if (edges.length) {
            const safe = ((index % edges.length) + edges.length) % edges.length;
            focusEdge(edges[safe]);
        } else {
            showIssueAll(issue);
        }
    }

    // keep backward compatibility
    function showIssue(issue) {
        showIssueAll(issue);
    }

    return {
        setMeshFromApi,
        showIssue,
        showIssueAll,
        showIssueItem,
        clearHighlights,
        focusFace,
        focusEdge
    };
}
