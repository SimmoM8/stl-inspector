import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";
import * as BufferGeometryUtils from "https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { SAOPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/SAOPass.js";
import { ShaderPass } from "https://unpkg.com/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "https://unpkg.com/three@0.160.0/examples/jsm/shaders/FXAAShader.js";
import { Line2 } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/Line2.js";
import { LineMaterial } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "https://unpkg.com/three@0.160.0/examples/jsm/lines/LineGeometry.js";

export function createViewer(container, initialViewSettings = {}) {
    let currentMesh = null;
    let currentEdges = null;
    let highlightMesh = null;
    let highlightEdges = null;
    let highlightLineMaterial = null;
    let sceneScale = 1;
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
    let sourceGeometry = null; // stable indexed geometry for highlighting/mapping
    const baseMeshColor = new THREE.Color(0xf2f4f7);
    const viewSettings = {
        edgeThreshold: 12,
        edgeMode: "feature",
        cadShading: true,
        wireframe: false,
        xray: false,
        grid: true,
        axes: true,
        exposure: 1.9,
        ssao: false,
    };

    Object.assign(viewSettings, initialViewSettings);

    const scene = new THREE.Scene();
    // Keep light neutral background for clarity
    scene.background = new THREE.Color(0xf2f2f2);
    const pivot = new THREE.Group();
    scene.add(pivot);

    // Helpers
    const axesHelper = new THREE.AxesHelper(1); // size will be updated after mesh loads
    scene.add(axesHelper);

    let gridHelper = new THREE.GridHelper(10, 20); // size will be updated after mesh loads
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    const groundGeom = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.25,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.receiveShadow = true;
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
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    const saoPass = new SAOPass(scene, camera, false, true);
    saoPass.params.output = 0;
    saoPass.params.saoIntensity = 0.05;
    saoPass.params.saoBias = 0.0;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 8;
    saoPass.params.saoBlurStdDev = 4;
    saoPass.params.saoBlurDepthCutoff = 0.01;
    saoPass.enabled = !!viewSettings.ssao;
    composer.addPass(saoPass);
    const fxaaPass = new ShaderPass(FXAAShader);
    composer.addPass(fxaaPass);

    // CAD-style lighting rig
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2f3540, 1.15);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(4, 6, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(-4, 3, -2);
    scene.add(rimLight);

    const headLight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(headLight);

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

        // Compute bounds for BOTH
        sourceGeom.computeBoundingBox();
        sourceGeom.computeBoundingSphere();
        displayGeom.computeBoundingBox();
        displayGeom.computeBoundingSphere();

        // vertexMap should map original vertex indices -> sourceGeom vertex indices
        // (these are the indices used by issue.edges)
        return { sourceGeom, displayGeom, faceMap: fMap, vertexMap: vMap };
    }

    function updateSaoKernelRadius() {
        const safeScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
        const kernelRadius = THREE.MathUtils.clamp(safeScale * 0.02, 2, 24);
        saoPass.params.saoKernelRadius = kernelRadius;
    }

    function getHighlightLineWidthPx() {
        const safeScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
        const width = 4 / Math.sqrt(safeScale);
        return THREE.MathUtils.clamp(width, 2, 6);
    }

    function updateSceneScale(geometry) {
        if (!geometry) {
            sceneScale = 1;
            updateSaoKernelRadius();
            return;
        }
        if (!geometry.boundingBox) {
            geometry.computeBoundingBox();
        }
        const box = geometry.boundingBox;
        if (!box) {
            sceneScale = 1;
            updateSaoKernelRadius();
            return;
        }
        const size = new THREE.Vector3();
        box.getSize(size);
        const diag = size.length();
        sceneScale = diag > 0 ? diag : 1;
        updateSaoKernelRadius();
    }

    function updateCameraClipping() {
        const safeScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
        const near = Math.max(0.01, safeScale / 1000);
        const far = Math.max(near * 1000, safeScale * 10);
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
    }

    function updateShadowCameraBounds() {
        if (!keyLight.shadow || !keyLight.shadow.camera) return;
        const safeScale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
        const extent = safeScale * 0.6;
        const near = Math.max(0.01, safeScale / 1000);
        const far = Math.max(near * 1000, safeScale * 10);
        const cam = keyLight.shadow.camera;
        cam.left = -extent;
        cam.right = extent;
        cam.top = extent;
        cam.bottom = -extent;
        cam.near = near;
        cam.far = far;
        cam.updateProjectionMatrix();
    }

    function getHelperRadius(geometry) {
        const fallback = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale * 0.5 : 1;
        if (!geometry || !geometry.boundingSphere) return fallback;
        const r = geometry.boundingSphere.radius;
        return Number.isFinite(r) && r > 0 ? r : fallback;
    }

    function rebuildGridHelper(size, divisions) {
        if (gridHelper) {
            scene.remove(gridHelper);
            gridHelper.geometry.dispose();
            if (Array.isArray(gridHelper.material)) {
                gridHelper.material.forEach((mat) => mat.dispose());
            } else {
                gridHelper.material.dispose();
            }
        }
        gridHelper = new THREE.GridHelper(size, divisions);
        gridHelper.position.y = 0;
        gridHelper.visible = viewSettings.grid;
        scene.add(gridHelper);
    }

    function updateHelperScales(geometry) {
        const r = getHelperRadius(geometry);
        axesHelper.scale.setScalar(r);
        const gridSize = Math.max(2, r * 4);
        const divisions = Math.round(THREE.MathUtils.clamp(gridSize / (r * 0.1), 20, 100));
        rebuildGridHelper(gridSize, divisions);
        ground.scale.setScalar(gridSize / 10);
        ground.position.y = 0;
    }

    function fitHelpersAndCamera(geometry, mesh) {
        const r = getHelperRadius(geometry);
        updateHelperScales(geometry);

        const target = new THREE.Vector3(0, mesh.position.y + r * 0.2, 0);
        controls.target.copy(target);
        camera.position.set(target.x, target.y + r * 0.5, target.z + r * 2.5);
        updateCameraClipping();

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
        clearHighlights();
        lastFaceList = faceList && faceList.length ? faceList.slice() : null;
        const { sourceGeom, displayGeom, faceMap, vertexMap: vMap } = buildGeometryFromFaceList(faceList);

        // Replace sourceGeometry (stable) used for highlight mapping
        if (sourceGeometry) {
            sourceGeometry.dispose();
            sourceGeometry = null;
        }
        sourceGeometry = sourceGeom;

        const box = displayGeom.boundingBox;
        const minY = box.min.y;

        if (!currentMesh) {
            const material = new THREE.MeshStandardMaterial({
                metalness: 0.0,
                roughness: 0.8,
                color: baseMeshColor,
            });
            currentMesh = new THREE.Mesh(displayGeom, material);
            currentMesh.castShadow = true;
            currentMesh.receiveShadow = true;
            pivot.add(currentMesh);
        } else {
            clearHighlights();
            currentMesh.geometry.dispose();
            currentMesh.geometry = displayGeom;
            currentMesh.material.color.copy(baseMeshColor);
            currentMesh.castShadow = true;
            currentMesh.receiveShadow = true;
        }

        currentMesh.position.y = -minY;
        rebuildEdges();
        applyMaterialSettings();
        updateSceneScale(displayGeom);
        updateShadowCameraBounds();

        faceIndexMap = faceList && faceList.length ? faceMap : null;
        vertexIndexMap = faceList && faceList.length ? vMap : null;

        if (refitCamera) {
            fitHelpersAndCamera(displayGeom, currentMesh);
        } else {
            // keep helpers roughly scaled to new geometry without moving camera/target
            updateHelperScales(displayGeom);
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
        ground.visible = viewSettings.grid;
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
        headLight.position.copy(camera.position);
        headLight.target.position.copy(controls.target);
        headLight.target.updateMatrixWorld();
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
        if (!sourceGeometry) return;
        const mappedFaces = mapFaceList(faceIndices);
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
        if (!sourceGeometry) return;
        const mappedEdges = mapEdgePairs(edgePairs);
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

        highlightLineMaterial = new LineMaterial({
            color: 0xff0000,
            linewidth: getHighlightLineWidthPx(),        // pixels (this is what we want)
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

    function edgeMidpoint(edgePair) {
        const baseGeom = sourceGeometry || currentMesh.geometry;
        const posAttr = baseGeom.getAttribute("position");
        const [a, b] = edgePair;

        const va = new THREE.Vector3(posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a));
        const vb = new THREE.Vector3(posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b));

        // Midpoint of the two vertices
        const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);
        return currentMesh.localToWorld(mid);
    }

    function moveCameraToPoint(point, preferredRadius) {
        if (!currentMesh) return;
        // Preserve current camera offset; only shorten for tighter framing, never lengthen.
        const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
        const hasOffset = offset.lengthSq() >= 1e-6;
        const r = preferredRadius || (currentMesh.geometry.boundingSphere
            ? currentMesh.geometry.boundingSphere.radius
            : 1);
        const desiredDistance = r * 1.1; // tighter framing

        if (!hasOffset) {
            offset.set(0, r * 0.3, desiredDistance);
        } else if (preferredRadius) {
            const currentDist = offset.length();
            // Only tighten if current distance is larger; never zoom out
            const targetDist = Math.min(currentDist, desiredDistance);
            offset.setLength(targetDist);
        }
        desiredTarget.copy(point);
        desiredCameraPos.copy(point).add(offset);
        animatingFocus = true;
    }

    function centerView() {
        if (!currentMesh) return;
        if (!currentMesh.geometry.boundingBox) currentMesh.geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        currentMesh.geometry.boundingBox.getCenter(center);
        const minY = currentMesh.geometry.boundingBox.min.y;

        // Place mesh center at origin in X/Z and rest it on the grid in Y (no cumulative drift)
        currentMesh.position.set(-center.x, -minY, -center.z);

        fitHelpersAndCamera(currentMesh.geometry, currentMesh);
        updateCameraClipping();
    }

    function frameView() {
        if (!currentMesh || !currentMesh.geometry.boundingSphere) return;
        const sphere = currentMesh.geometry.boundingSphere;
        const r = sphere.radius;
        const center = sphere.center.clone().add(currentMesh.position);

        const offset = new THREE.Vector3(0, r * 0.2, r * 2.5);
        desiredTarget.copy(center);
        desiredCameraPos.copy(center).add(offset);
        updateCameraClipping();
        animatingFocus = true;
    }

    function focusFace(faceIndex) {
        if (!currentMesh || faceIndex == null) return;
        clearHighlights();
        highlightFaces([faceIndex]);
        const mapped = mapFaceList([faceIndex]);
        if (!mapped.length) return;
        const centroid = faceCentroid(mapped[0]);
        const r = currentMesh.geometry.boundingSphere ? currentMesh.geometry.boundingSphere.radius : 1;
        moveCameraToPoint(centroid, r * 0.6);
        controls.update();
    }

    function focusEdge(edgePair) {
        if (!currentMesh || !edgePair) return;
        clearHighlights();
        highlightEdgePairs([edgePair]);
        const mapped = mapEdgePairs([edgePair]);
        if (!mapped.length) return;
        const mid = edgeMidpoint(mapped[0]);
        const r = currentMesh.geometry.boundingSphere ? currentMesh.geometry.boundingSphere.radius : 1;
        moveCameraToPoint(mid, r * 0.6);
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
        clearHighlights();
        Object.assign(viewSettings, partial);
        renderer.toneMappingExposure = Math.max(0.2, viewSettings.exposure);

        if (partial.ssao !== undefined) {
            saoPass.enabled = !!viewSettings.ssao;
        }

        if (partial.cadShading !== undefined) {
            applyGeometry(lastFaceList, false);
        } else {
            rebuildEdges();
            applyMaterialSettings();
        }
    }

    function getViewSettings() {
        return { ...viewSettings };
    }

    function getSceneScale() {
        return sceneScale;
    }

    function resetViewSettings() {
        setViewSettings({
            edgeThreshold: 12,
            edgeMode: "feature",
            cadShading: true,
            wireframe: false,
            xray: false,
            grid: true,
            axes: true,
            exposure: 1.9,
            ssao: false,
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
        getSceneScale,
        resetViewSettings,
        centerView,
        frameView
    };
}
