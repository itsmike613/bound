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
const PAGE = 8192;
const touched = new Set();
let world = new Map();
let parts = [];

function key(x, y, z) {
    return `${x},${y},${z}`;
}

function stamp(page, index) {
    const cell = page.cells[index], matrix = page.mesh.instanceMatrix.array, offset = index * 16;
    matrix[offset + 12] = (cell.x + .5) * SIZE;
    matrix[offset + 13] = (cell.y + .5) * SIZE;
    matrix[offset + 14] = (cell.z + .5) * SIZE;
    page.first = Math.min(page.first, index);
    page.last = Math.max(page.last, index);
    const box = page.box;
    const x = matrix[offset + 12], y = matrix[offset + 13], z = matrix[offset + 14], half = SIZE / 2;
    box.min.x = Math.min(box.min.x, x - half);
    box.min.y = Math.min(box.min.y, y - half);
    box.min.z = Math.min(box.min.z, z - half);
    box.max.x = Math.max(box.max.x, x + half);
    box.max.y = Math.max(box.max.y, y + half);
    box.max.z = Math.max(box.max.z, z + half);
}

function finish(page) {
    if (!page.mesh) return;
    const count = page.cells.length, limit = page.mesh.instanceMatrix.count;
    if (limit > 8 && count * 4 <= limit) {
        try { grow(page, true, Math.max(8, 2 ** Math.ceil(Math.log2(count * 2)))); }
        catch { }
        page.box.makeEmpty();
        for (let i = 0; i < count; i++) stamp(page, i);
    }
    const mesh = page.mesh;
    mesh.count = count;
    if (page.last >= page.first) {
        const matrix = mesh.instanceMatrix;
        for (const range of matrix.updateRanges) {
            page.first = Math.min(page.first, range.start / 16);
            page.last = Math.max(page.last, (range.start + range.count) / 16 - 1);
        }
        matrix.clearUpdateRanges();
        matrix.addUpdateRange(page.first * 16, (page.last - page.first + 1) * 16);
        mesh.instanceMatrix.needsUpdate = true;
        page.first = Infinity;
        page.last = -1;
    }
    page.box.getBoundingSphere(mesh.boundingSphere);
}

function grow(page, live, limit) {
    const previous = page.mesh;
    const mesh = new THREE.InstancedMesh(shape, page.part.material, limit || Math.min(PAGE, Math.max(8, previous ? previous.instanceMatrix.count * 2 : 0)));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.boundingSphere = new THREE.Sphere();
    mesh.count = page.cells.length;
    if (previous) {
        mesh.instanceMatrix.array.set(previous.instanceMatrix.array.subarray(0, page.cells.length * 16));
        scene.remove(previous);
        previous.dispose();
    }
    page.mesh = mesh;
    page.first = Infinity;
    page.last = -1;
    if (live) scene.add(mesh);
}

function insert(map, part, x, y, z, type, id, live) {
    let page = part.open.values().next().value;
    if (!page) {
        page = { part, cells: [], mesh: null, box: new THREE.Box3(), first: Infinity, last: -1 };
        grow(page, live);
        part.pages.add(page);
        part.open.add(page);
    }
    const index = page.cells.length;
    if (index === page.mesh.instanceMatrix.count) grow(page, live);
    const cell = { x, y, z, type, index, page, id };
    page.cells.push(cell);
    try { map.set(id, cell); }
    catch (failure) {
        page.cells.pop();
        if (!page.cells.length) release(page);
        throw failure;
    }
    stamp(page, index);
    if (page.cells.length === PAGE) part.open.delete(page);
    touched.add(page);
}

function flush() {
    touched.forEach(finish);
    touched.clear();
}

function add(x, y, z, type) {
    const id = key(x, y, z);
    if (world.has(id)) return;
    insert(world, parts[type], x, y, z, type, id, true);
    flush();
    queue();
}

function release(page) {
    touched.delete(page);
    page.part.open.delete(page);
    page.part.pages.delete(page);
    scene.remove(page.mesh);
    page.mesh.dispose();
    page.mesh = null;
}

function erase(item, keep = false) {
    const page = item.page, part = page.part;
    const last = page.cells.pop();
    if (!keep) world.delete(item.id);
    if (!page.cells.length) {
        release(page);
        return;
    }
    part.open.add(page);
    if (item !== last) {
        page.cells[item.index] = last;
        last.index = item.index;
        stamp(page, item.index);
    }
    touched.add(page);
}

function remove(x, y, z) {
    const item = world.get(key(x, y, z));
    if (!item) return;
    erase(item);
    flush();
    queue();
}

function change(x, y, z, type) {
    if (type === undefined) return false;
    const id = key(x, y, z), item = world.get(id);
    if (item ? item.type === type : type < 0) return false;
    if (type >= 0) {
        insert(world, parts[type], x, y, z, type, id, true);
        if (item) erase(item, true);
    } else erase(item);
    return true;
}

function part(material) {
    return { material, pages: new Set(), open: new Set() };
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
    parts.push(part(new THREE.MeshLambertMaterial({ map: tex, alphaTest: CLEAR.includes(name) ? .5 : 0 })));
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

let building = false, reading = false;

async function inspect(action) {
    reading = true;
    try { return await action(world); }
    finally { reading = false; }
}

function wait() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

async function build(spans, type, task) {
    building = true;
    let count = 0, time = performance.now();
    try {
        task.report();
        for (const [x, y, z, length, axis = 2, step = 1] of spans) {
            for (let i = 0; i < length; i++) {
                const a = x + (axis === 0 ? i * step : 0), b = z + (axis === 2 ? i * step : 0);
                if (task.cancelled) return;
                if (change(a, y, b, typeof type === 'function' ? type(a, y, b) : type)) task.changed++;
                task.done++;
                if (++count === 256) {
                    count = 0;
                    if (performance.now() - time >= 6) {
                        flush();
                        task.report();
                        await wait();
                        time = performance.now();
                    }
                }
            }
        }
    } finally {
        try { flush(); }
        finally {
            building = false;
            if (task.changed || dirty) queue();
        }
    }
}

let database = null;
let ready = false;
let dirty = false;
let revision = 0;
let timer = 0;
let loading = false;
let saving = false;

function snapshot() {
    const blocks = [];
    parts.forEach((part, type) => part.pages.forEach(page => page.cells.forEach(cell => blocks.push([cell.x, cell.y, cell.z, ASSETS[type]]))));
    return { version: 1, blocks };
}

function verify(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.blocks)) throw Error('ERROR: Invalid world file');
    return data.blocks;
}

function validate(block) {
    if (!Array.isArray(block) || block.length !== 4 || !Number.isSafeInteger(block[0]) || !Number.isSafeInteger(block[1]) || !Number.isSafeInteger(block[2]) || block[1] < 0 || typeof block[3] !== 'string') throw Error('ERROR: Invalid world file');
    if (!types.has(block[3])) throw Error('ERROR: World contains an outdated block');
}

function persist(data) {
    if (!ready || !database || (!data && (!dirty || loading || building))) return;
    try {
        const mark = revision;
        const store = database.transaction('world', 'readwrite');
        store.objectStore('world').put(data || snapshot(), 'current');
        store.oncomplete = () => { if (revision === mark) dirty = false; };
        return store;
    } catch { }
}

async function autosave() {
    if (!ready || !database || !dirty || loading || building || saving) return;
    saving = true;
    const mark = revision, blocks = [];
    let time = performance.now();
    try {
        for (const cell of world.values()) {
            blocks.push([cell.x, cell.y, cell.z, ASSETS[cell.type]]);
            if (blocks.length % 256 === 0 && performance.now() - time >= 6) {
                await wait();
                if (mark !== revision || loading || building || !dirty) return;
                time = performance.now();
            }
        }
        if (mark === revision && !loading && !building && dirty) persist({ version: 1, blocks });
    } catch { }
    finally {
        saving = false;
        if (mark !== revision && dirty && !loading && !building) {
            clearTimeout(timer);
            timer = setTimeout(autosave, 650);
        }
    }
}

function queue() {
    dirty = true;
    revision++;
    clearTimeout(timer);
    if (ready && database && !loading && !building) timer = setTimeout(autosave, 650);
}

async function replace(blocks, save = true, task) {
    loading = true;
    const next = parts.map(value => part(value.material));
    const fresh = new Map();
    let time = performance.now(), matched = 0, changed = 0;
    try {
        for (let i = 0; i < blocks.length; i++) {
            if (task?.cancelled) return;
            const block = blocks[i];
            validate(block);
            const [x, y, z, id] = block, type = types.get(id);
            const location = key(x, y, z);
            if (fresh.has(location)) throw Error('ERROR: Invalid world file');
            insert(fresh, next[type], x, y, z, type, location, false);
            if (task) {
                const item = world.get(location);
                if (item) matched++;
                if (item?.type !== type) changed++;
                task.done++;
            }
            if (i % 256 === 0 && performance.now() - time >= 6) {
                if (task) task.report();
                await wait();
                time = performance.now();
            }
        }
        if (task?.cancelled) return;
        flush();
        if (task) task.changed = changed + world.size - matched;
        clearTimeout(timer);
        const previous = parts;
        parts = next;
        world = fresh;
        previous.forEach(part => part.pages.forEach(page => { scene.remove(page.mesh); page.mesh.dispose(); }));
        parts.forEach(part => part.pages.forEach(page => scene.add(page.mesh)));
        if (save) dirty = true;
    } finally {
        if (parts !== next) {
            touched.clear();
            next.forEach(part => part.pages.forEach(page => page.mesh.dispose()));
        }
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
                    if (read.result && !dirty && !building && !loading) {
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
    if (loading || building || (!ready && typeof indexedDB !== 'undefined')) return 'ERROR: World is busy';
    if (!database && typeof indexedDB !== 'undefined') return 'ERROR: Unable to reset world';
    loading = true;
    clearTimeout(timer);
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
    SIZE, RADIUS, ASSETS, types, canvas, camera, scene, renderer, marker, key, asset, add, remove, aim, build, wait, inspect, snapshot, verify, replace, clear,
    get world() { return world; },
    get parts() { return parts; },
    get loading() { return loading || reading; },
    get busy() { return loading || building || reading || (!ready && typeof indexedDB !== 'undefined'); }
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