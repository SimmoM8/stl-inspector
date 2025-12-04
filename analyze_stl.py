#!/usr/bin/env python3
import argparse
import json
import sys

import numpy as np
import trimesh

def build_face_adjacency(mesh):
    """
    Returns:
      adjacency: dict of face_index -> list of neighboring face indices
      shared_edges: dict of (faceA, faceB) -> (edge as tuple of vertex indices)
    """
    from collections import defaultdict
    
    # Map edge -> list of faces that touch it
    edge_to_faces = defaultdict(list)

    for face_idx, (a, b, c) in enumerate(mesh.faces):
        edges = [
            tuple(sorted((a, b))),
            tuple(sorted((b, c))),
            tuple(sorted((c, a))),
        ]
        for e in edges:
            edge_to_faces[e].append(face_idx)

    adjacency = defaultdict(list)
    shared_edges = {}

    for edge, faces in edge_to_faces.items():
        if len(faces) == 2:  # only exactly 2 faces share this edge
            f1, f2 = faces
            adjacency[f1].append(f2)
            adjacency[f2].append(f1)
            shared_edges[(f1, f2)] = edge
            shared_edges[(f2, f1)] = edge

    return adjacency, shared_edges

def detect_inconsistent_normals(mesh):
    """
    Returns a list of face indices whose orientation was inconsistent
    relative to neighbors.
    """
    adjacency, shared_edges = build_face_adjacency(mesh)

    num_faces = len(mesh.faces)

    # Track orientation decisions:
    visited = [False] * num_faces
    flipped = [False] * num_faces  # whether face had to be flipped

    from collections import deque
    queue = deque()

    # Start BFS at face 0
    queue.append(0)
    visited[0] = True

    # Work with a mutable copy of faces so we can flip them internally
    faces = mesh.faces.copy()

    def is_edge_reversed(face, edge):
        """Return True if this face uses the shared edge in reversed order."""
        (a, b, c) = faces[face]
        edges = [(a, b), (b, c), (c, a)]
        return not any(tuple(e) == edge for e in edges)

    while queue:
        current = queue.popleft()

        for nbr in adjacency[current]:
            if not visited[nbr]:
                edge = shared_edges[(current, nbr)]

                # Check if neighbor is reversed relative to current
                # i.e., it uses the edge backwards
                if is_edge_reversed(nbr, edge):
                    # Mark as flipped
                    flipped[nbr] = True

                    # Flip vertex order: (a,b,c) -> (a,c,b)
                    a, b, c = faces[nbr]
                    faces[nbr] = (a, c, b)

                visited[nbr] = True
                queue.append(nbr)

    # Output indices where we had to flip
    inconsistent_faces = [i for i, f in enumerate(flipped) if f]

    return inconsistent_faces

def analyze_mesh(mesh: trimesh.Trimesh) -> dict:
    """
    Analyze a mesh and return a dict with issue lists and summary info.
    This is our Step 1 prototype: holes, non-manifold edges, degenerate faces, islands.
    """
    issues = []

    # ---------- Basic stats ----------
    num_vertices = len(mesh.vertices)
    num_faces = len(mesh.faces)

    # ---------- Degenerate faces ----------
    areas = mesh.area_faces  # area of each triangle
    degenerate_idx = np.where(areas < 1e-10)[0].tolist()

    if degenerate_idx:
        issues.append({
            "type": "degenerate_faces",
            "severity": "warning",
            "count": len(degenerate_idx),
            "faces": degenerate_idx,
            "message": f"{len(degenerate_idx)} faces have near-zero area"
        })

    # ---------- Non-manifold & boundary edges ----------
    # trimesh precomputes edges and how many faces share them
    # edges_unique: array of [v0, v1]
    # edges_unique_counts: how many faces share that edge
    edges_unique = mesh.edges_unique

    # Compute how many faces share each unique edge
    # mesh.edges_unique_inverse maps each edge in mesh.edges to its unique-edge index.
    edge_counts = np.bincount(
        mesh.edges_unique_inverse,
        minlength=len(mesh.edges_unique)
    )

    non_manifold_mask = edge_counts > 2
    boundary_mask = edge_counts == 1

    non_manifold_edges = edges_unique[non_manifold_mask]
    boundary_edges = edges_unique[boundary_mask]

    if len(non_manifold_edges) > 0:
        issues.append({
            "type": "non_manifold_edges",
            "severity": "error",
            "count": int(len(non_manifold_edges)),
            "edges": non_manifold_edges.tolist(),
            "message": f"{len(non_manifold_edges)} edges are non-manifold (shared by > 2 faces)"
        })

    if len(boundary_edges) > 0:
        issues.append({
            "type": "boundary_edges",
            "severity": "warning",
            "count": int(len(boundary_edges)),
            "edges": boundary_edges.tolist(),
            "message": f"{len(boundary_edges)} boundary edges detected (open surfaces / potential holes)"
        })

    # ---------- Connected components (islands) ----------
    components = mesh.split(only_watertight=False)

    components_info = []
    for i, comp in enumerate(components):
        components_info.append({
            "index": i,
            "num_faces": int(len(comp.faces)),
            "num_vertices": int(len(comp.vertices)),
        })

    if len(components) > 1:
        issues.append({
            "type": "components",
            "severity": "info",
            "count": len(components),
            "message": f"Mesh has {len(components)} connected components",
            "components": components_info
        })

    # ---------- Watertightness ----------
    if not mesh.is_watertight:
        issues.append({
            "type": "watertight",
            "severity": "warning",
            "message": "Mesh is NOT watertight (has holes and/or non-manifold edges)"
        })
    else:
        issues.append({
            "type": "watertight",
            "severity": "info",
            "message": "Mesh is watertight"
        })

    # ---------- Inconsistent normals ----------
    try:
        inconsistent = detect_inconsistent_normals(mesh)
        if inconsistent:
            issues.append({
                "type": "inconsistent_normals",
                "severity": "warning",
                "count": len(inconsistent),
                "faces": inconsistent,
                "message": f"{len(inconsistent)} faces have inconsistent orientation relative to neighbors"
            })
    except Exception as e:
        issues.append({
            "type": "normal_check_failed",
            "severity": "info",
            "message": f"Normal consistency check failed: {e}"
        })

    result = {
        "summary": {
            "num_vertices": int(num_vertices),
            "num_faces": int(num_faces),
            "is_watertight": bool(mesh.is_watertight),
            "num_components": len(components),
        },
        "issues": issues,
    }

    return result


def print_human_readable(report: dict, path: str) -> None:
    summary = report["summary"]
    issues = report["issues"]

    print(f"STL Analysis: {path}")
    print("=" * (12 + len(path)))
    print(f"Vertices:       {summary['num_vertices']}")
    print(f"Faces:          {summary['num_faces']}")
    print(f"Watertight:     {summary['is_watertight']}")
    print(f"Components:     {summary['num_components']}")
    print()

    if not issues:
        print("No issues detected. (At least at our current level of checks.)")
        return

    print("Detected issues:")
    print("----------------")
    for issue in issues:
        t = issue["type"]
        sev = issue.get("severity", "info").upper()
        msg = issue.get("message", "")
        count = issue.get("count", None)
        if count is not None:
            print(f"[{sev}] {t} (count={count}) -> {msg}")
        else:
            print(f"[{sev}] {t} -> {msg}")


def main():
    parser = argparse.ArgumentParser(
        description="Analyze an STL file for common mesh issues."
    )
    parser.add_argument("path", help="Path to the STL file") # required positional argument string to specify the file path
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output full JSON report instead of human-readable text"
    ) # boolean flag to output JSON report -> true if --json is passed, false otherwise

    args = parser.parse_args()

    try:
        mesh = trimesh.load(args.path, force="mesh")
        if mesh.is_empty:
            print(f"ERROR: Loaded mesh is empty: {args.path}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to load STL '{args.path}': {e}", file=sys.stderr)
        sys.exit(1)

    report = analyze_mesh(mesh)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print_human_readable(report, args.path)


if __name__ == "__main__":
    main()