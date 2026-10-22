import * as THREE from 'three';

/** Helpers for the flat 2D view: shapes lie in the XZ plane, shape (x, y) maps to world (x, -y). */

export function flatGeo(shape: THREE.Shape): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(shape, 20);
  g.rotateX(-Math.PI / 2);
  return g;
}

export function circleShape(cx: number, cy: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}

/** Shape from a polygon given as [x, y] pairs. */
export function polyShape(pts: readonly (readonly [number, number])[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  return s;
}

/** Unlit, depth-test-free material: flat shapes are layered via renderOrder instead of depth. */
export function flatMat(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}

export function flatMesh(geo: THREE.BufferGeometry, mat: THREE.Material, order: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = order;
  return m;
}
