/* A procedural architectural maquette, used only as the site's decoration. */
import * as THREE from "./assets/vendor/three/three.module.min.js";

// Every landmark uses one neutral material. Depth comes from geometry and light.
function builder() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.96 });
  const batches = new Map();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  function add(geometry, position, scale = [1, 1, 1], rotation = 0, quaternion) {
    if (!batches.has(geometry)) batches.set(geometry, []);
    dummy.position.set(...position);
    dummy.scale.set(...scale);
    dummy.rotation.set(0, rotation, 0);
    if (quaternion) dummy.quaternion.copy(quaternion);
    dummy.updateMatrix();
    batches.get(geometry).push(dummy.matrix.clone());
  }
  function box(x, y, z, width, height, depth, rotation = 0) {
    add(cube, [x, y, z], [width, height, depth], rotation);
  }
  function beam(a, b, thickness = 0.045) {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    add(cylinder, start.add(end).multiplyScalar(0.5).toArray(),
      [thickness / 2, direction.length(), thickness / 2], 0,
      new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
  }
  function finish() {
    for (const [geometry, matrices] of batches) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
  return { add, box, beam, finish };
}

function createSydneyOperaHouse() {
  const b = builder();
  function roundedPlatform(width, depth, radius, height) {
    const s = new THREE.Shape();
    const x = width / 2, z = depth / 2;
    s.moveTo(-x + radius, -z);
    s.lineTo(x - radius, -z); s.quadraticCurveTo(x, -z, x, -z + radius);
    s.lineTo(x, z - radius); s.quadraticCurveTo(x, z, x - radius, z);
    s.lineTo(-x + radius, z); s.quadraticCurveTo(-x, z, -x, z - radius);
    s.lineTo(-x, -z + radius); s.quadraticCurveTo(-x, -z, -x + radius, -z);
    const geometry = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false, curveSegments: 24 });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
  // The curved waterfront plinth surrounds two separately rounded auditoria.
  // Shell layout and lofting are informed by the project's Sydney reference and
  // custom_runs/sydney-opera-house-gpt6-astra/cv_analysis/outputs/02_Shells_generated_blender_code.py.
  b.add(roundedPlatform(6.25, 7.15, 1.65, 0.16), [0, -0.16, 0.05]);
  b.box(0, 0.25, -1.71, 5.24, 0.5, 2.4);
  b.box(0, 0.53, -1.71, 5.32, 0.065, 2.46);
  for (const [x, z, width] of [[-1.18, -0.1, 2.55], [1.2, 0.23, 2.42]]) {
    b.add(roundedPlatform(width, 5.45, width / 2 - 0.015, 0.5), [x, 0, z]);
    b.add(roundedPlatform(width + 0.07, 5.52, width / 2, 0.07), [x, 0.28, z]);
    // Inset glazing is expressed by a setback and narrow piers, in the same gray.
    b.add(roundedPlatform(width - 0.06, 5.38, width / 2 - 0.07, 0.1), [x, 0.5, z]);
    b.add(roundedPlatform(width + 0.1, 5.55, width / 2 + 0.02, 0.075), [x, 0.6, z]);
    for (let i = 0; i <= 28; i++) {
      const a = Math.PI * i / 28;
      b.box(x + width / 2 * Math.cos(a), 0.55,
        z + (5.45 - width) / 2 + width / 2 * Math.sin(a), 0.025, 0.11, 0.025);
    }
  }
  for (let i = 0; i < 12; i++) {
    b.box(0, (i + 1) * 0.024, -3.42 + i * 0.083, 3.65, (i + 1) * 0.048, 0.09);
  }

  function curve(points, radius) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    b.add(new THREE.TubeGeometry(path, points.length * 2, radius, 5, false), [0, 0, 0]);
  }
  // Broad vaulted shells, with a leaning pointed arch and a curved longitudinal
  // rise. The full-width low edge avoids the previous thin triangular-fin shape.
  function shell(cx, front, width, length, height, lean, rotation = 0) {
    const base = 0.69;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    function world(p) {
      return [cx + p[0] * cos + p[2] * sin, base + p[1], front - p[0] * sin + p[2] * cos];
    }
    const profile = t => Math.max(0, 1 - Math.abs(t)) ** 0.7;
    function surface(u, t) {
      const rise = Math.sin(u * Math.PI / 2) ** 1.12;
      return [t * width / 2 * (0.73 + 0.27 * u),
        height * rise * profile(t), -length + length * u + lean * rise * profile(t)];
    }
    const positions = [], indices = [], rows = 32, columns = 48;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
      positions.push(...surface(i / rows, -1 + 2 * j / columns));
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j, c = a + columns + 1;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const outer = new THREE.BufferGeometry();
    outer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    outer.setIndex(indices); outer.computeVertexNormals();
    const normals = outer.getAttribute('normal').array, count = positions.length / 3;
    const solid = [...positions], faces = [...indices];
    for (let i = 0; i < positions.length; i++) solid.push(positions[i] - normals[i] * 0.045);
    for (let i = 0; i < indices.length; i += 3) {
      faces.push(indices[i] + count, indices[i + 2] + count, indices[i + 1] + count);
    }
    function rim(a, c) { faces.push(a, a + count, c, c, a + count, c + count); }
    for (let j = 0; j < columns; j++) {
      rim(j + 1, j); rim(rows * (columns + 1) + j, rows * (columns + 1) + j + 1);
    }
    for (let i = 0; i < rows; i++) {
      rim(i * (columns + 1), (i + 1) * (columns + 1));
      rim((i + 1) * (columns + 1) + columns, i * (columns + 1) + columns);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(solid, 3));
    geometry.setIndex(faces); geometry.computeVertexNormals();
    b.add(geometry, [cx, base, front], [1, 1, 1], rotation);
    outer.dispose();
    curve(Array.from({ length: 65 }, (_, i) => world(surface(1, -1 + i / 32))), 0.029);
    // A recessed, inclined glazed mouth and a visible structural arch.
    function glass(t, v) {
      return [t * (width / 2 - 0.045), Math.max(0.015, height * profile(t) - 0.075) * v,
        lean * profile(t) * v + 0.11 * (1 - v) - 0.065];
    }
    const panels = [], panelIndices = [];
    for (let j = 0; j <= 48; j++) {
      const t = -1 + j / 24;
      panels.push(...glass(t, 0), ...glass(t, 1));
      if (j < 48) {
        const a = j * 2;
        panelIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const glazing = new THREE.BufferGeometry();
    glazing.setAttribute('position', new THREE.Float32BufferAttribute(panels, 3));
    glazing.setIndex(panelIndices); glazing.computeVertexNormals();
    b.add(glazing, [cx, base, front], [1, 1, 1], rotation);
    function glazingBar(t, v) {
      const point = glass(t, v);
      point[2] += 0.022;
      return world(point);
    }
    for (let j = 1; j < 16; j++) {
      const t = -1 + j / 8;
      b.beam(glazingBar(t, 0), glazingBar(t, 1), 0.019);
    }
    for (const v of [0.25, 0.5, 0.75]) {
      curve(Array.from({ length: 33 }, (_, i) => glazingBar(-1 + i / 16, v)), 0.006);
    }
    for (const t of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) {
      curve(Array.from({ length: 25 }, (_, i) => {
        const point = surface(i / 24, t); point[1] += 0.012; return world(point);
      }), 0.008);
    }
  }
  for (const [x, offset, width, height] of [[-1.18, -0.18, 2.17, 2.7], [1.2, 0.15, 1.94, 2.86]]) {
    shell(x, -0.85 + offset, width, 1.95, height, 0.53);
    shell(x, 0.34 + offset, width * 0.97, 1.84, height * 0.74, 0.48);
    shell(x, 1.56 + offset, width * 0.92, 1.72, height * 0.49, 0.42);
  }
  shell(-1.74, -2.24, 0.93, 1.1, 0.98, 0.23, Math.PI);
  shell(-0.52, -2.36, 0.91, 1.06, 1.11, 0.2, Math.PI);
  const group = b.finish();
  group.rotation.y = Math.PI / 2;
  return group;
}

// A cut stone with an uneven fracture, shared by the two archaeological sites.
function fracturedStone(variant = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5); shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.17 + variant * 0.06);
  shape.lineTo(0.28, 0.32); shape.lineTo(0.07, 0.25 + variant * 0.08);
  shape.lineTo(-0.12, 0.5); shape.lineTo(-0.34, 0.36); shape.lineTo(-0.5, 0.43);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geometry.translate(0, 0, -0.5);
  return geometry;
}

function createAcropolis() {
  const b = builder();
  // A low, faceted limestone outcrop rather than an urban presentation block.
  const outline = [[-3.8, -1.95], [-2.25, -2.82], [0.28, -2.95], [2.84, -2.15],
    [3.72, -0.55], [3.36, 1.77], [1.4, 2.75], [-1.23, 2.72], [-3.58, 1.25]];
  const rockVertices = [], rockIndices = [];
  for (const [scale, y] of [[1, -0.12], [0.99, 0.2], [0.92, 0.67], [0.83, 0.93]]) {
    outline.forEach(([x, z], i) => rockVertices.push(x * scale, y + (i % 3 - 1) * 0.045, z * scale));
  }
  const n = outline.length;
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < n; i++) {
    const a = layer * n + i, c = layer * n + (i + 1) % n;
    rockIndices.push(a, a + n, c, c, a + n, c + n);
  }
  rockVertices.push(0, 0.94, 0);
  for (let i = 0; i < n; i++) rockIndices.push(4 * n, 3 * n + (i + 1) % n, 3 * n + i);
  const rock = new THREE.BufferGeometry();
  rock.setAttribute('position', new THREE.Float32BufferAttribute(rockVertices, 3));
  rock.setIndex(rockIndices);
  const faceted = rock.toNonIndexed(); faceted.computeVertexNormals();
  b.add(faceted, [0, 0, 0]); rock.dispose();

  // Broken shafts retain their original radius, with exposed, uneven top faces.
  const shafts = new Map();
  function shaft(fraction) {
    if (shafts.has(fraction)) return shafts.get(fraction);
    const vertices = [], indices = [], rings = 8, sides = 80;
    for (let row = 0; row <= rings; row++) {
      const t = row / rings * fraction;
      const radius = 0.135 * (1 - 0.18 * t + 0.055 * Math.sin(Math.PI * t));
      for (let i = 0; i <= sides; i++) {
        const theta = i / sides * Math.PI * 2;
        const r = radius * (1 - 0.09 * (1 + Math.cos(theta * 20)) / 2);
        const chip = fraction < 1 && row === rings ? 0.023 * Math.sin(theta * 3 + 0.8) : 0;
        vertices.push(r * Math.cos(theta), t * 1.18 + chip, r * Math.sin(theta));
        if (row < rings && i < sides) {
          const a = row * (sides + 1) + i, c = a + sides + 1;
          indices.push(a, c, a + 1, a + 1, c, c + 1);
        }
      }
    }
    const center = vertices.length / 3;
    vertices.push(0, fraction * 1.18, 0);
    for (let i = 0; i < sides; i++) indices.push(center, rings * (sides + 1) + i + 1, rings * (sides + 1) + i);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    shafts.set(fraction, geometry);
    return geometry;
  }
  const capital = new THREE.CylinderGeometry(0.185, 0.112, 0.09, 24);
  const stones = [fracturedStone(), fracturedStone(1), fracturedStone(2)];
  function stone(x, bottom, z, width, height, depth, rotation = 0, variant = 0) {
    b.add(stones[variant % 3], [x, bottom + height / 2, z], [width, height, depth], rotation);
  }
  function column(x, y, z, scale = 1, fraction = 1) {
    if (!fraction) return;
    b.add(shaft(fraction), [x, y, z], [scale, scale, scale]);
    if (fraction === 1) {
      b.add(capital, [x, y + 1.205 * scale, z], [scale, scale, scale]);
      b.box(x, y + 1.285 * scale, z, 0.39 * scale, 0.07 * scale, 0.39 * scale);
    }
  }
  function temple(cx, cz, scale) {
    const ground = 0.96;
    const base = ground + 0.3 * scale;
    for (let i = 0; i < 3; i++) {
      b.box(cx, ground + (i + 0.5) * 0.1 * scale, cz,
        (3.65 - i * 0.22) * scale, 0.1 * scale, (5.56 - i * 0.22) * scale);
    }
    // Eight columns on each end, seventeen along each flank. Most survive;
    // missing central bays and exposed stumps make the roofless state legible.
    const ends = [[1, 1, 0.49, 0, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1]];
    const flanks = [
      [1, 1, 1, 1, 1, 0.49, 0, 0.24, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.7, 0.24, 1, 1, 1],
    ];
    const entablature = base + 1.32 * scale;
    function lintel(x, z, length, rotation, index) {
      // Perimeter beams only: the open cella must remain visible from above.
      const wx = cx + x * scale, wz = cz + z * scale;
      b.box(wx, entablature + 0.07 * scale, wz, length * scale, 0.14 * scale, 0.35 * scale, rotation);
      stone(wx, entablature + 0.14 * scale, wz, length * scale,
        (index % 5 === 2 ? 0.11 : 0.24) * scale, 0.33 * scale, rotation, index);
      if (index % 5 !== 2) {
        b.box(wx, entablature + 0.36 * scale, wz, (length + 0.025) * scale, 0.06 * scale, 0.43 * scale, rotation);
      }
    }
    for (let side = 0; side < 2; side++) {
      const sign = side * 2 - 1;
      for (let i = 0; i < 8; i++) {
        const x = -1.43 + i * 2.86 / 7;
        column(cx + x * scale, base, cz + sign * 2.36 * scale, scale, ends[side][i]);
        if (i < 7 && ends[side][i] === 1 && ends[side][i + 1] === 1) {
          lintel(x + 1.43 / 7, sign * 2.36, 2.86 / 7 + 0.07, 0, i);
        }
      }
      for (let i = 0; i < 17; i++) {
        const z = -2.36 + i * 4.72 / 16;
        if (i > 0 && i < 16) column(cx + sign * 1.43 * scale, base, cz + z * scale, scale, flanks[side][i]);
        if (i < 16 && flanks[side][i] === 1 && flanks[side][i + 1] === 1) {
          lintel(sign * 1.43, z + 2.36 / 16, 4.72 / 16 + 0.07, Math.PI / 2, i + side);
        }
      }
    }
    // Only the lower corners of the pediments remain; there is no roof surface.
    for (const [x, z, direction] of [[-1.21, 2.36, 1], [1.19, 2.36, -1], [1.2, -2.36, -1]]) {
      for (let i = 0; i < 3; i++) {
        stone(cx + (x + direction * i * 0.18) * scale, entablature + 0.42 * scale,
          cz + z * scale, 0.2 * scale, (0.09 + i * 0.07) * scale, 0.24 * scale, 0, i);
      }
    }
    // Fragmentary cella masonry, with an exposed floor and gaps through the walls.
    for (const side of [-1, 1]) {
      for (const [z, length, height] of [[-1.19, 0.61, 0.75], [-0.4, 0.56, 0.32], [0.75, 0.98, 0.42]]) {
        stone(cx + side * 0.79 * scale, base, cz + z * scale, length * scale,
          height * scale, 0.17 * scale, Math.PI / 2, side + 1);
      }
    }
    stone(cx, base, cz - 1.48 * scale, 1.55 * scale, 0.49 * scale, 0.18 * scale);
    for (const [i, x, z, w, d, angle] of [
      [0, -0.31, -0.83, 0.5, 0.28, 0.4], [1, 0.34, 0.68, 0.58, 0.3, -0.5],
      [2, -1.45, -0.44, 0.38, 0.28, 0.6], [3, 0.02, 1.61, 0.42, 0.24, 0.13],
      [4, 0.32, -0.15, 0.3, 0.2, -0.35], [5, -1.53, -0.73, 0.32, 0.24, 0.2],
    ]) {
      stone(cx + x * scale, base, cz + z * scale, w * scale, (0.14 + i % 3 * 0.035) * scale,
        d * scale, angle, i);
    }
    const fallen = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    b.add(shaft(0.49), [cx + 0.23, base + 0.13 * scale, cz + 0.42], [scale, scale, scale], 0, fallen);
  }
  temple(0.78, -0.05, 0.88);
  // Adjacent foundations and a few surviving columns, also open to the sky.
  b.box(-2.05, 1.055, 0.85, 1.25, 0.2, 1.82);
  for (const [x, z, fraction] of [[-2.48, 0.14, 1], [-2.05, 0.14, 1], [-1.62, 0.14, 0.49],
    [-2.48, 1.56, 0.24], [-2.05, 1.56, 0], [-1.62, 1.56, 1]]) column(x, 1.155, z, 0.54, fraction);
  stone(-2.26, 1.867, 0.14, 0.66, 0.16, 0.26);
  for (const [i, x, z] of [[0, -2.57, -0.57], [1, -1.81, -1.24], [2, -1.42, -1.67],
    [3, -2.55, 0.85], [4, -1.74, 0.78], [5, -0.52, 2.06], [6, -1.35, 1.99]]) {
    stone(x, 0.96, z, 0.27 + (i % 3) * 0.06, 0.16, 0.21, i * 0.7, i);
  }
  for (let i = 0; i < 8; i++) {
    b.box(-2.14, 0.16 + i * 0.055, 2.63 - i * 0.13, 1.12, 0.11, 0.17);
  }
  return b.finish();
}

function createEiffelTower() {
  const b = builder();
  b.box(0, -0.09, 0, 4.75, 0.18, 4.75);
  function square(y, radius, thickness) {
    const corners = [[-radius, y, -radius], [radius, y, -radius],
      [radius, y, radius], [-radius, y, radius]];
    corners.forEach((corner, index) => b.beam(corner, corners[(index + 1) % 4], thickness));
  }
  // Four independent splayed lattice legs, keeping the central arch space open.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(sx * 1.78, 0.1, sz * 1.78, 0.7, 0.2, 0.7);
    for (const [y0, y1, r0, r1, width0, width1, divisions] of [
      [0.2, 1.89, 1.78, 1.0, 0.48, 0.32, 6],
      [2.03, 3.22, 0.94, 0.61, 0.3, 0.2, 4],
    ]) {
      function corners(t) {
        const r = THREE.MathUtils.lerp(r0, r1, t);
        const w = THREE.MathUtils.lerp(width0, width1, t) / 2;
        const y = THREE.MathUtils.lerp(y0, y1, t);
        return [[sx * r - w, y, sz * r - w], [sx * r + w, y, sz * r - w],
          [sx * r + w, y, sz * r + w], [sx * r - w, y, sz * r + w]];
      }
      for (let i = 0; i < divisions; i++) {
        const bottom = corners(i / divisions), top = corners((i + 1) / divisions);
        for (let side = 0; side < 4; side++) {
          const next = (side + 1) % 4;
          b.beam(bottom[side], top[side], 0.066);
          b.beam(bottom[side], top[next], 0.027);
          b.beam(bottom[next], top[side], 0.027);
          b.beam(top[side], top[next], 0.035);
        }
      }
    }
  }
  // The four broad arches beneath the first observation deck.
  for (const side of [-1, 1]) {
    for (const axis of [0, 1]) {
      let previous;
      for (let i = 0; i <= 30; i++) {
        const x = -1.58 + 3.16 * i / 30;
        const y = 0.45 + 1.08 * Math.sqrt(Math.max(0, 1 - (x / 1.58) ** 2));
        const point = axis ? [side * 1.46, y, x] : [x, y, side * 1.46];
        if (previous) b.beam(previous, point, 0.1);
        previous = point;
      }
    }
  }
  for (const [y, width] of [[1.96, 2.75], [3.28, 1.82]]) {
    b.box(0, y, 0, width, 0.14, width);
    square(y + 0.19, width / 2 - 0.025, 0.035);
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12 - 0.5) * (width - 0.05);
      for (const side of [-1, 1]) {
        b.beam([t, y + 0.075, side * (width / 2 - 0.025)],
          [t, y + 0.19, side * (width / 2 - 0.025)], 0.018);
        b.beam([side * (width / 2 - 0.025), y + 0.075, t],
          [side * (width / 2 - 0.025), y + 0.19, t], 0.018);
      }
    }
  }
  // Continuous tapered upper lattice, capped by a small observation room and mast.
  function topCorners(t) {
    const radius = 0.56 * (1 - t) ** 1.45 + 0.105;
    const y = 3.36 + 3.61 * t;
    return [[-radius, y, -radius], [radius, y, -radius],
      [radius, y, radius], [-radius, y, radius]];
  }
  for (let i = 0; i < 17; i++) {
    const bottom = topCorners(i / 17), top = topCorners((i + 1) / 17);
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      b.beam(bottom[side], top[side], 0.045);
      b.beam(bottom[side], top[next], 0.022);
      b.beam(bottom[next], top[side], 0.022);
      b.beam(top[side], top[next], 0.03);
    }
  }
  b.box(0, 7.02, 0, 0.52, 0.1, 0.52);
  b.box(0, 7.16, 0, 0.33, 0.21, 0.33);
  b.add(new THREE.ConeGeometry(0.27, 0.25, 4), [0, 7.38, 0], [1, 1, 1], Math.PI / 4);
  b.beam([0, 7.42, 0], [0, 8.02, 0], 0.035);
  return b.finish();
}

function ellipseRing(rx, rz, wall, height, start = 0, end = Math.PI * 2) {
  const shape = new THREE.Shape();
  const segments = Math.ceil((end - start) * 24);
  for (let i = 0; i <= segments; i++) {
    const t = start + (end - start) * i / segments;
    const x = rx * Math.cos(t), z = -rz * Math.sin(t);
    if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  for (let i = segments; i >= 0; i--) {
    const t = start + (end - start) * i / segments;
    shape.lineTo((rx - wall) * Math.cos(t), -(rz - wall) * Math.sin(t));
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 72 });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createColosseum() {
  const b = builder();
  b.add(new THREE.CylinderGeometry(1, 1, 0.16, 96), [0, -0.08, 0], [3.86, 1, 3.0]);
  const stone = fracturedStone(), smallerStone = fracturedStone(2);
  const step = Math.PI * 2 / 40;
  // The arena floor is absent, exposing the hypogeum's axial passages and cells.
  for (const z of [-0.2, 0.2]) b.box(0, 0.14, z, 3.33, 0.28, 0.065);
  for (const z of [-0.72, 0.72]) {
    b.box(0, 0.12, z, 2.46, 0.24, 0.065);
    for (let i = -3; i <= 3; i++) {
      const x = i * 0.37;
      b.add(i % 2 ? stone : smallerStone, [x, 0.145, z / 1.55],
        [0.068, 0.29, 0.52]);
    }
  }
  // Surviving cavea fragments sit on solid stepped supports. Gaps expose the
  // radial circulation walls rather than an unbroken modern seating bowl.
  for (let tier = 0; tier < 6; tier++) {
    const radiusX = 1.94 + tier * 0.13, radiusZ = 1.18 + tier * 0.13;
    for (const [start, end] of [[-1.45, 1.6], [1.95, 2.53], [3.59, 4.17]]) {
      b.add(ellipseRing(radiusX, radiusZ, 0.16, 0.16 + tier * 0.105, start, end), [0, 0, 0]);
    }
  }
  for (const t of [1.76, 2.72, 2.96, 3.35, 3.48, 4.42]) {
    const start = [1.9 * Math.cos(t), 0.17, 1.14 * Math.sin(t)];
    const end = [2.65 * Math.cos(t), 0.17, 1.91 * Math.sin(t)];
    const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
    b.add(stone, [(start[0] + end[0]) / 2, 0.17, (start[2] + end[2]) / 2],
      [length, 0.34, 0.12], -Math.atan2(end[2] - start[2], end[0] - start[0]));
  }
  const width = 1, height = 0.78, radius = 0.29;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height); shape.lineTo(-width / 2, height); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-radius, 0.035); hole.lineTo(-radius, 0.41);
  hole.absarc(0, 0.41, radius, Math.PI, 0, true);
  hole.lineTo(radius, 0.035); hole.closePath();
  shape.holes.push(hole);
  const arch = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false, curveSegments: 12 });
  function distance(t, center) { return Math.abs(Math.atan2(Math.sin(t - center), Math.cos(t - center))); }
  function arcade(rx, rz, outer) {
    for (let i = 0; i < 40; i++) {
      const t = i * step;
      const signed = Math.atan2(Math.sin(t - 0.08), Math.cos(t - 0.08));
      const d = Math.abs(signed);
      // Retain one tall crescent of the outer facade. On the collapsed side,
      // the lower inner arcade remains visible through a broad outer-wall gap.
      const floors = outer ? (d < (signed < 0 ? 0.97 : 1.18) ? 3
        : d < (signed < 0 ? 1.14 : 1.42) ? 2 : d < (signed < 0 ? 1.35 : 1.67) ? 1 : 0)
        : (distance(t, Math.PI - 0.15) < 0.25 ? 0 : distance(t, Math.PI + 0.12) < 0.83 ? 1 : 2);
      const x = rx * Math.cos(t), z = rz * Math.sin(t);
      const tangent = Math.atan2(-rz * Math.cos(t), -rx * Math.sin(t));
      const bayWidth = step * Math.hypot(rx * Math.sin(t), rz * Math.cos(t)) + 0.035;
      for (let floor = 0; floor < floors; floor++) {
        const y = 0.12 + floor * 0.86;
        b.add(arch, [x, y, z], [bayWidth, 1, outer ? 1.15 : 0.9], tangent);
        b.box(x, y - 0.065, z, bayWidth + 0.025, 0.105, outer ? 0.36 : 0.26, tangent);
        // Engaged pilasters flank the openings, sharing the same stone material.
        const edge = t + step / 2;
        b.box(rx * Math.cos(edge), y + 0.36, rz * Math.sin(edge), 0.072, 0.71, 0.075,
          Math.atan2(-rz * Math.cos(edge), -rx * Math.sin(edge)));
      }
      if (floors) {
        const top = 0.04 + floors * 0.86;
        b.box(x, top, z, bayWidth + 0.025, 0.1, outer ? 0.37 : 0.28, tangent);
        if (outer && floors === 3) {
          const height = d < 0.8 ? 0.39 : 0.19 + (i % 3) * 0.06;
          b.add(stone, [x, top + height / 2 + 0.05, z], [bayWidth, height, 0.26], tangent);
          if (d < 0.75 && i !== 37) b.box(x, top + 0.44, z, bayWidth + 0.035, 0.08, 0.37, tangent);
          b.box(x, top + 0.24, z, 0.07, height, 0.3, tangent);
        } else if ((outer && d > 1) || (!outer && i % 4 === 0)) {
          b.add(smallerStone, [x, top + 0.12, z], [bayWidth * 0.73, 0.2, 0.21], tangent);
        }
      } else if (outer && (i % 5 === 0 || d < 1.8)) {
        b.add(stone, [x, 0.12, z], [bayWidth * 0.52, 0.24, 0.28], tangent);
      }
    }
  }
  arcade(2.92, 2.12, false);
  arcade(3.47, 2.62, true);
  // Exposed masonry at the two breaks, plus a few grounded fallen blocks.
  for (const sign of [-1, 1]) {
    const t = sign < 0 ? -0.98 : 1.36;
    for (let i = 0; i < 3; i++) {
      b.add(stone, [3.4 * Math.cos(t), 0.38 + i * 0.64, 2.56 * Math.sin(t)],
        [0.33, 0.76, 0.44], -t);
    }
    for (let i = 0; i < 5; i++) {
      const angle = sign * (1.47 + i * 0.14);
      b.add(i % 2 ? stone : smallerStone,
        [(3.17 + i % 2 * 0.24) * Math.cos(angle), 0.09,
          (2.35 + i % 2 * 0.16) * Math.sin(angle)],
        [0.24 + i % 3 * 0.035, 0.18, 0.19], i * 0.67);
    }
  }
  return b.finish();
}

function createLeaningTower() {
  const b = builder();
  const drum = new THREE.CylinderGeometry(1, 1, 1, 80);
  const column = new THREE.CylinderGeometry(0.038, 0.045, 1, 10);
  const capital = new THREE.CylinderGeometry(0.065, 0.042, 0.06, 10);
  const galleryArch = new THREE.TorusGeometry(0.118, 0.026, 6, 16, Math.PI);
  // A cylindrical core surrounded by six open galleries of columns and arches.
  b.add(drum, [0, 0.08, 0], [1.31, 0.16, 1.31]);
  b.add(drum, [0, 0.65, 0], [1.06, 1.04, 1.06]);
  const lowerArch = new THREE.TorusGeometry(0.2, 0.037, 6, 20, Math.PI);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    b.add(column, [1.075 * Math.cos(a), 0.49, 1.075 * Math.sin(a)], [1.5, 0.62, 1.5]);
    const middle = a + Math.PI / 16;
    b.add(lowerArch, [1.06 * Math.cos(middle), 0.8, 1.06 * Math.sin(middle)],
      [1, 1, 1], -middle - Math.PI / 2);
  }
  for (let floor = 0; floor < 6; floor++) {
    const y = 1.2 + floor * 0.64;
    b.add(drum, [0, y, 0], [1.27, 0.09, 1.27]);
    b.add(drum, [0, y + 0.33, 0], [0.89, 0.6, 0.89]);
    for (let i = 0; i < 30; i++) {
      const a = i / 30 * Math.PI * 2;
      b.add(column, [1.13 * Math.cos(a), y + 0.28, 1.13 * Math.sin(a)], [1, 0.45, 1]);
      b.add(capital, [1.13 * Math.cos(a), y + 0.5, 1.13 * Math.sin(a)]);
      const middle = a + Math.PI / 30;
      b.add(galleryArch, [1.13 * Math.cos(middle), y + 0.51, 1.13 * Math.sin(middle)],
        [1, 1, 1], -middle - Math.PI / 2);
    }
  }
  b.add(drum, [0, 5.06, 0], [1.3, 0.13, 1.3]);
  const bellArch = new THREE.TorusGeometry(0.23, 0.044, 6, 20, Math.PI);
  b.add(drum, [0, 5.42, 0], [0.53, 0.64, 0.53]);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    b.add(column, [0.68 * Math.cos(a), 5.38, 0.68 * Math.sin(a)], [1.8, 0.55, 1.8]);
    b.add(bellArch, [0.68 * Math.cos(a + Math.PI / 8), 5.65, 0.68 * Math.sin(a + Math.PI / 8)],
      [1, 1, 1], -a - Math.PI / 8 - Math.PI / 2);
  }
  b.add(drum, [0, 5.91, 0], [0.85, 0.1, 0.85]);
  b.add(drum, [0, 5.99, 0], [0.75, 0.06, 0.75]);
  const tower = b.finish();
  // Lean across the camera's view at the workflow chapter, rather than into it.
  tower.rotation.x = 0.07;
  tower.position.y = 0.13;
  const base = builder();
  base.add(drum, [0, -0.05, 0], [1.74, 0.1, 1.74]);
  base.add(drum, [0, 0.045, 0], [1.5, 0.09, 1.5]);
  const group = base.finish();
  group.add(tower);
  return group;
}

function createSkyscraper() {
  const b = builder();
  b.box(0, -0.1, 0, 4.5, 0.2, 4.05);
  let base = 0.03;
  for (const [width, depth, height, floors] of [
    [3.6, 2.9, 0.45, 1], [2.95, 2.35, 1.27, 4], [2.3, 1.85, 0.82, 3],
    [1.77, 1.45, 2.32, 8], [1.27, 1.1, 0.95, 3], [0.88, 0.78, 0.62, 2],
  ]) {
    b.box(0, base + height / 2, 0, width, height, depth);
    b.box(0, base + height, 0, width + 0.12, 0.085, depth + 0.12);
    const cols = Math.max(3, Math.round(width / 0.29));
    for (const side of [-1, 1]) {
      for (let col = 0; col <= cols; col++) {
        b.box((col / cols - 0.5) * width, base + height / 2,
          side * (depth / 2 + 0.055), 0.055, height, 0.1);
      }
      for (let col = 0; col <= Math.round(cols * 0.8); col++) {
        b.box(side * (width / 2 + 0.055), base + height / 2,
          (col / Math.round(cols * 0.8) - 0.5) * depth, 0.1, height, 0.055);
      }
      for (let floor = 1; floor < floors; floor++) {
        b.box(0, base + height * floor / floors, side * (depth / 2 + 0.018), width, 0.045, 0.035);
        b.box(side * (width / 2 + 0.018), base + height * floor / floors, 0, 0.035, 0.045, depth);
      }
    }
    base += height;
  }
  b.add(new THREE.CylinderGeometry(0.18, 0.33, 0.62, 8), [0, base + 0.32, 0]);
  b.add(new THREE.CylinderGeometry(0.075, 0.16, 0.48, 8), [0, base + 0.84, 0]);
  b.beam([0, base + 1.06, 0], [0, base + 1.83, 0], 0.043);
  return b.finish();
}

function createWestminster() {
  const b = builder();
  const spire = new THREE.ConeGeometry(1, 1, 4);
  spire.rotateY(Math.PI / 4);
  function pinnacle(x, y, z, width = 0.12, height = 0.5) {
    b.box(x, y + height * 0.23, z, width, height * 0.46, width);
    b.add(spire, [x, y + height * 0.7, z], [width * 0.85, height * 0.54, width * 0.85]);
  }
  // Model in face-local coordinates so the Gothic detailing survives rotation.
  function facePoint(u, y, out, angle, cx = 0, cz = 0) {
    return [cx + u * Math.cos(angle) + out * Math.sin(angle), y,
      cz + out * Math.cos(angle) - u * Math.sin(angle)];
  }
  function faceBox(u, y, out, width, height, depth, angle, cx = 0, cz = 0) {
    b.box(...facePoint(u, y, out, angle, cx, cz), width, height, depth, angle);
  }
  function lancet(u, bottom, out, width, height, angle, cx = 0, cz = 0) {
    const point = (x, y) => facePoint(x, y, out, angle, cx, cz);
    const spring = bottom + height * 0.73;
    b.beam(point(u - width / 2, bottom), point(u - width / 2, spring), 0.027);
    b.beam(point(u + width / 2, bottom), point(u + width / 2, spring), 0.027);
    b.beam(point(u - width / 2, spring), point(u, bottom + height), 0.032);
    b.beam(point(u + width / 2, spring), point(u, bottom + height), 0.032);
    b.beam(point(u, bottom), point(u, spring + height * 0.12), 0.017);
    faceBox(u, bottom, out, width + 0.06, 0.04, 0.07, angle, cx, cz);
  }
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.36, 0); roofShape.lineTo(0, 0.46);
  roofShape.lineTo(0.36, 0); roofShape.closePath();
  const longRoof = new THREE.ExtrudeGeometry(roofShape, { depth: 8.56, bevelEnabled: false });
  longRoof.rotateY(Math.PI / 2); longRoof.translate(-4.28, 0, 0);
  // A compact interpretation of the river facade, with two courtyards behind it.
  b.box(0, -0.09, 0, 10.35, 0.18, 3.95);
  b.box(0, 0.045, 1.53, 10.12, 0.09, 0.49);
  for (let i = 0; i < 42; i++) b.box(-5 + i * 10 / 41, 0.19, 1.75, 0.05, 0.22, 0.05);
  b.box(0, 0.29, 1.75, 10.08, 0.035, 0.045);
  for (const z of [-1.02, 0.95]) {
    b.box(0, 0.93, z, 8.55, 1.72, 0.59);
    for (const y of [0.18, 0.83, 1.61, 1.81]) b.box(0, y, z, 8.66, 0.075, 0.78);
    for (let i = 0; i <= 28; i++) {
      const x = -4.15 + i * 8.3 / 28;
      b.box(x, 1.07, z + Math.sign(z) * 0.36, 0.055, 1.51, 0.12);
      if (i % 2 === 0) pinnacle(x, 1.84, z + Math.sign(z) * 0.3, 0.07, 0.29);
      if (i < 28) for (const [bottom, height] of [[0.29, 0.46], [0.98, 0.57]]) {
        lancet(x + 0.15, bottom, Math.abs(z) + 0.32, 0.19, height,
          z > 0 ? 0 : Math.PI);
      }
    }
    // Steep slate roof expressed in the same gray as the stonework.
    b.add(longRoof, [0, 1.84, z]);
    for (const x of [-3.3, -2.25, -1.2, 1.2, 2.25, 3.3]) {
      b.box(x, 2.07, z, 0.2, 0.46, 0.2);
      b.box(x, 2.31, z, 0.25, 0.06, 0.25);
    }
  }
  for (const x of [-3.88, 0, 3.88]) {
    b.box(x, 0.91, -0.05, 0.64, 1.64, 1.82);
    b.box(x, 1.77, -0.05, 0.74, 0.09, 1.99);
  }
  // Central crossing tower and delicate octagonal spire.
  b.box(0, 1.39, 0.1, 1.0, 2.61, 0.88);
  b.box(0, 2.72, 0.1, 1.1, 0.09, 0.98);
  b.add(new THREE.CylinderGeometry(0.3, 0.37, 0.47, 8), [0, 3.0, 0.1]);
  b.add(new THREE.ConeGeometry(0.37, 1.12, 8), [0, 3.79, 0.1]);
  b.beam([0, 4.34, 0.1], [0, 4.57, 0.1], 0.021);
  for (const x of [-0.47, 0.47]) for (const z of [-0.33, 0.53]) pinnacle(x, 2.76, z, 0.1, 0.45);

  // Victoria Tower anchors the opposite end of the palace.
  const vx = 4.23, vz = -0.34;
  b.box(vx, 1.8, vz, 1.36, 3.6, 1.38);
  for (const y of [0.25, 1.12, 2.03, 2.8, 3.62]) b.box(vx, y, vz, 1.49, 0.1, 1.51);
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const u of [-0.46, 0, 0.46]) {
      faceBox(u, 1.81, 0.75, 0.055, 3.5, 0.08, angle, vx, vz);
      for (const bottom of [0.35, 1.28, 2.15, 2.96]) lancet(u, bottom, 0.708, 0.28, 0.57, angle, vx, vz);
    }
    for (let i = 0; i < 7; i++) faceBox(-0.6 + i * 0.2, 3.79, 0.71, 0.105, 0.22, 0.15, angle, vx, vz);
  }
  for (const x of [-0.65, 0.65]) for (const z of [-0.65, 0.65]) {
    b.add(new THREE.CylinderGeometry(0.13, 0.13, 3.86, 8), [vx + x, 1.93, vz + z]);
    pinnacle(vx + x, 3.86, vz + z, 0.15, 0.44);
  }
  b.beam([vx, 3.66, vz], [vx, 4.6, vz], 0.02);

  // Elizabeth Tower: four modeled clock faces, inset shaft and tiered spire.
  const tx = -4.23, tz = 0.46;
  b.box(tx, 1.65, tz, 0.99, 3.3, 0.99);
  for (const y of [0.17, 0.46, 1.12, 1.85, 2.55, 3.19]) b.box(tx, y, tz, 1.13, 0.065, 1.13);
  for (const x of [-0.51, 0.51]) for (const z of [-0.51, 0.51]) {
    b.box(tx + x, 1.74, tz + z, 0.14, 3.48, 0.14);
  }
  const dial = new THREE.CircleGeometry(0.48, 64);
  const bezel = new THREE.TorusGeometry(0.485, 0.027, 8, 64);
  const innerRing = new THREE.TorusGeometry(0.4, 0.01, 5, 64);
  b.box(tx, 3.76, tz, 1.19, 1.14, 1.19);
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    for (const u of [-0.3, 0, 0.3]) {
      for (const bottom of [0.58, 1.27, 1.98, 2.68]) lancet(u, bottom, 0.513, 0.17, 0.43, angle, tx, tz);
    }
    const center = facePoint(0, 3.78, 0.609, angle, tx, tz);
    b.add(dial, center, [1, 1, 1], angle);
    b.add(bezel, facePoint(0, 3.78, 0.626, angle, tx, tz), [1, 1, 1], angle);
    b.add(innerRing, facePoint(0, 3.78, 0.635, angle, tx, tz), [1, 1, 1], angle);
    const point = (r, a, out = 0.65) =>
      facePoint(r * Math.sin(a), 3.78 + r * Math.cos(a), out, angle, tx, tz);
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30;
      b.beam(point(i % 5 === 0 ? 0.415 : 0.455, a), point(0.476, a), i % 5 === 0 ? 0.023 : 0.009);
    }
    b.beam(point(0, 0, 0.687), point(0.25, -Math.PI / 3, 0.687), 0.043);
    b.beam(point(0, 0, 0.692), point(0.365, Math.PI / 3, 0.692), 0.029);
    for (const u of [-0.4, -0.2, 0, 0.2, 0.4]) lancet(u, 4.39, 0.477, 0.15, 0.34, angle, tx, tz);
  }
  for (const [y, width, height] of [[3.22, 1.29, 0.11], [4.32, 1.34, 0.12], [4.56, 0.88, 0.4], [4.81, 1.15, 0.09]]) {
    b.box(tx, y, tz, width, height, width);
  }
  b.add(spire, [tx, 5.31, tz], [0.81, 0.92, 0.81]);
  b.box(tx, 5.85, tz, 0.31, 0.18, 0.31);
  b.add(new THREE.ConeGeometry(0.23, 0.65, 8), [tx, 6.22, tz]);
  b.beam([tx, 6.53, tz], [tx, 6.76, tz], 0.024);
  for (const x of [-0.55, 0.55]) for (const z of [-0.55, 0.55]) {
    pinnacle(tx + x, 4.35, tz + z, 0.105, 0.65);
  }
  return b.finish();
}

function createTajMahal() {
  const b = builder();
  // A monochrome maquette: raised plinth, recessed iwans, bulbous dome,
  // four roof pavilions, and four slender freestanding minarets.
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 40);
  const tapered = new THREE.CylinderGeometry(0.78, 1, 1, 32);
  const profile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.7, 0, 0), new THREE.Vector3(.84, .17, 0),
    new THREE.Vector3(.99, .46, 0), new THREE.Vector3(.95, .72, 0),
    new THREE.Vector3(.75, 1.02, 0), new THREE.Vector3(.45, 1.28, 0),
    new THREE.Vector3(.16, 1.48, 0), new THREE.Vector3(.02, 1.57, 0),
  ]);
  const dome = new THREE.LatheGeometry(profile.getPoints(32).map(p => new THREE.Vector2(p.x, p.y)), 64);
  function drum(x, y, z, radius, height) { b.add(cylinder, [x, y, z], [radius, height, radius]); }
  function finial(x, y, z, scale = 1) {
    b.beam([x, y, z], [x, y + .38 * scale, z], .023 * scale);
    for (const [height, radius] of [[.05, .06], [.16, .037], [.27, .02]]) {
      drum(x, y + height * scale, z, radius * scale, .045 * scale);
    }
  }
  function pointedPanel(width, height) {
    const outer = new THREE.Shape();
    outer.moveTo(-width / 2, 0); outer.lineTo(width / 2, 0);
    outer.lineTo(width / 2, height); outer.lineTo(-width / 2, height); outer.closePath();
    const hole = new THREE.Path();
    const w = width * .37, spring = height * .58, top = height * .91;
    hole.moveTo(-w, .03); hole.lineTo(-w, spring);
    hole.bezierCurveTo(-w, height * .76, -w * .42, top - .06, 0, top);
    hole.bezierCurveTo(w * .42, top - .06, w, height * .76, w, spring);
    hole.lineTo(w, .03); hole.closePath();
    outer.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(outer, { depth: .11, bevelEnabled: false, curveSegments: 16 });
    return geometry;
  }
  function facePoint(u, y, out, angle) {
    return [u * Math.cos(angle) + out * Math.sin(angle), y,
      out * Math.cos(angle) - u * Math.sin(angle)];
  }
  function faceBox(u, y, out, width, height, depth, angle) {
    b.box(...facePoint(u, y, out, angle), width, height, depth, angle);
  }
  b.box(0, -.10, 0, 6.65, .20, 6.65);
  b.box(0, .09, 0, 6.38, .18, 6.38);
  b.box(0, .22, 0, 6.45, .08, 6.45);
  // The central volume has chamfered corners; projecting frames create deep shadows.
  const footprint = new THREE.Shape();
  [[-1.05, -1.5], [1.05, -1.5], [1.5, -1.05], [1.5, 1.05],
    [1.05, 1.5], [-1.05, 1.5], [-1.5, 1.05], [-1.5, -1.05]].forEach(([x, z], i) => {
    if (i) footprint.lineTo(x, z); else footprint.moveTo(x, z);
  });
  footprint.closePath();
  const body = new THREE.ExtrudeGeometry(footprint, { depth: 1.96, bevelEnabled: false });
  body.rotateX(-Math.PI / 2);
  b.add(body, [0, .26, 0]);
  b.box(0, .3, 0, 3.17, .09, 3.17);
  b.box(0, 2.22, 0, 3.16, .1, 3.16);
  const mainPortal = pointedPanel(1.35, 1.97), smallPortal = pointedPanel(.45, .76);
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    b.add(mainPortal, facePoint(0, .31, 1.72, angle), [1, 1, 1], angle);
    for (const side of [-1, 1]) {
      faceBox(side * .64, 1.3, 1.64, .08, 1.98, .28, angle);
      faceBox(side * .7, 1.35, 1.86, .028, 2.08, .035, angle);
      for (const bottom of [.41, 1.31]) {
        b.add(smallPortal, facePoint(side * 1.05, bottom, 1.57, angle), [1, 1, 1], angle);
      }
    }
    faceBox(0, 2.33, 1.78, 1.5, .10, .24, angle);
    for (let i = 0; i < 14; i++) faceBox(-1.42 + i * .218, 2.37, 1.53, .075, .19, .075, angle);
  }
  drum(0, 2.48, 0, .77, .46);
  drum(0, 2.7, 0, .82, .08);
  b.add(dome, [0, 2.72, 0]);
  finial(0, 4.28, 0);
  function pavilion(x, y, z, radius) {
    drum(x, y, z, radius * 1.12, .07);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const px = x + radius * .78 * Math.cos(angle), pz = z + radius * .78 * Math.sin(angle);
      b.beam([px, y, pz], [px, y + radius * 1.4, pz], radius * .10);
    }
    drum(x, y + radius * 1.42, z, radius * 1.07, .06);
    b.add(dome, [x, y + radius * 1.45, z], [radius, radius * .82, radius]);
    finial(x, y + radius * 2.74, z, radius);
  }
  for (const x of [-1.05, 1.05]) for (const z of [-1.05, 1.05]) pavilion(x, 2.35, z, .37);
  for (const x of [-2.75, 2.75]) for (const z of [-2.75, 2.75]) {
    drum(x, .39, z, .27, .25);
    b.add(tapered, [x, 1.94, z], [.19, 3.0, .19]);
    for (const y of [1.43, 2.43, 3.43]) {
      drum(x, y, z, .245, .07);
      drum(x, y + .055, z, .22, .04);
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8;
        b.beam([x + .213 * Math.cos(a), y + .05, z + .213 * Math.sin(a)],
          [x + .213 * Math.cos(a), y + .17, z + .213 * Math.sin(a)], .014);
      }
      drum(x, y + .17, z, .233, .025);
    }
    pavilion(x, 3.63, z, .225);
  }
  for (let i = 0; i < 5; i++) b.box(0, .025 + i * .045, 3.34 - i * .13, 1.42, .05, .21);
  return b.finish();
}

export function createArchitectures() {
  const raw = {
    opera: createSydneyOperaHouse(),
    eiffel: createEiffelTower(),
    pisa: createLeaningTower(),
    colosseum: createColosseum(),
    acropolis: createAcropolis(),
    skyscraper: createSkyscraper(),
    westminster: createWestminster(),
    taj: createTajMahal(),
  };
  return Object.fromEntries(Object.entries(raw).map(([name, object]) => {
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = Math.min(7.5 / Math.max(size.x, size.z), 7.25 / size.y);
    object.position.copy(center).multiplyScalar(-scale);
    object.scale.setScalar(scale);
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.userData.groundY = -size.y * scale / 2 - 0.08;
    pivot.add(object);
    return [name, pivot];
  }));
}
