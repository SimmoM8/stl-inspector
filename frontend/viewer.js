import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
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
    let basePositions = null; // Float32Array
    let baseIndices = null;   // Uint32Array
    let baseFaceCount = 0;
    let baseVertexCount = 0;
    let faceIndexMap = null;   // Map original face index -> current face index (or null for identity)
    let vertexIndexMap = null; // Map original vertex index -> current vertex index (or null for identity)
    let lastFaceList = null; // remember last applied component for settings refresh
    const baseMeshColor = new THREE.Color(0xffffff);
    const viewSettings = {
        edgeThreshold: 12,
        edgeMode: "feature", // feature | all | off
        smoothShading: true,
        wireframe: false,
        xray: false,
        grid: true,
        axes: true,
        exposure: 1.6,
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf9fafc);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = viewSettings.exposure;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const fxaaPass = new ShaderPass(FXAAShader);
    composer.addPass(fxaaPass);

    // Simple lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.1);
    dir1.position.set(5, 5, 5);
    scene.add(dir1);

    // Second light to reduce harsh shadows
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
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
    // Keep light neutral background for clarity
    scene.background = new THREE.Color(0xf2f2f2);

    // Optional: constrain zoom distances once mesh is loaded
    // we’ll set min/max in setMeshFromApi after we know the bounding sphere

    function setIdentityMaps() {
        faceIndexMap = null;
        vertexIndexMap = null;
    }

    function buildGeometryFromFaceList(faceList) {
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

        let geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(new THREE.BufferAttribute(remappedIndices, 1));

        let newVertexMap = vMap;
        if (viewSettings.smoothShading) {
            // Weld close vertices before computing normals to smooth shading seams
            geometry = BufferGeometryUtils.mergeVertices(geometry, 1e-5);
            // Remap original vertices to merged indices
            const idx = geometry.getIndex();
            newVertexMap = new Map();
            for (let faceCounter = 0; faceCounter < useFaces.length; faceCounter++) {
                const faceIndex = useFaces[faceCounter];
                const i0 = baseIndices[faceIndex * 3 + 0];
                const i1 = baseIndices[faceIndex * 3 + 1];
                const i2 = baseIndices[faceIndex * 3 + 2];
                const base = faceCounter * 3;
                newVertexMap.set(i0, idx.getX(base + 0));
                newVertexMap.set(i1, idx.getX(base + 1));
                newVertexMap.set(i2, idx.getX(base + 2));
            }
        }

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return { geometry, faceMap: fMap, vertexMap: newVertexMap };
    }

    function fitHelpersAndCamera(geometry, mesh) {
        const sphere = geometry.boundingSphere;
        const r = sphere.radius;

        axesHelper.scale.setScalar(r);
        gridHelper.scale.setScalar(r);
        ground.scale.setScalar(r / 5);
        ground.position.y = 0;

        const target = new THREE.Vector3(0, mesh.position.y + r * 0.2, 0);
        controls.target.copy(target);
        camera.position.set(target.x, target.y + r * 0.5, target.z + r * 2.5);
        camera.near = Math.max(r / 100, 0.001);
        camera.far = r * 100;
        camera.updateProjectionMatrix();

        controls.minDistance = r * 0.2;
        controls.maxDistance = r * 10;
        controls.update();

        desiredTarget.copy(target);
        desiredCameraPos.copy(camera.position);
    }

    function rebuildEdges() {
        if (!currentMesh) return;
        if (currentEdges) {
            currentMesh.remove(currentEdges);
            currentEdges.geometry.dispose();
            currentEdges.material.dispose();
            currentEdges = null;
        }

        if (viewSettings.edgeMode === "off") return;

        let threshold = viewSettings.edgeThreshold;
        if (viewSettings.edgeMode === "all") threshold = 0.1;

        const edgesGeom = new THREE.EdgesGeometry(currentMesh.geometry, threshold);
        const edgesMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, color: 0x111827 });
        currentEdges = new THREE.LineSegments(edgesGeom, edgesMat);
        currentEdges.renderOrder = 10;
        currentMesh.add(currentEdges);
    }

    function applyGeometry(faceList, refitCamera = true) {
        if (!basePositions || !baseIndices) return;
        lastFaceList = faceList && faceList.length ? faceList.slice() : null;
        const { geometry, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceList);
        const box = geometry.boundingBox;
        const minY = box.min.y;

        if (!currentMesh) {
            const material = new THREE.MeshStandardMaterial({
                metalness: 0.0,
                roughness: 0.8,
                color: baseMeshColor,
            });
            currentMesh = new THREE.Mesh(geometry, material);
            scene.add(currentMesh);
        } else {
            clearHighlights();
            currentMesh.geometry.dispose();
            currentMesh.geometry = geometry;
            currentMesh.material.color.copy(baseMeshColor);
        }

        currentMesh.position.y = -minY;
        rebuildEdges();
        applyMaterialSettings();

        faceIndexMap = faceList && faceList.length ? faceMap : null;
        vertexIndexMap = faceList && faceList.length ? vMap : null;

        if (refitCamera) {
            fitHelpersAndCamera(geometry, currentMesh);
        } else {
            // keep helpers roughly scaled to new geometry without moving camera/target
            const sphere = geometry.boundingSphere;
            const r = sphere.radius;
            axesHelper.scale.setScalar(r);
            gridHelper.scale.setScalar(r);
            ground.scale.setScalar(r / 5);
            ground.position.y = 0;
        }
    }

    function applyMaterialSettings() {
        if (!currentMesh) return;
        currentMesh.material.wireframe = viewSettings.wireframe;
        currentMesh.material.transparent = viewSettings.xray;
        currentMesh.material.opacity = viewSettings.xray ? 0.4 : 1.0;
        currentMesh.material.needsUpdate = true;

        gridHelper.visible = viewSettings.grid;
        axesHelper.visible = viewSettings.axes;
    }

    function setMeshFromApi(meshData) {
        const { vertices, faces } = meshData;

        // positions: flat float array length = vertices.length * 3
        basePositions = new Float32Array(vertices.length * 3);
        for (let i = 0; i < vertices.length; i++) {
            basePositions[i * 3 + 0] = vertices[i][0];
            basePositions[i * 3 + 1] = vertices[i][1];
            basePositions[i * 3 + 2] = vertices[i][2];
        }

        // indices: faces are triples of vertex indices
        baseIndices = new Uint32Array(faces.length * 3);
        for (let i = 0; i < faces.length; i++) {
            baseIndices[i * 3 + 0] = faces[i][0];
            baseIndices[i * 3 + 1] = faces[i][1];
            baseIndices[i * 3 + 2] = faces[i][2];
        }
        baseFaceCount = faces.length;
        baseVertexCount = vertices.length;

        applyGeometry(null, true);
        setIdentityMaps();
    }

    function showComponent(faceIndices) {
        if (!basePositions || !baseIndices) return;
        applyGeometry(faceIndices, true);
    }

    function showAllComponents() {
        if (!basePositions || !baseIndices) return;
        applyGeometry(null, true);
        setIdentityMaps();
    }

    function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        composer.setSize(w, h);
        const ratio = renderer.getPixelRatio();
        fxaaPass.material.uniforms["resolution"].value.set(1 / (w * ratio), 1 / (h * ratio));
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
    onResize();

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
        renderer.toneMappingExposure = Math.max(0.2, viewSettings.exposure);
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
        composer.render();
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

    function mapFaceList(faceIndices) {
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

    function mapEdgePairs(edgePairs) {
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

    function highlightFaces(faceIndices) {
        if (!currentMesh) return;
        const mappedFaces = mapFaceList(faceIndices);
        if (!mappedFaces.length) return;

        const baseGeom = currentMesh.geometry;
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
            opacity: 0.85,
            depthTest: false,      // draw on top
            side: THREE.DoubleSide // show even if normals are flipped
        });

        highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
        highlightMesh.renderOrder = 999; // draw after the base mesh
        currentMesh.add(highlightMesh);
    }

    function highlightEdgePairs(edgePairs) {
        if (!currentMesh) return;
        const mappedEdges = mapEdgePairs(edgePairs);
        if (!mappedEdges.length) return;

        const baseGeom = currentMesh.geometry;
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
        // Preserve current camera offset so zoom/orientation stay the same;
        // only pan the view to the target point.
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        if (offset.lengthSq() < 1e-6) {
            const r = currentMesh.geometry.boundingSphere
                ? currentMesh.geometry.boundingSphere.radius
                : 1;
            offset.set(0, r * 0.3, r * 1.2);
        }
        desiredTarget.copy(point);
        desiredCameraPos.copy(point).add(offset);
        animatingFocus = true;
    }

    function focusFace(faceIndex) {
        if (!currentMesh || faceIndex == null) return;
        clearHighlights();
        highlightFaces([faceIndex]);
        const mapped = mapFaceList([faceIndex]);
        if (!mapped.length) return;
        const centroid = faceCentroid(mapped[0]);
        moveCameraToPoint(centroid);
        controls.update();
    }

    function focusEdge(edgePair) {
        if (!currentMesh || !edgePair) return;
        clearHighlights();
        highlightEdgePairs([edgePair]);
        const mapped = mapEdgePairs([edgePair]);
        if (!mapped.length) return;
        const mid = edgeMidpoint(mapped[0]);
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

    function setViewSettings(partial) {
        Object.assign(viewSettings, partial);
        renderer.toneMappingExposure = Math.max(0.2, viewSettings.exposure);

        if (partial.smoothShading !== undefined) {
            applyGeometry(lastFaceList, false);
        } else {
            rebuildEdges();
            applyMaterialSettings();
        }
    }

    function getViewSettings() {
        return { ...viewSettings };
    }

    function resetViewSettings() {
        setViewSettings({
            edgeThreshold: 20,
            edgeMode: "feature",
            smoothShading: true,
            wireframe: false,
            xray: false,
            grid: true,
            axes: true,
            exposure: 1.0,
        });
    }

    return {
        setMeshFromApi,
        showIssue,
        showIssueAll,
        showIssueItem,
        showComponent,
        showAllComponents,
        clearHighlights,
        focusFace,
        focusEdge,
        setViewSettings,
        getViewSettings,
        resetViewSettings
    };
}
