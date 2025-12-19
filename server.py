from flask import Flask, request, jsonify
import trimesh
import io
from flask_cors import CORS

from analyze_stl import analyze_mesh

app = Flask(__name__)

# Restrict CORS to known dev origins to avoid 403 during local testing.
# Allow common dev origins plus "null" when opening index.html from file://
ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "null",
]

CORS(
    app,
    resources={r"/api/*": {"origins": ALLOWED_ORIGINS}},
    methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.route("/ping")
def ping():
    return "pong"

@app.route("/api/analyze", methods=["POST", "OPTIONS"])
def analyze():
    if request.method == "OPTIONS":
        # Handle preflight requests quickly.
        return ("", 204)

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400
    
    try:
        file_bytes = file.read()
        file_stream = io.BytesIO(file_bytes)
        
        mesh = trimesh.load(file_stream, file_type="stl", force="mesh")

        if mesh.is_empty:
            return jsonify({"error": "Mesh is empty"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    analysis = analyze_mesh(mesh)

    response = {
        "mesh": {
            "vertices": mesh.vertices.tolist(),
            "faces": mesh.faces.tolist(),
        },
        "summary": {
            "numVertices": analysis["summary"]["num_vertices"],
            "numFaces": analysis["summary"]["num_faces"],
            "numComponents": analysis["summary"]["num_components"],
            "isWatertight": analysis["summary"]["is_watertight"],
        },
        "issues": analysis["issues"],
    }

    return jsonify(response)

if __name__ == "__main__":
    app.run(debug=True)
