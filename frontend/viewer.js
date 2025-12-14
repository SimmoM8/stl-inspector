import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

export function createViewer(container) {
    let currentMesh = null;
    let currentEdges = null;

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
    }

    function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    return { setMeshFromApi };
}