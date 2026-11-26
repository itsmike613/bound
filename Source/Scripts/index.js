import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const SIZE = 1;
const REACH = 8.4;
const EYE = 1.76;
const HEIGHT = 2;
const RADIUS = .44;
const ASSETS = [
    'black_lightest', 'black_light', 'black_normal', 'black_dark', 'black_darkest',
    'gray_lightest', 'gray_light', 'gray_normal', 'gray_dark', 'gray_darkest',
    'white_lightest', 'white_light', 'white_normal', 'white_dark', 'white_darkest',
    'tan_lightest', 'tan_light', 'tan_normal', 'tan_dark', 'tan_darkest',
    'brown_lightest', 'brown_light', 'brown_normal', 'brown_dark', 'brown_darkest',
    'orange_lightest', 'orange_light', 'orange_normal', 'orange_dark', 'orange_darkest',
    'yellow_lightest', 'yellow_light', 'yellow_normal', 'yellow_dark', 'yellow_darkest',
    'green_lightest', 'green_light', 'green_normal', 'green_dark', 'green_darkest',
    'cyan_lightest', 'cyan_light', 'cyan_normal', 'cyan_dark', 'cyan_darkest',
    'blue_lightest', 'blue_light', 'blue_normal', 'blue_dark', 'blue_darkest',
    'purple_lightest', 'purple_light', 'purple_normal', 'purple_dark', 'purple_darkest',
    'pink_lightest', 'pink_light', 'pink_normal', 'pink_dark', 'pink_darkest',
    'red_lightest', 'red_light', 'red_normal', 'red_dark', 'red_darkest',
    'glass', 'wood_planks', 'masonry_bricks', 'stone_bricks', 'cement'
];
const CLEAR = ['glass'];
const types = new Map(ASSETS.map((id, index) => [id, index]));

const view = document.querySelector('#view');
const palette = document.querySelector('#palette');
const total = document.querySelector('#total');
const number = document.querySelector('#number');
const coords = document.querySelector('#coords');
const command = document.querySelector('#command');
const input = document.querySelector('#input');
const error = document.querySelector('#error');
const mode = document.querySelector('#mode');
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

function select(index) {
    chosen = (index + ASSETS.length) % ASSETS.length;
    tiles.forEach((tile, index) => tile.classList.toggle('selected', index === chosen));
    number.textContent = ASSETS[chosen];
    tiles[chosen].scrollIntoView({ block: 'nearest' });
}

ASSETS.forEach((name, index) => {
    const path = `./Source/Assets/${name}.png`;
    const tex = new THREE.TextureLoader().load(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    parts.push({ cells: [], limit: 0, mesh: null, material: new THREE.MeshLambertMaterial({ map: tex, alphaTest: CLEAR.includes(name) ? .5 : 0 }) });
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.type = 'button';
    tile.title = name;
    tile.style.setProperty('--img', `url("${new URL(path, location.href)}")`);
    tile.innerHTML = '<span class="cube"><span class="face front"></span><span class="face right"></span><span class="face top"></span></span>';
    tile.addEventListener('click', () => select(index));
    palette.append(tile);
    tiles.push(tile);
});

total.textContent = `${ASSETS.length} TOTAL`;
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
let dash = 0;
let sprint = false;
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
    if (loading) return;
    const hit = aim();
    if (!hit) return;
    const x = hit.x + (hit.ax || 0), y = hit.y + (hit.ay || 0), z = hit.z + (hit.az || 0);
    if (safe(x, y, z)) add(x, y, z, chosen);
}

function destroy() {
    if (loading) return;
    const hit = aim();
    if (hit && hit.block) remove(hit.x, hit.y, hit.z);
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

function fill(args) {
    if (loading) return 'ERROR: World is busy';
    if (args.length < 6) return 'ERROR: Expected 6 coordinates';
    if (args.slice(0, 6).some(value => !/^-?\d+$/.test(value))) return 'ERROR: Invalid coordinates';
    const point = args.slice(0, 6).map(Number);
    if (point.some(value => !Number.isSafeInteger(value))) return 'ERROR: Invalid coordinates';
    if (point[1] < 0 || point[4] < 0) return 'ERROR: Cannot build below ground';
    const id = args[6];
    if (id !== '0' && !types.has(id)) return 'ERROR: Invalid block ID (0 or descriptive ID)';
    if (args.length > 8 || (args.length === 8 && args[7] !== 'true')) return 'ERROR: Invalid arguments';
    const low = [Math.min(point[0], point[3]), Math.min(point[1], point[4]), Math.min(point[2], point[5])];
    const high = [Math.max(point[0], point[3]), Math.max(point[1], point[4]), Math.max(point[2], point[5])];
    const total = (high[0] - low[0] + 1) * (high[1] - low[1] + 1) * (high[2] - low[2] + 1);
    if (!Number.isSafeInteger(total)) return 'ERROR: Invalid coordinates';
    if (total > 500 && args[7] !== 'true') return 'ERROR: Maximum 500 blocks exceeded';
    jobs.push({ low, high, type: id === '0' ? -1 : types.get(id), x: low[0], y: low[1], z: low[2] });
    if (jobs.length === 1) build();
}

function sculpt(args, kind) {
    if (loading) return 'ERROR: World is busy';
    const sphere = kind === 'sphere';
    const length = sphere ? 3 : 4;
    if (args.length < length || args.length > length + 1 || (args.length > length && args[length] !== 'true')) return 'ERROR: Invalid arguments';
    if (args.slice(0, length - 2).some(value => !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) return 'ERROR: Invalid dimensions';
    const radius = Number(args[0]), height = sphere ? radius * 2 + 1 : Number(args[1]);
    if (radius < (kind === 'square' ? 0 : 2) || height < 1) return 'ERROR: Invalid dimensions';
    const id = args[length - 2], mode = args[length - 1];
    if (!types.has(id)) return 'ERROR: Invalid block ID';
    if (mode !== 'h' && mode !== 's') return 'ERROR: Expected h or s';
    const center = [Math.floor(body.x / SIZE), Math.floor(body.y / SIZE), Math.floor(body.z / SIZE)];
    const low = [center[0] - radius, center[1] - (sphere ? radius : 0), center[2] - radius];
    const high = [center[0] + radius, low[1] + height - 1, center[2] + radius];
    if (low[1] < 0) return 'ERROR: Cannot build below ground';
    if ((radius * 2 + 1) ** 2 * height > 250000 || [...low, ...high].some(value => !Number.isSafeInteger(value))) return 'ERROR: Shape is too large';
    const inside = (x, y, z) => {
        if (y < low[1] || y > high[1]) return false;
        const a = x - center[0], b = y - center[1], c = z - center[2];
        if (kind === 'square') return Math.abs(a) <= radius && Math.abs(c) <= radius;
        return a * a + c * c + (sphere ? b * b : 0) <= radius * radius;
    };
    const test = (x, y, z) => inside(x, y, z) && (mode === 's' || !inside(x - 1, y, z) || !inside(x + 1, y, z) || !inside(x, y, z - 1) || !inside(x, y, z + 1) || (sphere && (!inside(x, y - 1, z) || !inside(x, y + 1, z))));
    if (args[length] !== 'true') {
        let total = 0;
        for (let x = low[0]; x <= high[0]; x++)for (let y = low[1]; y <= high[1]; y++)for (let z = low[2]; z <= high[2]; z++) {
            if (test(x, y, z) && ++total > 500) return 'ERROR: Maximum 500 blocks exceeded';
        }
    }
    jobs.push({ low, high, type: types.get(id), test, x: low[0], y: low[1], z: low[2] });
    if (jobs.length === 1) build();
}

function teleport(args) {
    if (loading || jobs.length) return 'ERROR: World is busy';
    if (args.length !== 3 || args.some(value => !/^-?\d+$/.test(value) || Math.abs(Number(value)) > 10000)) return 'ERROR: Invalid coordinates';
    const [x, y, z] = args.map(Number);
    if (y < 0) return 'ERROR: Cannot teleport below ground';
    const a = (x + .5) * SIZE, b = y * SIZE, c = (z + .5) * SIZE;
    if (blocked(a, b, c)) return 'ERROR: Destination is occupied';
    body.set(a, b, c);
    speed.set(0, 0, 0);
    step = 0;
    grounded = !flying && blocked(a, b - .0002, c);
}

function spawn(args) {
    if (args.length) return 'ERROR: Invalid arguments';
    return teleport(['0', '0', '0']);
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

function screenshot(args) {
    if (args.length > 1 || (args[0] && !/^[a-z0-9_-]+$/i.test(args[0]))) return 'ERROR: Invalid filename';
    const visible = marker.visible;
    try {
        marker.visible = false;
        renderer.render(scene, camera);
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${args[0] || 'screenshot'}.png`;
        link.click();
    } catch { return 'ERROR: Unable to take screenshot'; }
    finally { marker.visible = visible; }
}

function save(args) {
    if (args.length > 1 || (args[0] && !/^[a-z0-9_-]+$/i.test(args[0]))) return 'ERROR: Invalid filename';
    if (loading || jobs.length) return 'ERROR: World is busy';
    try {
        const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${args[0] || 'world'}.bound`;
        link.click();
        requestAnimationFrame(() => URL.revokeObjectURL(url));
    } catch { return 'ERROR: Unable to save world'; }
}

const picker = document.createElement('input');
picker.type = 'file';
picker.accept = '.bound';
picker.hidden = true;
document.body.append(picker);

function load(args) {
    if (args.length) return 'ERROR: Invalid arguments';
    if (loading || jobs.some(job => job.paint)) return 'ERROR: World is busy';
    close();
    picker.value = '';
    picker.click();
}

picker.addEventListener('change', async () => {
    const file = picker.files[0];
    if (!file) return;
    try {
        if (!/\.bound$/i.test(file.name)) throw Error();
        const blocks = verify(JSON.parse(await file.text()));
        if (loading) throw Error();
        if (jobs.some(job => job.paint)) throw Error('ERROR: World is busy');
        await replace(blocks);
    } catch (failure) {
        command.hidden = false;
        error.textContent = ['ERROR: World contains an outdated block', 'ERROR: World is busy'].includes(failure.message) ? failure.message : 'ERROR: Invalid world file';
        error.hidden = false;
        input.focus();
    }
});

const images = document.createElement('input');
images.type = 'file';
images.accept = 'image/*';
images.hidden = true;
document.body.append(images);
let artwork;

function pixelart(args) {
    if (loading) return 'ERROR: World is busy';
    if (args.length < 3 || args.length > 4 || (args.length === 4 && args[3] !== 'true')) return 'ERROR: Invalid arguments';
    const [width, colors, mode, confirm] = args;
    if (width !== 'auto' && (!/^\d+$/.test(width) || !Number.isSafeInteger(Number(width)) || Number(width) < 3)) return 'ERROR: Invalid width';
    if (Number(width) > 250000) return 'ERROR: Image is too large';
    if (colors !== 'colors' && colors !== 'blackwhite') return 'ERROR: Expected colors or blackwhite';
    if (mode !== 'flat' && mode !== 'wall') return 'ERROR: Expected flat or wall';
    if (width === 'auto' && confirm !== 'true') return 'ERROR: Auto requires true';
    artwork = args;
    close();
    images.value = '';
    images.click();
}

images.addEventListener('change', async () => {
    const file = images.files[0];
    if (!file) return;
    const [size, colors, mode, confirm] = artwork;
    const previous = world;
    let image;
    try {
        image = await createImageBitmap(file);
        if (!image.width || !image.height) throw Error();
        const width = size === 'auto' ? image.width : Number(size);
        const height = size === 'auto' ? image.height : Math.max(1, Math.round(width * image.height / image.width));
        if (width * height > 250000) throw Error('ERROR: Image is too large');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const data = new Uint8ClampedArray(width * height * 4);
        for (let v = 0; v < height; v += 16384)for (let u = 0; u < width; u += 16384) {
            canvas.width = Math.min(16384, width - u);
            canvas.height = Math.min(16384, height - v);
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, -u, -v, width, height);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let row = 0; row < canvas.height; row++) data.set(pixels.subarray(row * canvas.width * 4, (row + 1) * canvas.width * 4), ((v + row) * width + u) * 4);
        }
        if (confirm !== 'true') {
            let total = 0;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] && ++total > 500) throw Error('ERROR: Maximum 500 blocks exceeded');
            }
        }

        const shades = [];
        ASSETS.forEach((name, type) => {
            if (!/_(lightest|light|normal|dark|darkest)$/.test(name)) return;
            if (colors === 'blackwhite' && !/^(black|gray|white)_/.test(name)) return;
            const texture = parts[type].material.map.image;
            if (!texture) throw Error('ERROR: Block textures are not ready');
            canvas.width = texture.width;
            canvas.height = texture.height;
            context.drawImage(texture, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; }
            const count = pixels.length / 4;
            shades.push({ type, r: r / count, g: g / count, b: b / count });
        });

        if (loading || world !== previous) throw Error('ERROR: World is busy');
        const flat = mode === 'flat';
        const angle = Math.round(yaw / (Math.PI / 2)) * Math.PI / 2;
        const a = Math.round(-Math.sin(angle)), b = Math.round(-Math.cos(angle));
        const x = Math.floor((body.x + a * RADIUS) / SIZE) + a;
        const y = Math.floor(body.y / SIZE);
        const z = Math.floor((body.z + b * RADIUS) / SIZE) + b;
        const end = [x - b * (width - 1) + (flat ? a * (height - 1) : 0), y + (flat ? 0 : height - 1), z + a * (width - 1) + (flat ? b * (height - 1) : 0)];
        const start = [x, y, z];
        const low = start.map((value, index) => Math.min(value, end[index]));
        const high = start.map((value, index) => Math.max(value, end[index]));
        if (y < 0 || [...low, ...high].some(value => !Number.isSafeInteger(value))) throw Error('ERROR: Invalid coordinates');
        const paint = (u, v, w) => {
            const column = (w - z) * a - (u - x) * b;
            const row = height - 1 - (flat ? (u - x) * a + (w - z) * b : v - y);
            const i = (row * width + column) * 4;
            if (!data[i + 3]) return;
            let type, best = Infinity;
            for (const shade of shades) {
                const distance = (data[i] - shade.r) ** 2 + (data[i + 1] - shade.g) ** 2 + (data[i + 2] - shade.b) ** 2;
                if (distance < best) { best = distance; type = shade.type; }
            }
            return type;
        };
        jobs.push({ low, high, paint, x: low[0], y: low[1], z: low[2] });
        if (jobs.length === 1) build();
    } catch (failure) {
        command.hidden = false;
        error.textContent = failure.message.startsWith('ERROR:') ? failure.message : 'ERROR: Invalid image file';
        error.hidden = false;
        input.focus();
    } finally { if (image) image.close(); }
});

async function reset(args) {
    if (args.length !== 1 || args[0] !== 'itsmike613') return 'ERROR: Are you sure? Type /new itsmike613 to reset this world';
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

const commands = new Map([['fill', fill], ['save', save], ['load', load], ['circle', args => sculpt(args, 'circle')], ['square', args => sculpt(args, 'square')], ['sphere', args => sculpt(args, 'sphere')], ['teleport', teleport], ['spawn', spawn], ['new', reset], ['screenshot', screenshot], ['pixelart', pixelart]]);

function close() {
    command.hidden = true;
    error.hidden = true;
    input.blur();
}

command.addEventListener('submit', async event => {
    event.preventDefault();
    const words = input.value.trim().replace(/^\/\s*/, '').split(/\s+/);
    const run = commands.get(words.shift().toLowerCase());
    const result = run ? run(words) : 'ERROR: Unknown command';
    const message = result instanceof Promise ? await result : result;
    if (message) { error.textContent = message; error.hidden = false; }
    else close();
});

input.addEventListener('input', () => { error.hidden = true; });

canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('mousedown', event => {
    event.preventDefault();
    if (!command.hidden) return;
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
    if (event.button === 1) {
        const hit = aim();
        if (hit && hit.block) select(world.get(key(hit.x, hit.y, hit.z)).type);
    }
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
        sprint = false;
        dash = 0;
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
    const now = performance.now();

    if (event.code === 'KeyW') {
        if (dash && now - dash < 300) {
            sprint = true; dash = 0;
        } else dash = now;
    }

    if (event.code === 'Space') {
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

document.addEventListener('keyup', event => {
    keys.delete(event.code);
    if (event.code === 'KeyW') sprint = false;
});

window.addEventListener('blur', () => { keys.clear(); buttons.clear(); sprint = false; dash = 0; });
window.addEventListener('wheel', event => {
    if (palette.contains(event.target) || !command.hidden) return;
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
    const stride = sprint && forward > 0 ? pace * 2 : pace;
    const blend = 1 - Math.exp(-13 * dt);
    speed.x += ((right * Math.cos(yaw) - forward * Math.sin(yaw)) * stride / length - speed.x) * blend;
    speed.z += ((-right * Math.sin(yaw) - forward * Math.cos(yaw)) * stride / length - speed.z) * blend;
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
    floor.position.set(body.x, 0, body.z);
}

requestAnimationFrame(frame);