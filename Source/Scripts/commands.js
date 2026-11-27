export function commands(engine, player) {
    const { SIZE, RADIUS, ASSETS, types, canvas, camera, scene, renderer, marker, enqueue, snapshot, verify, replace, clear } = engine;
    const { body, relocate } = player;
    const command = document.querySelector('#command');
    const input = document.querySelector('#input');
    const error = document.querySelector('#error');
    
    const registry = new Map([['fill', fill], ['save', save], ['load', load], ['circle', args => sculpt(args, 'circle')], ['square', args => sculpt(args, 'square')], ['sphere', args => sculpt(args, 'sphere')], ['teleport', teleport], ['spawn', spawn], ['new', reset], ['screenshot', screenshot], ['pixelart', pixelart]]);

    function fill(args) {
        if (engine.loading) return 'ERROR: World is busy';
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
        enqueue(low, high, { type: id === '0' ? -1 : types.get(id) });
    }

    function sculpt(args, kind) {
        if (engine.loading) return 'ERROR: World is busy';
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
        enqueue(low, high, { type: types.get(id), test });
    }

    function teleport(args) {
        if (engine.busy) return 'ERROR: World is busy';
        if (args.length !== 3 || args.some(value => !/^-?\d+$/.test(value) || Math.abs(Number(value)) > 10000)) return 'ERROR: Invalid coordinates';
        const [x, y, z] = args.map(Number);
        if (y < 0) return 'ERROR: Cannot teleport below ground';
        const a = (x + .5) * SIZE, b = y * SIZE, c = (z + .5) * SIZE;
        if (!relocate(a, b, c)) return 'ERROR: Destination is occupied';
    }

    function spawn(args) {
        if (args.length) return 'ERROR: Invalid arguments';
        return teleport(['0', '0', '0']);
    }

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
        if (engine.busy) return 'ERROR: World is busy';
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
        if (engine.loading || engine.painting) return 'ERROR: World is busy';
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
            if (engine.loading) throw Error();
            if (engine.painting) throw Error('ERROR: World is busy');
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
        if (engine.loading) return 'ERROR: World is busy';
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
        const previous = engine.world;
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
                const texture = engine.parts[type].material.map.image;
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

            if (engine.loading || engine.world !== previous) throw Error('ERROR: World is busy');
            const flat = mode === 'flat';
            const angle = Math.round(player.yaw / (Math.PI / 2)) * Math.PI / 2;
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
            enqueue(low, high, { paint });
        } catch (failure) {
            command.hidden = false;
            error.textContent = failure.message.startsWith('ERROR:') ? failure.message : 'ERROR: Invalid image file';
            error.hidden = false;
            input.focus();
        } finally { if (image) image.close(); }
    });

    function reset(args) {
        if (args.length !== 1 || args[0] !== 'itsmike613') return 'ERROR: Are you sure? Type /new itsmike613 to reset this world';
        return clear();
    }

    function close() {
        command.hidden = true;
        error.hidden = true;
        input.blur();
    }

    function open() {
        command.hidden = false;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }

    command.addEventListener('submit', async event => {
        event.preventDefault();
        const words = input.value.trim().replace(/^\/\s*/, '').split(/\s+/);
        const run = registry.get(words.shift().toLowerCase());
        const result = run ? run(words) : 'ERROR: Unknown command';
        const message = result instanceof Promise ? await result : result;
        if (message) { error.textContent = message; error.hidden = false; }
        else close();
    });

    input.addEventListener('input', () => { error.hidden = true; });

    return { get active() { return !command.hidden; }, open, close, submit: () => command.requestSubmit() };
}