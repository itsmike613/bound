import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const SIZE = 1;
const REACH = 8.4;
const EYE = 1.76;
const HEIGHT = 2;
const RADIUS = .44;
const names = 'white grey black brown red orange yellow green blue purple pink'.split(' ');
const shades = 'lightest light normal dark darkest'.split(' ');
const files = names.flatMap(name => shades.map(shade => `${name}-${shade}`));
files.push('transparent-outline');

const view = document.querySelector('#view');
const palette = document.querySelector('#palette');
const label = document.querySelector('#label');
const number = document.querySelector('#number');
const coords = document.querySelector('#coords');
const command = document.querySelector('#command');
const input = document.querySelector('#input');
const error = document.querySelector('#error');
const mode = document.querySelector('#mode');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#030406');
scene.fog = new THREE.Fog('#030406', 48, 300);
const camera = new THREE.PerspectiveCamera(75, 1, .1, 700);
camera.rotation.order = 'YXZ';
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
view.prepend(renderer.domElement);
const canvas = renderer.domElement;
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, .62);
sun.position.set(-8, 16, 12);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshBasicMaterial({ color: 0x16191e }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const shape = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
const dummy = new THREE.Object3D();
const world = new Map();
const parts = [];
const tiles = [];
let chosen = 0;

function key(x, y, z) {
    return `${x},${y},${z}`;
}

function stamp(part, index) {
    const cell = part.cells[index];
    dummy.position.set((cell.x + .5) * SIZE, (cell.y + .5) * SIZE, (cell.z + .5) * SIZE);
    dummy.updateMatrix();
    part.mesh.setMatrixAt(index, dummy.matrix);
}

function finish(part) {
    part.mesh.count = part.cells.length;
    part.mesh.instanceMatrix.needsUpdate = true;
    part.mesh.computeBoundingSphere();
}

function grow(part) {
    const mesh = new THREE.InstancedMesh(shape, part.material, Math.max(8, part.limit * 2));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (part.mesh) { scene.remove(part.mesh); part.mesh.dispose(); }
    part.mesh = mesh;
    part.limit = mesh.instanceMatrix.count;
    scene.add(mesh);
    part.cells.forEach((cell, index) => stamp(part, index));
    finish(part);
}

function add(x, y, z, type, batch = false) {
    const id = key(x, y, z);
    if (world.has(id)) return;
    const part = parts[type];
    world.set(id, { type, index: part.cells.length });
    part.cells.push({ x, y, z });
    if (part.cells.length > part.limit) grow(part);
    else { stamp(part, part.cells.length - 1); if (!batch) finish(part); }
}

function remove(x, y, z, batch = false) {
    const id = key(x, y, z);
    const item = world.get(id);
    if (!item) return;
    const part = parts[item.type];
    const last = part.cells.pop();
    world.delete(id);

    if (item.index < part.cells.length) {
        part.cells[item.index] = last;
        world.get(key(last.x, last.y, last.z)).index = item.index;
        stamp(part, item.index);
    }

    if (!batch) finish(part);
}

function select(index) {
    chosen = (index + files.length) % files.length;
    tiles.forEach((tile, index) => tile.classList.toggle('selected', index === chosen));
    label.textContent = files[chosen].replace('-', ' / ').toUpperCase();
    number.textContent = `${String(chosen + 1).padStart(2, '0')} / 56`;
}

files.forEach((name, index) => {
    const path = `./Source/Assets/${name}.png`;
    const tex = new THREE.TextureLoader().load(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    parts.push({ cells: [], limit: 0, mesh: null, material: new THREE.MeshLambertMaterial({ map: tex, alphaTest: index === 55 ? .5 : 0 }) });
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.type = 'button';
    tile.title = name.replace('-', ' / ');
    tile.style.setProperty('--img', `url("${new URL(path, location.href)}")`);
    tile.innerHTML = '<span class="cube"><span class="face front"></span><span class="face right"></span><span class="face top"></span></span>';
    tile.addEventListener('click', () => select(index));
    palette.append(tile);
    tiles.push(tile);
});

select(0);

const body = new THREE.Vector3(SIZE / 2, 0, SIZE / 2);
const speed = new THREE.Vector3();
const keys = new Set();
const dir = new THREE.Vector3();
const marker = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE * 1.012, SIZE * 1.012, SIZE * 1.012)), new THREE.LineBasicMaterial({ color: 0xe5f3ff }));
marker.visible = false;
scene.add(marker);
let yaw = 0;
let pitch = -.47;
let flying = false;
let grounded = true;
let tap = 0;
let step = 0;
const buttons = new Set();
const clicks = [0, 0, 0];

function blocked(x, y, z) {
    if (y < 0) return true;

    const min = [Math.floor((x - RADIUS) / SIZE), Math.floor(y / SIZE), Math.floor((z - RADIUS) / SIZE)];
    const max = [Math.floor((x + RADIUS - .0002) / SIZE), Math.floor((y + HEIGHT - .0002) / SIZE), Math.floor((z + RADIUS - .0002) / SIZE)];

    for (let a = min[0]; a <= max[0]; a++)for (let b = min[1]; b <= max[1]; b++)for (let c = min[2]; c <= max[2]; c++) {
        if (world.has(key(a, b, c))) return true;
    }

    return false;
}

function aim() {
    camera.getWorldDirection(dir);
    const pos = camera.position;
    let x = Math.floor(pos.x / SIZE), y = Math.floor(pos.y / SIZE), z = Math.floor(pos.z / SIZE);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const dx = sx ? SIZE / Math.abs(dir.x) : Infinity;
    const dy = sy ? SIZE / Math.abs(dir.y) : Infinity;
    const dz = sz ? SIZE / Math.abs(dir.z) : Infinity;
    let tx = sx ? ((x + (sx > 0 ? 1 : 0)) * SIZE - pos.x) / dir.x : Infinity;
    let ty = sy ? ((y + (sy > 0 ? 1 : 0)) * SIZE - pos.y) / dir.y : Infinity;
    let tz = sz ? ((z + (sz > 0 ? 1 : 0)) * SIZE - pos.z) / dir.z : Infinity;
    let t = 0, ax = 0, ay = 0, az = 0;

    for (let i = 0; i < 96 && t <= REACH; i++) {
        if (y >= 0 && world.has(key(x, y, z))) return { x, y, z, ax, ay, az, block: true };
        if (tx <= ty && tx <= tz) { x += sx; t = tx; tx += dx; ax = -sx; ay = 0; az = 0; }
        else if (ty <= tz) { y += sy; t = ty; ty += dy; ax = 0; ay = -sy; az = 0; }
        else { z += sz; t = tz; tz += dz; ax = 0; ay = 0; az = -sz; }
    }

    if (dir.y < 0) {
        const dist = -pos.y / dir.y;
        if (dist <= REACH) return { x: Math.floor((pos.x + dir.x * dist) / SIZE), y: 0, z: Math.floor((pos.z + dir.z * dist) / SIZE), block: false };
    }

    return null;
}
function safe(x, y, z) {
    if (y < 0 || world.has(key(x, y, z))) return false;
    return !(body.x + RADIUS > x * SIZE && body.x - RADIUS < (x + 1) * SIZE && body.y < (y + 1) * SIZE && body.y + HEIGHT > y * SIZE && body.z + RADIUS > z * SIZE && body.z - RADIUS < (z + 1) * SIZE);
}

function place() {
    const hit = aim();
    if (!hit) return;
    const x = hit.x + (hit.ax || 0), y = hit.y + (hit.ay || 0), z = hit.z + (hit.az || 0);
    if (safe(x, y, z)) add(x, y, z, chosen);
}

function destroy() {
    const hit = aim();
    if (hit && hit.block) remove(hit.x, hit.y, hit.z);
}

const jobs = [];

function build() {
    const job = jobs[0];
    const touched = new Set();

    for (let i = 0; i < 1000 && job.x <= job.high[0]; i++) {
        const item = world.get(key(job.x, job.y, job.z));
        if (!item || item.type !== job.type) {
            if (item) { touched.add(parts[item.type]); remove(job.x, job.y, job.z, true); }
            if (job.type >= 0) { add(job.x, job.y, job.z, job.type, true); touched.add(parts[job.type]); }
        }
        if (++job.z > job.high[2]) {
            job.z = job.low[2];
            if (++job.y > job.high[1]) {
                job.y = job.low[1];
                job.x++;
            }
        }
    }

    touched.forEach(finish);
    if (job.x > job.high[0]) jobs.shift();
    if (jobs.length) requestAnimationFrame(build);
}

function fill(args) {
    if (args.length < 6) return 'ERROR: Expected 6 coordinates';
    if (args.slice(0, 6).some(value => !/^-?\d+$/.test(value))) return 'ERROR: Invalid coordinates';
    const point = args.slice(0, 6).map(Number);
    if (point.some(value => !Number.isSafeInteger(value))) return 'ERROR: Invalid coordinates';
    const id = Number(args[6]);
    if (!/^\d+$/.test(args[6]) || id > 56) return 'ERROR: Invalid block ID (0–56)';
    if (args.length > 8 || (args.length === 8 && args[7] !== 'true')) return 'ERROR: Invalid arguments';
    const low = [Math.min(point[0], point[3]), Math.min(point[1], point[4]), Math.min(point[2], point[5])];
    const high = [Math.max(point[0], point[3]), Math.max(point[1], point[4]), Math.max(point[2], point[5])];
    const total = (high[0] - low[0] + 1) * (high[1] - low[1] + 1) * (high[2] - low[2] + 1);
    if (!Number.isSafeInteger(total)) return 'ERROR: Invalid coordinates';
    if (total > 500 && args[7] !== 'true') return 'ERROR: Maximum 500 blocks exceeded';
    jobs.push({ low, high, type: id - 1, x: low[0], y: low[1], z: low[2] });
    if (jobs.length === 1) build();
}

const commands = new Map([['fill', fill]]);

function close() {
    command.hidden = true;
    error.hidden = true;
    input.blur();
}

command.addEventListener('submit', event => {
    event.preventDefault();
    const words = input.value.trim().replace(/^\/\s*/, '').split(/\s+/);
    const run = commands.get(words.shift().toLowerCase());
    const message = run ? run(words) : 'ERROR: Unknown command';
    if (message) { error.textContent = message; error.hidden = false; }
    else close();
});

input.addEventListener('input', () => { error.hidden = true; });

canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('mousedown', event => {
    event.preventDefault();
    if (!command.hidden) return;
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
    if (event.button === 0 || event.button === 2) {
        buttons.add(event.button);
        if (event.button === 0) destroy(); else place();
        clicks[event.button] = performance.now() + 300; // Spam Build MS
    }
});

document.addEventListener('mouseup', event => buttons.delete(event.button));
document.addEventListener('pointerlockchange', () => buttons.clear());
document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas) return;
    yaw -= event.movementX * .0025;
    pitch = Math.max(-1.54, Math.min(1.54, pitch - event.movementY * .0025));
    camera.rotation.set(pitch, yaw, 0);
});

document.addEventListener('keydown', event => {
    if (!command.hidden) {
        if (event.code === 'Escape') { event.preventDefault(); close(); }
        if (event.code === 'Enter') { event.preventDefault(); command.requestSubmit(); }
        return;
    }
    if (event.key === '/' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        keys.clear();
        buttons.clear();
        command.hidden = false;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        return;
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE'].includes(event.code)) event.preventDefault();
    const held = keys.has(event.code);
    keys.add(event.code);
    if (event.repeat || held) return;
    if (event.code === 'KeyQ') select(chosen - 1);
    if (event.code === 'KeyE') select(chosen + 1);
    if (event.code === 'Space') {
        const now = performance.now();
        if (tap && now - tap < 300) {
            flying = !flying; speed.y = 0; tap = 0;
            mode.textContent = flying ? 'FLY' : 'WALK';
        } else {
            if (!flying && grounded) {
                speed.y = 13; grounded = false;
            }
            tap = now;
        }
    }
});

document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { keys.clear(); buttons.clear(); });
window.addEventListener('wheel', event => {
    if (!command.hidden) return;
    event.preventDefault();
    if (event.deltaY) select(chosen + Math.sign(event.deltaY));
}, { passive: false });

function resize() {
    const width = view.clientWidth, height = view.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

window.addEventListener('resize', resize);
resize();
camera.rotation.set(pitch, yaw, 0);

function move(x, z) {
    if (!blocked(x, body.y, z)) { body.x = x; body.z = z; return true; }
    if (!flying && grounded && speed.y <= 0 && !blocked(body.x, body.y + SIZE, body.z) && !blocked(x, body.y + SIZE, z)) {
        body.y += SIZE; step -= SIZE; body.x = x; body.z = z; return true;
    }

    return false;
}

let time = performance.now();
function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - time) / 1000, .05);
    time = now;
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const right = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    const length = Math.hypot(forward, right) || 1;
    const pace = flying ? 11.6 : 9;
    const blend = 1 - Math.exp(-13 * dt);
    speed.x += ((right * Math.cos(yaw) - forward * Math.sin(yaw)) * pace / length - speed.x) * blend;
    speed.z += ((-right * Math.sin(yaw) - forward * Math.cos(yaw)) * pace / length - speed.z) * blend;
    if (flying) {
        const lift = Number(keys.has('Space')) - Number(keys.has('ShiftLeft') || keys.has('ShiftRight'));
        speed.y += (lift * pace - speed.y) * blend;
    } else speed.y -= 36 * dt; // Hello World :P
    const x = body.x + speed.x * dt, z = body.z + speed.z * dt, y = body.y + speed.y * dt;
    if (!move(x, body.z)) speed.x = 0;
    if (!move(body.x, z)) speed.z = 0;
    if (!blocked(body.x, y, body.z)) { body.y = y; grounded = false; }
    else {
        if (speed.y < 0) grounded = true;
        speed.y = 0;
    }
    if (!flying && grounded && keys.has('Space')) {
        speed.y = 13;
        grounded = false;
    }

    const position = `X: ${Math.floor(body.x / SIZE)} Y: ${Math.floor(body.y / SIZE)} Z: ${Math.floor(body.z / SIZE)}`;
    if (coords.textContent !== position) coords.textContent = position;
    step *= Math.exp(-15 * dt);
    camera.position.set(body.x, body.y + EYE + step, body.z);

    if (document.pointerLockElement === canvas) {
        if (buttons.has(0) && now >= clicks[0]) { destroy(); clicks[0] = now + 120; }
        if (buttons.has(2) && now >= clicks[2]) { place(); clicks[2] = now + 120; }
    }

    const hit = aim();
    marker.visible = !!hit;

    if (hit) {
        marker.position.set((hit.x + .5) * SIZE, (hit.y + .5) * SIZE, (hit.z + .5) * SIZE);
        marker.material.color.setHex(hit.block ? 0xeaf4ff : 0x91a7b9);
    }

    renderer.render(scene, camera);
}

requestAnimationFrame(frame);