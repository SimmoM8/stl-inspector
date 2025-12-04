#!/usr/bin/env python3
import argparse
import json
import sys

import numpy as np
import trimesh


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

    # NOTE: reversed / inconsistent normals detection will be added in a later step.
    # For now we just report the basic topology faults.

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
    parser.add_argument("path", help="Path to the STL file")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output full JSON report instead of human-readable text"
    )

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