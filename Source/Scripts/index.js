import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { commands } from './commands.js';
import { controls } from './controls.js';

const SIZE = 1;
const REACH = 8.4;
const RADIUS = .44;
const ASSETS = [
    'black_lightest', 'black_light', 'black_normal', 'black_dark', 'black_darkest',
    'gray_lightest', 'gray_light', 'gray_normal', 'gray_dark', 'gray_darkest',
    'white_lightest', 'white_light', 'white_normal', 'white_dark', 'white_darkest',
    'tan_lightest', 'tan_light', 'tan_normal', 'tan_dark', 'tan_darkest',
    'chocolate_lightest', 'chocolate_light', 'chocolate_normal', 'chocolate_dark', 'chocolate_darkest',
    'brown_lightest', 'brown_light', 'brown_normal', 'brown_dark', 'brown_darkest',
    'red_lightest', 'red_light', 'red_normal', 'red_dark', 'red_darkest',
    'coral_lightest', 'coral_light', 'coral_normal', 'coral_dark', 'coral_darkest',
    'orange_lightest', 'orange_light', 'orange_normal', 'orange_dark', 'orange_darkest',
    'amber_lightest', 'amber_light', 'amber_normal', 'amber_dark', 'amber_darkest',
    'yellow_lightest', 'yellow_light', 'yellow_normal', 'yellow_dark', 'yellow_darkest',
    'olive_lightest', 'olive_light', 'olive_normal', 'olive_dark', 'olive_darkest',
    'lime_lightest', 'lime_light', 'lime_normal', 'lime_dark', 'lime_darkest',
    'green_lightest', 'green_light', 'green_normal', 'green_dark', 'green_darkest',
    'teal_lightest', 'teal_light', 'teal_normal', 'teal_dark', 'teal_darkest',
    'cyan_lightest', 'cyan_light', 'cyan_normal', 'cyan_dark', 'cyan_darkest',
    'slate_lightest', 'slate_light', 'slate_normal', 'slate_dark', 'slate_darkest',
    'blue_lightest', 'blue_light', 'blue_normal', 'blue_dark', 'blue_darkest',
    'indigo_lightest', 'indigo_light', 'indigo_normal', 'indigo_dark', 'indigo_darkest',
    'purple_lightest', 'purple_light', 'purple_normal', 'purple_dark', 'purple_darkest',
    'magenta_lightest', 'magenta_light', 'magenta_normal', 'magenta_dark', 'magenta_darkest',
    'pink_lightest', 'pink_light', 'pink_normal', 'pink_dark', 'pink_darkest',
    'rose_lightest', 'rose_light', 'rose_normal', 'rose_dark', 'rose_darkest',
    'glass', 'wood_planks', 'masonry_bricks', 'stone_bricks', 'cement'
];
const CLEAR = ['glass'];
const types = new Map(ASSETS.map((id, index) => [id, index]));

const view = document.querySelector('#view');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#030406');
scene.fog = new THREE.Fog('#030406', 200, 2000);
const camera = new THREE.PerspectiveCamera(75, 1, .1, 2000);
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
let world = new Map();
let parts = [];

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
    if (!batch) queue();
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

    if (!batch) { finish(part); queue(); }
}

function asset(name) {
    return `./Source/Assets/${name}.png`;
}

ASSETS.forEach(name => {
    const tex = new THREE.TextureLoader().load(asset(name));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    parts.push({ cells: [], limit: 0, mesh: null, material: new THREE.MeshLambertMaterial({ map: tex, alphaTest: CLEAR.includes(name) ? .5 : 0 }) });
});

const dir = new THREE.Vector3();
const marker = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE * 1.012, SIZE * 1.012, SIZE * 1.012)), new THREE.LineBasicMaterial({ color: 0xe5f3ff }));
marker.visible = false;
scene.add(marker);

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

const jobs = [];
let pending = 0;

function build() {
    pending = 0;
    const job = jobs[0];
    if (!job) return;
    const touched = new Set();

    for (let i = 0; i < 1000 && job.x <= job.high[0]; i++) {
        if (!job.test || job.test(job.x, job.y, job.z)) {
            const type = job.paint ? job.paint(job.x, job.y, job.z) : job.type;
            const item = world.get(key(job.x, job.y, job.z));
            if (type !== undefined && (!item || item.type !== type)) {
                if (item) { touched.add(parts[item.type]); remove(job.x, job.y, job.z, true); }
                if (type >= 0) { add(job.x, job.y, job.z, type, true); touched.add(parts[type]); }
            }
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
    if (jobs.length) pending = requestAnimationFrame(build);
    else queue();
}

function enqueue(low, high, options) {
    jobs.push({ low, high, ...options, x: low[0], y: low[1], z: low[2] });
    if (jobs.length === 1) build();
}

let database = null;
let ready = false;
let dirty = false;
let revision = 0;
let timer = 0;
let loading = false;

function snapshot() {
    const blocks = [];
    parts.forEach((part, type) => part.cells.forEach(cell => blocks.push([cell.x, cell.y, cell.z, ASSETS[type]])));
    return { version: 1, blocks };
}

function verify(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.blocks)) throw Error();
    const seen = new Set();
    for (const block of data.blocks) {
        if (!Array.isArray(block) || block.length !== 4 || !block.slice(0, 3).every(Number.isSafeInteger) || block[1] < 0 || typeof block[3] !== 'string') throw Error();
        if (!types.has(block[3])) throw Error('ERROR: World contains an outdated block');
        const id = key(block[0], block[1], block[2]);
        if (seen.has(id)) throw Error();
        seen.add(id);
    }
    return data.blocks;
}

function persist(data) {
    if (!ready || !database || (!data && (!dirty || loading || jobs.length))) return;
    try {
        const mark = revision;
        const store = database.transaction('world', 'readwrite');
        store.objectStore('world').put(data || snapshot(), 'current');
        store.oncomplete = () => { if (revision === mark) dirty = false; };
        return store;
    } catch { }
}

function queue() {
    dirty = true;
    revision++;
    clearTimeout(timer);
    if (ready && database && !loading && !jobs.length) timer = setTimeout(persist, 650);
}

async function replace(blocks, save = true) {
    loading = true;
    let next = [];
    try {
        const counts = Array(ASSETS.length).fill(0);
        blocks.forEach(block => counts[types.get(block[3])]++);
        next = parts.map(part => ({ cells: [], limit: 0, mesh: null, material: part.material }));
        const fresh = new Map();
        next.forEach((part, type) => {
            if (!counts[type]) return;
            part.limit = counts[type];
            part.mesh = new THREE.InstancedMesh(shape, part.material, part.limit);
            part.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        });
        for (let i = 0; i < blocks.length; i++) {
            const [x, y, z, id] = blocks[i];
            const type = types.get(id), part = next[type];
            fresh.set(key(x, y, z), { type, index: part.cells.length });
            part.cells.push({ x, y, z });
            stamp(part, part.cells.length - 1);
            if (i && i % 2000 === 0) await new Promise(resolve => requestAnimationFrame(resolve));
        }
        next.forEach(part => { if (part.mesh) finish(part); });
        jobs.length = 0;
        cancelAnimationFrame(pending);
        pending = 0;
        clearTimeout(timer);
        const previous = parts;
        parts = next;
        world = fresh;
        previous.forEach(part => { if (part.mesh) { scene.remove(part.mesh); part.mesh.dispose(); } });
        parts.forEach(part => { if (part.mesh) scene.add(part.mesh); });
        if (save) dirty = true;
    } catch (failure) {
        next.forEach(part => { if (part.mesh) part.mesh.dispose(); });
        throw failure;
    } finally {
        loading = false;
        if (dirty) queue();
    }
}

try {
    if (typeof indexedDB !== 'undefined') {
        const request = indexedDB.open('bound', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('world');
        request.onerror = () => { ready = true; };
        request.onsuccess = () => {
            database = request.result;
            try {
                const read = database.transaction('world').objectStore('world').get('current');
                read.onsuccess = async () => {
                    if (read.result && !dirty && !jobs.length && !loading) {
                        try { await replace(verify(read.result), false); } catch { }
                    }
                    ready = true;
                    if (dirty) queue();
                };
                read.onerror = () => { ready = true; if (dirty) queue(); };
            } catch { ready = true; if (dirty) queue(); }
        };
    }
} catch { ready = true; }

document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(timer); persist(); }
});

async function clear() {
    if (loading || jobs.some(job => job.paint) || (!ready && typeof indexedDB !== 'undefined')) return 'ERROR: World is busy';
    if (!database && typeof indexedDB !== 'undefined') return 'ERROR: Unable to reset world';
    loading = true;
    clearTimeout(timer);
    cancelAnimationFrame(pending);
    pending = 0;
    try {
        if (database) {
            const store = persist({ version: 1, blocks: [] });
            if (!store) throw Error();
            await new Promise((resolve, reject) => {
                store.addEventListener('complete', resolve);
                store.addEventListener('abort', reject);
            });
        }
        dirty = false;
        await replace([], false);
    } catch {
        loading = false;
        if (jobs.length) pending = requestAnimationFrame(build);
        if (dirty) queue();
        return 'ERROR: Unable to reset world';
    }
}

function resize() {
    const width = view.clientWidth, height = view.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
}

window.addEventListener('resize', resize);
resize();

const engine = {
    SIZE, RADIUS, ASSETS, types, canvas, camera, scene, renderer, marker, key, asset, add, remove, aim, enqueue, snapshot, verify, replace, clear,
    get world() { return world; },
    get parts() { return parts; },
    get loading() { return loading; },
    get busy() { return loading || jobs.length; },
    get painting() { return jobs.some(job => job.paint); }
};
const player = controls(engine);
player.bind(commands(engine, player));

let time = performance.now();
function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - time) / 1000, .05);
    time = now;
    player.update(dt, now);

    const hit = aim();
    marker.visible = !!hit;

    if (hit) {
        marker.position.set((hit.x + .5) * SIZE, (hit.y + .5) * SIZE, (hit.z + .5) * SIZE);
        marker.material.color.setHex(hit.block ? 0xeaf4ff : 0x91a7b9);
    }

    renderer.render(scene, camera);
    floor.position.set(player.body.x, 0, player.body.z);
}

requestAnimationFrame(frame);