export function commands(engine, player) {
    const { SIZE, RADIUS, ASSETS, types, canvas, camera, scene, renderer, marker, build, wait, snapshot, verify, replace, clear } = engine;
    const { body, relocate } = player;
    const command = document.querySelector('#command');
    const input = document.querySelector('#input');
    const status = document.querySelector('#status');
    const syntax = document.querySelector('#syntax');
    const CONFIRM = 1000;
    const WARNING = 250000;
    const registry = new Map([
        ['fill', ['x y z x y z id [true]', fill]],
        ['circle', ['radius height id h|s [true]', (args, task) => sculpt(args, task, 'circle')]],
        ['square', ['distance height id h|s [true]', (args, task) => sculpt(args, task, 'square')]],
        ['sphere', ['radius id h|s [true]', (args, task) => sculpt(args, task, 'sphere')]],
        ['pixelart', ['width|auto colors|blackwhite flat|wall [true]', pixelart]],
        ['teleport', ['x y z', teleport]],
        ['spawn', ['', spawn]],
        ['new', ['itsmike613', reset]],
        ['save', ['[name]', save]],
        ['load', ['', load]],
        ['screenshot', ['[name]', screenshot]]
    ]);
    let task, issue = '', feedback = '', timer = 0;

    function words(value) {
        return value.replace(/^\s*\/\s*/, '').trim().split(/\s+/);
    }

    function guide() {
        syntax.replaceChildren();
        if (command.hidden) { syntax.textContent = 'Press / to enter a command.'; return; }
        const value = input.value;
        const name = words(value)[0].toLowerCase(), entry = registry.get(name);
        if (!entry) { syntax.textContent = 'Start typing a valid command to see its syntax.'; return; }
        const prefix = value.match(/^\s*\/\s*/)?.[0].length || 0;
        const before = value.slice(prefix, input.selectionStart);
        const index = before.trim() ? before.trim().split(/\s+/).length - Number(!/\s$/.test(before)) : 0;
        const tokens = [`/${name}`, ...entry[0].split(' ').filter(Boolean)];
        tokens.forEach((token, position) => {
            if (position) syntax.append(' ');
            const span = document.createElement('span');
            span.textContent = token;
            if (position === index) span.className = 'current';
            syntax.append(span);
        });
        const current = syntax.querySelector('.current');
        if (current) {
            if (current.offsetLeft < syntax.scrollLeft) syntax.scrollLeft = current.offsetLeft;
            else if (current.offsetLeft + current.offsetWidth > syntax.scrollLeft + syntax.clientWidth) syntax.scrollLeft = current.offsetLeft + current.offsetWidth - syntax.clientWidth + 14;
        }
    }

    function refresh() {
        const visible = !command.hidden || !!task || !!feedback;
        status.hidden = syntax.hidden = !visible;
        const warning = !command.hidden && task?.warning;
        const error = !command.hidden && issue;
        const message = [error, warning, task?.message, feedback].filter(Boolean).join(' · ');
        if (status.textContent !== message) status.textContent = message;
        status.title = message;
        status.className = error ? (error.startsWith('WARNING:') ? 'warning' : 'failure') : warning ? 'warning' : task ? '' : feedback ? 'success' : '';
    }

    function number(value) { return value.toLocaleString('en-US'); }

    function invalidate() {
        if (!task) return;
        task.stale = true;
        task.resume?.(false);
    }

    async function warn(count, current) {
        if (current.cancelled) return false;
        if (count <= WARNING) return true;
        let approved = false;
        if (!current.stale && !command.hidden && input.value === current.value) {
            current.message = issue = '';
            current.warning = 'Large operation; may slow game. Press Enter again to proceed.';
            approved = await new Promise(resolve => { current.resume = resolve; refresh(); });
            current.resume = null;
            current.warning = '';
        }
        if (approved && !current.stale && !command.hidden && input.value === current.value && !current.cancelled) return true;
        current.discarded = current.cancelled = true;
        return false;
    }

    function confirm(count, value) {
        if (count > CONFIRM && value !== 'true') throw Error('ERROR: More than 1,000 blocks; add true');
    }

    function bounds(low, high) {
        if ([...low, ...high].some(value => !Number.isSafeInteger(value)) || !Number.isSafeInteger(high.reduce((total, value, index) => total * (value - low[index] + 1), 1))) throw Error('ERROR: Coordinates or size exceed numeric precision');
    }

    function* box(low, high) {
        for (let x = low[0]; x <= high[0]; x++)for (let y = low[1]; y <= high[1]; y++) yield [x, y, low[2], high[2] - low[2] + 1];
    }

    async function fill(args, current) {
        if (args.length < 6) return 'ERROR: Expected 6 coordinates';
        if (args.slice(0, 6).some(value => !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) return 'ERROR: Invalid coordinates';
        const point = args.slice(0, 6).map(Number);
        if (point[1] < 0 || point[4] < 0) return 'ERROR: Cannot build below ground';
        const id = args[6];
        if (id !== '0' && !types.has(id)) return 'ERROR: Invalid block ID (0 or descriptive ID)';
        if (args.length > 8 || (args.length === 8 && args[7] !== 'true')) return 'ERROR: Invalid arguments';
        const low = [Math.min(point[0], point[3]), Math.min(point[1], point[4]), Math.min(point[2], point[5])];
        const high = [Math.max(point[0], point[3]), Math.max(point[1], point[4]), Math.max(point[2], point[5])];
        bounds(low, high);
        const total = high.reduce((total, value, index) => total * (value - low[index] + 1), 1);
        confirm(total, args[7]);
        if (!await warn(total, current)) return;
        current.total = total;
        current.blocks = true;
        await build(box(low, high), id === '0' ? -1 : types.get(id), current);
    }

    function* spans(kind, radius, height, center, hollow) {
        const sphere = kind === 'sphere', square = kind === 'square', limit = radius * radius;
        for (let a = -radius; a <= radius; a++) {
            const extent = square ? radius : Math.floor(Math.sqrt(Math.max(0, limit - a * a)));
            const low = sphere ? -extent : 0, high = sphere ? extent : height - 1;
            for (let b = low; b <= high; b++) {
                const width = sphere ? Math.floor(Math.sqrt(Math.max(0, limit - a * a - b * b))) : extent;
                let inner = -1;
                if (hollow) {
                    const edge = square ? radius - 1 : Math.floor(Math.sqrt(limit - (Math.abs(a) + 1) ** 2 - (sphere ? b * b : 0)));
                    const cap = sphere ? Math.floor(Math.sqrt(limit - a * a - (Math.abs(b) + 1) ** 2)) : edge;
                    if (square ? Math.abs(a) < radius : Number.isFinite(edge) && Number.isFinite(cap)) inner = Math.min(width - 1, edge, cap);
                }
                const x = center[0] + a, y = center[1] + b, z = center[2];
                if (inner < 0) yield [x, y, z - width, width * 2 + 1];
                else {
                    yield [x, y, z - width, width - inner];
                    yield [x, y, z + inner + 1, width - inner];
                }
            }
        }
    }

    async function sculpt(args, current, kind) {
        const sphere = kind === 'sphere', length = sphere ? 3 : 4;
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
        bounds(low, high);
        const shape = () => spans(kind, radius, height, center, mode === 'h');
        current.label = 'Checking shape';
        current.report();
        let count = 0, steps = 0, time = performance.now();
        for (const span of shape()) {
            count += span[3];
            if (args[length] !== 'true' && count > CONFIRM) confirm(count, args[length]);
            if (count > WARNING) break;
            if (++steps % 256 === 0 && performance.now() - time >= 6) {
                if (current.cancelled) return;
                current.done = count;
                current.report();
                await wait();
                time = performance.now();
            }
        }
        if (current.cancelled) return;
        confirm(count, args[length]);
        if (!await warn(count, current)) return;
        current.label = 'Building';
        current.done = 0;
        if (count <= WARNING) current.total = count;
        current.blocks = true;
        await build(shape(), types.get(id), current);
    }

    function teleport(args) {
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
        let url;
        try {
            const blob = new Blob([JSON.stringify(snapshot())], { type: 'application/json' });
            url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${args[0] || 'world'}.bound`;
            link.click();
        } catch { return 'ERROR: Unable to save world'; }
        finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }

    function pick(accept) {
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = accept;
        picker.hidden = true;
        document.body.append(picker);
        return picker;
    }

    const picker = pick('.bound'), images = pick('image/*');

    function choose(picker, current) {
        picker.value = '';
        return new Promise(resolve => {
            function finish() {
                const file = picker.files[0];
                picker.removeEventListener('change', finish);
                picker.removeEventListener('cancel', finish);
                picker.value = '';
                current.abort = null;
                resolve(file);
            }
            current.abort = finish;
            picker.addEventListener('change', finish);
            picker.addEventListener('cancel', finish);
            try { picker.click(); } catch { finish(); }
        });
    }

    async function load(args, current) {
        if (args.length) return 'ERROR: Invalid arguments';
        current.message = 'Choose a world file';
        refresh();
        const file = await choose(picker, current);
        if (!file) { current.cancelled = true; return; }
        if (current.cancelled) return;
        if (!/\.bound$/i.test(file.name)) return 'ERROR: Invalid world file';
        current.message = 'Reading world…';
        refresh();
        let blocks;
        try { blocks = verify(JSON.parse(await file.text())); }
        catch (failure) { return failure.message.startsWith('ERROR:') ? failure.message : 'ERROR: Invalid world file'; }
        if (current.cancelled) return;
        if (engine.busy) return 'ERROR: World is busy';
        if (!await warn(blocks.length, current)) return;
        current.total = blocks.length;
        current.label = 'Loading world';
        current.report();
        current.blocks = true;
        await replace(blocks, true, current);
    }

    function palette(colors) {
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw Error('ERROR: Unable to read pixels');
        const shades = [];
        ASSETS.forEach((name, type) => {
            if (!/_(lightest|light|normal|dark|darkest)$/.test(name)) return;
            if (colors === 'blackwhite' && !/^(black|gray|white)_/.test(name)) return;
            const texture = engine.parts[type].material.map.image;
            if (!texture?.width) throw Error('ERROR: Block textures are not ready');
            canvas.width = texture.width;
            canvas.height = texture.height;
            context.drawImage(texture, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let r = 0, g = 0, b = 0;
            for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; }
            const count = pixels.length / 4;
            shades.push({ type, r: r / count, g: g / count, b: b / count });
        });
        canvas.width = canvas.height = 0;
        const cache = new Map();
        return (r, g, b) => {
            const key = r * 65536 + g * 256 + b;
            let type = cache.get(key);
            if (type !== undefined) return type;
            let best = Infinity;
            for (const shade of shades) {
                const distance = (r - shade.r) ** 2 + (g - shade.g) ** 2 + (b - shade.b) ** 2;
                if (distance < best) { best = distance; type = shade.type; }
            }
            if (cache.size < 65536) cache.set(key, type);
            return type;
        };
    }

    async function pixelart(args, current) {
        if (args.length < 3 || args.length > 4 || (args.length === 4 && args[3] !== 'true')) return 'ERROR: Invalid arguments';
        const [size, colors, mode, approval] = args;
        if (size !== 'auto' && (!/^\d+$/.test(size) || !Number.isSafeInteger(Number(size)) || Number(size) < 3)) return 'ERROR: Invalid width';
        if (colors !== 'colors' && colors !== 'blackwhite') return 'ERROR: Expected colors or blackwhite';
        if (mode !== 'flat' && mode !== 'wall') return 'ERROR: Expected flat or wall';
        if (size === 'auto' && approval !== 'true') return 'ERROR: Auto requires true';
        current.message = 'Choose an image';
        refresh();
        const file = await choose(images, current);
        if (!file) { current.cancelled = true; return; }
        if (current.cancelled) return;
        const previous = engine.world;
        let image, canvas;
        try {
            current.message = 'Decoding image…';
            refresh();
            image = await createImageBitmap(file);
            if (current.cancelled) return;
            if (!image.width || !image.height) throw Error('ERROR: Invalid image dimensions');
            const width = size === 'auto' ? image.width : Number(size);
            const height = size === 'auto' ? image.height : Math.max(1, Math.round(width * image.height / image.width));
            if (!Number.isSafeInteger(width * height)) throw Error('ERROR: Image dimensions exceed numeric precision');
            canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw Error('ERROR: Unable to read image pixels');
            const TILE = width * height <= WARNING ? 16384 : 128;
            function* tiles() {
                for (let v = 0; v < height; v += TILE)for (let u = 0; u < width; u += TILE) {
                    const w = Math.min(TILE, width - u), h = Math.min(TILE, height - v);
                    canvas.width = w;
                    canvas.height = h;
                    context.imageSmoothingQuality = 'high';
                    context.drawImage(image, -u, -v, width, height);
                    yield [u, v, w, h, context.getImageData(0, 0, w, h).data];
                }
            }
            current.total = width * height;
            if (approval !== 'true') {
                let count = 0, time = performance.now();
                current.label = 'Checking image';
                current.report();
                for (const tile of tiles()) {
                    if (current.cancelled) return;
                    const data = tile[4];
                    for (let i = 3; i < data.length; i += 4) if (data[i] && ++count > CONFIRM) confirm(count, approval);
                    current.done += tile[2] * tile[3];
                    if (performance.now() - time >= 6) {
                        current.report();
                        await wait();
                        time = performance.now();
                    }
                }
            }
            if (current.cancelled) return;
            current.label = 'Building';
            current.done = 0;
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
            if (y < 0) return 'ERROR: Cannot build below ground';
            bounds(low, high);
            if (!await warn(width * height, current)) return;
            if (engine.busy || engine.world !== previous) return 'ERROR: World is busy';
            const shade = palette(colors);
            let tile;
            function* rows() {
                for (tile of tiles()) {
                    const [u, v, w, h] = tile;
                    for (let row = 0; row < h; row++) {
                        const offset = height - 1 - v - row;
                        yield [x - b * u + (flat ? a * offset : 0), y + (flat ? 0 : offset), z + a * u + (flat ? b * offset : 0), w, a ? 2 : 0, a || -b];
                    }
                }
            }
            const paint = (u, v, w) => {
                const column = (w - z) * a - (u - x) * b;
                const row = height - 1 - (flat ? (u - x) * a + (w - z) * b : v - y);
                const i = ((row - tile[1]) * tile[2] + column - tile[0]) * 4, data = tile[4];
                if (data[i + 3]) return shade(data[i], data[i + 1], data[i + 2]);
            };
            current.total = width * height;
            current.blocks = true;
            await build(rows(), paint, current);
        } catch (failure) {
            return failure.message?.startsWith('ERROR:') ? failure.message : 'ERROR: Unable to process image or allocate resources';
        } finally {
            if (image) image.close();
            if (canvas) canvas.width = canvas.height = 0;
        }
    }

    async function reset(args, current) {
        if (args.length !== 1 || args[0] !== 'itsmike613') return 'WARNING: Are you sure? Type /new itsmike613 to reset this world';
        if (!await warn(engine.world.size, current)) return;
        const count = engine.world.size;
        current.locked = true;
        current.message = 'Resetting world…';
        refresh();
        const result = await clear();
        if (!result) { current.blocks = true; current.changed = count; }
        return result;
    }

    function close() {
        command.hidden = true;
        invalidate();
        issue = '';
        input.blur();
        refresh();
        guide();
    }

    function open() {
        command.hidden = false;
        if (document.pointerLockElement === canvas) document.exitPointerLock();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        refresh();
        guide();
    }

    function cancel() {
        if (!task || task.cancelled || task.locked) return false;
        task.cancelled = true;
        task.message = 'Cancelling…';
        task.abort?.();
        task.resume?.(false);
        refresh();
        return true;
    }

    command.addEventListener('submit', async event => {
        event.preventDefault();
        if (command.hidden) return;
        if (task?.resume) {
            if (task.stale || input.value !== task.value) invalidate();
            else task.resume(true);
            return;
        }
        const args = words(input.value), name = args.shift().toLowerCase(), entry = registry.get(name);
        issue = '';
        if (!entry || task || engine.busy) {
            issue = !entry ? 'ERROR: Unknown command' : 'ERROR: World is busy';
            refresh();
            return;
        }
        clearTimeout(timer);
        feedback = '';
        const current = task = { value: input.value, changed: 0, done: 0, label: 'Building', message: 'Working…', report() {
            if (this.cancelled) return;
            this.message = `${this.label} ${number(this.done)}${this.total === undefined ? '' : `/${number(this.total)}`}${this.blocks && this.label === 'Building' ? ` · ${number(this.changed)} changed` : ''} · Esc to cancel`;
            refresh();
        } };
        refresh();
        let result;
        try { result = await entry[1](args, current); }
        catch (failure) { result = failure.message?.startsWith('ERROR:') ? failure.message : 'ERROR: Operation failed or resources exhausted'; }
        task = null;
        issue = '';
        const count = current.blocks ? ` · ${number(current.changed)} blocks changed` : '';
        if (current.discarded) { refresh(); return; }
        if (result) {
            issue = result + count;
            if (command.hidden) open();
        } else {
            feedback = `${current.cancelled ? 'Cancelled' : 'Complete'}${count}`;
            if (!current.cancelled && input.value === current.value) close();
            timer = setTimeout(() => { feedback = ''; refresh(); }, 3000);
        }
        refresh();
    });

    input.addEventListener('input', () => { invalidate(); issue = ''; refresh(); guide(); });
    for (const event of ['click', 'keyup', 'select']) input.addEventListener(event, guide);
    return { get active() { return !command.hidden; }, open, close, cancel, submit: () => command.requestSubmit() };
}