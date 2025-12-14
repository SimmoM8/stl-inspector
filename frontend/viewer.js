import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

export function createViewer(container) {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.01,
        1000
    );
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Simple lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // We'll replace this whenever a new file is loaded
    let currentMesh = null;

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

        const material = new THREE.MeshStandardMaterial({
            metalness: 0.0,
            roughness: 0.8,
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Remove old mesh if present
        if (currentMesh) scene.remove(currentMesh);
        currentMesh = mesh;
        scene.add(mesh);

        // Fit camera to mesh
        const sphere = geometry.boundingSphere;
        const r = sphere.radius;
        const c = sphere.center;

        controls.target.copy(c);
        camera.position.set(c.x, c.y, c.z + r * 2.5);
        camera.near = r / 100;
        camera.far = r * 100;
        camera.updateProjectionMatrix();
        controls.update();
    }

    function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
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