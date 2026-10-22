import * as THREE from 'three';

export interface GridView {
  object: THREE.Group;
  dispose(): void;
}

/** Grey grid outline on the XZ plane, centered at the origin. */
export function createGrid(cols: number, rows: number): GridView {
  const inner: number[] = [];
  const x0 = -cols / 2;
  const z0 = -rows / 2;
  for (let x = 1; x < cols; x++) inner.push(x0 + x, 0, z0, x0 + x, 0, z0 + rows);
  for (let z = 1; z < rows; z++) inner.push(x0, 0, z0 + z, x0 + cols, 0, z0 + z);
  const border = [
    x0, 0, z0, x0 + cols, 0, z0,
    x0 + cols, 0, z0, x0 + cols, 0, z0 + rows,
    x0 + cols, 0, z0 + rows, x0, 0, z0 + rows,
    x0, 0, z0 + rows, x0, 0, z0,
  ];
  const mk = (pts: number[], color: number) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color });
    return new THREE.LineSegments(g, m);
  };
  const a = mk(inner, 0x2a2a2a);
  const b = mk(border, 0x555555);
  const object = new THREE.Group();
  object.add(a, b);
  return {
    object,
    dispose() {
      for (const l of [a, b]) {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
    },
  };
}
