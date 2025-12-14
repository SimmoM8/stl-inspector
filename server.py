from flask import Flask, request, jsonify
import trimesh
import io
from flask_cors import CORS

from analyze_stl import analyze_mesh

app = Flask(__name__)

CORS(app)

@app.route("/ping")
def ping():
    return "pong"

@app.route("/api/analyze", methods=["POST"])
def analyze():
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