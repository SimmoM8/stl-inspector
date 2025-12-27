#!/usr/bin/env python3
import argparse
import json
import sys
from typing import Dict, List, Tuple

import numpy as np
import trimesh

def build_face_adjacency(mesh: trimesh.Trimesh) -> Tuple[Dict[int, List[int]], Dict[Tuple[int, int], Tuple[int, int]]]:
    """
    Build face adjacency information for a mesh.

    Args:
        mesh: The trimesh mesh object

    Returns:
        A tuple containing:
        - adjacency: dict mapping face index to list of neighboring face indices
        - shared_edges: dict mapping (faceA, faceB) pairs to the shared edge as (v1, v2)
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

def detect_inconsistent_normals(mesh: trimesh.Trimesh) -> List[int]:
    """
    Detect faces with inconsistent normal orientation relative to neighbors.

    Uses BFS to propagate orientation from face 0, flipping faces that are
    oriented opposite to their neighbors.

    Args:
        mesh: The trimesh mesh object

    Returns:
        List of face indices that had to be flipped for consistent orientation
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

def analyze_mesh(mesh: trimesh.Trimesh) -> Dict:
    """
    Analyze a mesh for common issues and return a comprehensive report.

    Performs the following checks:
    - Degenerate faces (near-zero area)
    - Non-manifold edges (shared by >2 faces)
    - Boundary edges (open surfaces)
    - Connected components (mesh islands)
    - Watertightness
    - Inconsistent face normals

    Args:
        mesh: The trimesh mesh object to analyze

    Returns:
        Dict containing 'summary' and 'issues' keys:
        - summary: Basic mesh statistics
        - issues: List of detected issues with details
    """
    issues = []

    # ---------- Basic stats ----------
    num_vertices = len(mesh.vertices)
    num_faces = len(mesh.faces)

    # ---------- Degenerate faces ----------
    # Check for faces with near-zero area (potential issues)
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
    # Analyze edge sharing to detect topology issues
    # trimesh precomputes edges and how many faces share them
    edges_unique = mesh.edges_unique

    # Compute how many faces share each unique edge using vectorized operations
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
    # Split mesh into connected components
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
    # Check if mesh is watertight (no holes)
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
    # Check face orientation consistency
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


def print_human_readable(report: Dict, path: str) -> None:
    """
    Print a human-readable summary of the mesh analysis report.

    Args:
        report: The analysis report dict from analyze_mesh
        path: Path to the analyzed file for display
    """
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


def main() -> None:
    """
    Main entry point for the command-line STL analysis tool.
    Parses arguments, loads mesh, analyzes it, and prints results.
    """
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