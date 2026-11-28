export function commands(engine, player) {
    const { SIZE, RADIUS, ASSETS, types, canvas, camera, scene, renderer, marker, build, wait, inspect, snapshot, verify, replace, clear } = engine;
    const { body, relocate } = player;
    const command = document.querySelector('#command');
    const input = document.querySelector('#input');
    const status = document.querySelector('#status');
    const syntax = document.querySelector('#syntax');
    const CONFIRM = 1000;
    const WARNING = 250000;
    const registry = new Map([
        ['fill', ['x y z x y z id [true]', fill]],
        ['dither', ['x y z x y z id id percentage [true]', (args, task) => pattern(args, task, 'dither')]],
        ['gradient', ['x y z x y z id id x|y|z [true]', (args, task) => pattern(args, task, 'gradient')]],
        ['checker', ['x y z x y z id id size [true]', (args, task) => pattern(args, task, 'checker')]],
        ['border', ['x y z x y z id thickness [true]', (args, task) => pattern(args, task, 'border')]],
        ['stripe', ['x y z x y z id id size x|y|z [true]', (args, task) => pattern(args, task, 'stripe')]],
        ['noise', ['x y z x y z id id percentage [true]', (args, task) => pattern(args, task, 'noise')]],
        ['line', ['x y z x y z id width height [true]', line]],
        ['map', ['x z x z [name]', map]],
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
        if ([...low, ...high].some(value => !Number.isSafeInteger(value)) || !Number.isSafeInteger(volume(low, high))) throw Error('ERROR: Coordinates or size exceed numeric precision');
    }

    function* box(low, high) {
        for (let x = low[0]; x <= high[0]; x++)for (let y = low[1]; y <= high[1]; y++) yield [x, y, low[2], high[2] - low[2] + 1];
    }

    function coordinates(args, length) {
        if (args.length < length) throw Error(`ERROR: Expected ${length} coordinates`);
        if (args.slice(0, length).some(value => !/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) throw Error('ERROR: Invalid coordinates');
        const point = args.slice(0, length).map(Number), half = length / 2;
        if (length === 6 && (point[1] < 0 || point[4] < 0)) throw Error('ERROR: Cannot build below ground');
        const start = point.slice(0, half), end = point.slice(half);
        const low = start.map((value, index) => Math.min(value, end[index]));
        const high = start.map((value, index) => Math.max(value, end[index]));
        return { start, end, low, high };
    }

    function colored(id) { return /_(lightest|light|normal|dark|darkest)$/.test(id); }

    function block(id, solid = false) {
        if (!solid && id === '0') return -1;
        if (solid && !colored(id)) throw Error('ERROR: Expected a color block ID');
        if (!types.has(id)) throw Error(solid ? 'ERROR: Invalid block ID' : 'ERROR: Invalid block ID (0 or descriptive ID)');
        return types.get(id);
    }

    function positive(value) {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw Error('ERROR: Invalid dimensions');
        return Number(value);
    }

    function axis(value) {
        if (!/^[xyz]$/.test(value)) throw Error('ERROR: Expected x, y or z');
        return 'xyz'.indexOf(value);
    }

    function arity(args, length) {
        if (args.length < length || args.length > length + 1 || (args.length > length && args[length] !== 'true')) throw Error('ERROR: Invalid arguments');
    }

    function volume(low, high) {
        return high.reduce((total, value, index) => total * (value - low[index] + 1), 1);
    }

    async function fill(args, current) {
        const { low, high } = coordinates(args, 6);
        const type = block(args[6]);
        arity(args, 7);
        bounds(low, high);
        await construct(() => box(low, high), type, args[7], current, volume(low, high));
    }

    function* difference(low, high, start, end) {
        const a = low.slice(), b = high.slice();
        for (let i = 0; i < 3; i++) {
            if (start[i] > end[i]) { yield* box(low, high); return; }
        }
        for (let i = 0; i < 3; i++) {
            if (a[i] < start[i]) {
                b[i] = start[i] - 1;
                yield* box(a, b);
                a[i] = start[i];
                b[i] = high[i];
            }
            if (b[i] > end[i]) {
                a[i] = end[i] + 1;
                yield* box(a, b);
                a[i] = start[i];
                b[i] = end[i];
            }
        }
    }

    function ordered(low, high, percentage, first, second) {
        const axes = low.map((value, index) => value === high[index] ? -1 : index).filter(value => value >= 0);
        if (!axes.length) return percentage >= 50 ? second : first;
        const side = 2 ** Math.ceil(7 / axes.length), stride = [0, 0, 0];
        axes.forEach((value, index) => stride[value] = side ** index);
        const mask = new Uint8Array(side ** axes.length), threshold = Math.round(percentage * mask.length / 100);
        for (let i = 0; i < mask.length; i++) {
            const a = i % side, b = Math.floor(i / side) % side, c = Math.floor(i / (side * side));
            let rank = 0;
            for (let bit = 1; bit < side; bit *= 2) {
                rank = rank * 2 + Number(!!((a ^ b ^ c) & bit));
                if (axes.length > 1) rank = rank * 2 + Number(!!(b & bit));
                if (axes.length > 2) rank = rank * 2 + Number(!!(c & bit));
            }
            mask[i] = Number(rank < threshold);
        }
        return (x, y, z) => mask[(x - low[0]) % side * stride[0] + (y - low[1]) % side * stride[1] + (z - low[2]) % side * stride[2]] ? second : first;
    }

    async function pattern(args, current, kind) {
        const { start, end, low, high } = coordinates(args, 6);
        const border = kind === 'border', gradient = kind === 'gradient', stripe = kind === 'stripe';
        const length = border ? 8 : stripe ? 10 : 9;
        arity(args, length);
        const first = block(args[6], gradient), second = border ? first : block(args[7], gradient);
        bounds(low, high);
        let total = volume(low, high), shape = () => box(low, high), paint = first, prepare;
        if (border) {
            const size = positive(args[7]);
            if (low.some((value, index) => value !== high[index]) && low.every((value, index) => value === high[index] || size <= (high[index] - value) / 2)) {
                const a = low.map((value, index) => value === high[index] ? value : value + size);
                const b = high.map((value, index) => value === low[index] ? value : value - size);
                total -= volume(a, b);
                shape = () => difference(low, high, a, b);
            }
        } else if (gradient) {
            const direction = axis(args[8]);
            if (first !== second && start[direction] !== end[direction]) prepare = () => {
                const colors = shades('colors'), shade = match(colors), a = colors.find(color => color.type === first), b = colors.find(color => color.type === second);
                let last, type;
                return (x, y, z) => {
                    const value = direction === 0 ? x : direction === 1 ? y : z;
                    if (value === start[direction]) return first;
                    if (value === end[direction]) return second;
                    if (last === value) return type;
                    last = value;
                    const t = (value - start[direction]) / (end[direction] - start[direction]);
                    return type = shade(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, value);
                };
            };
        } else if (kind === 'dither' || kind === 'noise') {
            const percentage = Number(args[8]);
            if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(args[8]) || percentage < 0 || percentage > 100) return 'ERROR: Invalid percentage (0–100)';
            if (percentage === 100) paint = second;
            else if (percentage && first !== second) paint = kind === 'dither' ? ordered(low, high, percentage, first, second) : () => Math.random() * 100 < percentage ? second : first;
        } else {
            const size = positive(args[8]), direction = stripe ? axis(args[9]) : -1;
            if (first !== second) paint = (x, y, z) => {
                const a = direction < 0 || direction === 0 ? Math.floor((x - low[0]) / size) % 2 : 0;
                const b = direction < 0 || direction === 1 ? Math.floor((y - low[1]) / size) % 2 : 0;
                const c = direction < 0 || direction === 2 ? Math.floor((z - low[2]) / size) % 2 : 0;
                return (a + b + c) % 2 ? second : first;
            };
        }
        await construct(shape, paint, args[length], current, total, prepare);
    }

    function* path(start, end, width, height) {
        const delta = end.map((value, index) => Math.abs(value - start[index])), step = end.map((value, index) => Math.sign(value - start[index]));
        const length = Math.max(...delta), error = delta.map(() => Math.floor(length / 2));
        const point = start.slice(), offset = Math.floor(width / 2), tail = width - offset - 1;
        let previous, prior;
        for (let i = 0; i <= length; i++) {
            const low = [point[0] - offset, point[1], point[2] - offset], high = [point[0] + tail, point[1] + (height - 1), point[2] + tail];
            if (!previous) yield* box(low, high);
            else yield* difference(low, high, low.map((value, index) => Math.max(value, previous[index])), high.map((value, index) => Math.min(value, prior[index])));
            if (i === length) break;
            previous = low;
            prior = high;
            for (let j = 0; j < 3; j++) {
                error[j] -= delta[j];
                if (error[j] < 0) { point[j] += step[j]; error[j] += length; }
            }
        }
    }

    async function line(args, current) {
        let { start, end, low, high } = coordinates(args, 6);
        arity(args, 9);
        const type = block(args[6]), width = positive(args[7]), height = positive(args[8]);
        const offset = Math.floor(width / 2), tail = width - offset - 1;
        const a = [low[0] - offset, low[1], low[2] - offset], b = [high[0] + tail, high[1] + (height - 1), high[2] + tail];
        const delta = high.map((value, index) => value - low[index]);
        if ([...a, ...b, ...delta].some(value => !Number.isSafeInteger(value)) || !Number.isSafeInteger(width * width * height + (delta[0] + delta[2]) * width * height + delta[1] * width * width)) throw Error('ERROR: Coordinates or size exceed numeric precision');
        const order = start.findIndex((value, index) => value !== end[index]);
        if (order >= 0 && start[order] > end[order]) [start, end] = [end, start];
        await construct(() => path(start, end, width, height), type, args[9], current);
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
        await construct(() => spans(kind, radius, height, center, mode === 'h'), types.get(id), args[length], current);
    }

    async function construct(shape, type, approval, current, total, prepare) {
        let count = total;
        if (count === undefined) {
            current.label = 'Checking shape';
            current.report();
            count = 0;
            let steps = 0, time = performance.now();
            for (const span of shape()) {
                count += span[3];
                if (approval !== 'true' && count > CONFIRM) confirm(count, approval);
                if (count > WARNING) break;
                if (++steps % 256 === 0 && performance.now() - time >= 6) {
                    if (current.cancelled) return;
                    current.done = count;
                    current.report();
                    await wait();
                    time = performance.now();
                }
            }
            if (count <= WARNING) total = count;
        }
        if (current.cancelled) return;
        confirm(count, approval);
        if (!await warn(count, current)) return;
        if (prepare) type = prepare();
        current.label = 'Building';
        current.done = 0;
        current.total = total;
        current.blocks = true;
        await build(shape(), type, current);
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

    async function map(args, current) {
        const { low, high } = coordinates(args, 4);
        if (args.length > 5 || (args[4] && !/^[a-z0-9_-]+$/i.test(args[4]))) return 'ERROR: Invalid filename';
        bounds(low, high);
        const width = high[0] - low[0] + 1, height = high[1] - low[1] + 1;
        if (!await warn(Math.max(width * height, engine.world.size), current)) return;
        const canvas = document.createElement('canvas');
        let url;
        try {
            canvas.width = width;
            canvas.height = height;
            if (canvas.width !== width || canvas.height !== height) throw Error();
            const context = canvas.getContext('2d');
            if (!context) throw Error();
            await inspect(async world => {
                const top = new Map();
                current.label = 'Scanning world';
                current.total = world.size;
                current.report();
                let time = performance.now(), steps = 0;
                for (const cell of world.values()) {
                    if (current.cancelled) return;
                    const { x, y, z } = cell;
                    if (x >= low[0] && x <= high[0] && z >= low[1] && z <= high[1]) {
                        const index = (z - low[1]) * width + (x - low[0]);
                        if (!top.has(index) || top.get(index).y < y) top.set(index, cell);
                    }
                    current.done++;
                    if (++steps % 256 === 0 && performance.now() - time >= 6) {
                        current.report();
                        await wait();
                        time = performance.now();
                    }
                }
                if (current.cancelled) return;
                const colors = top.size ? shades('catalog').map(({ r, g, b }) => `rgb(${r},${g},${b})`) : [];
                current.label = 'Drawing map';
                current.done = 0;
                current.total = top.size;
                current.report();
                let type;
                for (const [index, cell] of top) {
                    if (current.cancelled) return;
                    if (type !== cell.type) { type = cell.type; context.fillStyle = colors[type]; }
                    context.fillRect(index % width, Math.floor(index / width), 1, 1);
                    if (++current.done % 256 === 0 && performance.now() - time >= 6) {
                        current.report();
                        await wait();
                        time = performance.now();
                    }
                }
            });
            if (current.cancelled) return;
            current.message = 'Encoding map… · Esc to cancel';
            refresh();
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (current.cancelled) return;
            if (!blob?.size) throw Error();
            url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${args[4] || 'map'}.png`;
            link.click();
        } catch (failure) {
            return failure.message?.startsWith('ERROR:') ? failure.message : 'ERROR: Unable to export map or allocate resources';
        } finally {
            canvas.width = canvas.height = 0;
            if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
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

    function shades(colors) {
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw Error('ERROR: Unable to read pixels');
        const shades = [], catalog = colors === 'catalog';
        try {
            ASSETS.forEach((name, type) => {
                if (!catalog && !colored(name)) return;
                if (colors === 'blackwhite' && !/^(black|gray|white)_/.test(name)) return;
                const texture = engine.parts[type].material.map.image;
                if (!texture?.width) throw Error('ERROR: Block textures are not ready');
                canvas.width = texture.width;
                canvas.height = texture.height;
                context.drawImage(texture, 0, 0);
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let r = 0, g = 0, b = 0;
                if (catalog) {
                    const counts = new Map();
                    let best = 0, color = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        if (!pixels[i + 3]) continue;
                        const key = pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2], count = (counts.get(key) || 0) + 1;
                        counts.set(key, count);
                        if (count > best) { best = count; color = key; }
                    }
                    r = color >> 16; g = color >> 8 & 255; b = color & 255;
                } else {
                    for (let i = 0; i < pixels.length; i += 4) { r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2]; }
                    const count = pixels.length / 4;
                    r /= count; g /= count; b /= count;
                }
                shades.push({ type, r, g, b });
            });
            return shades;
        } finally { canvas.width = canvas.height = 0; }
    }

    function match(shades) {
        const cache = new Map();
        return (r, g, b, key = r * 65536 + g * 256 + b) => {
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
            const shade = match(shades(colors));
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