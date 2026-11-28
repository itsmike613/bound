import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

export function controls(engine) {
    const { SIZE, RADIUS, ASSETS, types, canvas, camera, key, asset, add, remove, aim } = engine;
    const EYE = 1.76;
    const HEIGHT = 2;

    const palette = document.querySelector('#palette');
    const tabs = document.querySelectorAll('.heading button');
    const number = document.querySelector('#number');
    const coords = document.querySelector('#coords');
    const mode = document.querySelector('#mode');

    const tiles = [];
    const inventory = new Set();
    let chosen = 0, section = 0;

    function storage() {
        const value = localStorage.getItem('bound');
        try {
            const data = JSON.parse(value);
            if (data && typeof data === 'object' && !Array.isArray(data)) return data;
        } catch { }
        return {};
    }

    try {
        const ids = storage().inventory;
        if (Array.isArray(ids)) for (const id of ids) if (types.has(id)) inventory.add(id);
    } catch { }

    function select(index) {
        tiles[chosen].classList.remove('selected');
        chosen = index;
        tiles[chosen].classList.add('selected');
        number.textContent = ASSETS[chosen];
        if (!tiles[chosen].hidden) tiles[chosen].scrollIntoView({ block: 'nearest' });
    }

    function show(index) {
        if (section === index) return;
        section = index;
        tabs.forEach((tab, index) => tab.setAttribute('aria-pressed', index === section));
        palette.classList.toggle('inventory', !!section);
        tiles.forEach((tile, index) => tile.hidden = !!section && !inventory.has(ASSETS[index]));
        palette.scrollTop = 0;
        if (!tiles[chosen].hidden) tiles[chosen].scrollIntoView({ block: 'nearest' });
    }

    function toggle(index) {
        const id = ASSETS[index], owned = !inventory.delete(id);
        if (owned) inventory.add(id);
        tiles[index].classList.toggle('owned', owned);
        tiles[index].hidden = !!section && !owned;
        if (owned && section && index === chosen) tiles[index].scrollIntoView({ block: 'nearest' });
        try {
            const data = storage();
            data.inventory = ASSETS.filter(id => inventory.has(id));
            localStorage.setItem('bound', JSON.stringify(data));
        } catch { }
    }

    function cycle(step) {
        if (section && !inventory.size) return;
        let index = chosen;
        do {
            index = (index + step + ASSETS.length) % ASSETS.length;
            if (!tiles[index].hidden) { select(index); return; }
        } while (index !== chosen);
    }

    ASSETS.forEach((name, index) => {
        const tile = document.createElement('button');
        tile.className = inventory.has(name) ? 'tile owned' : 'tile';
        tile.type = 'button';
        tile.title = name;
        tile.style.setProperty('--img', `url("${new URL(asset(name), location.href)}")`);
        tile.innerHTML = '<span class="cube"><span class="face front"></span><span class="face right"></span><span class="face top"></span></span>';
        tile.addEventListener('click', () => select(index));
        palette.append(tile);
        tiles.push(tile);
    });

    tabs.forEach((tab, index) => tab.addEventListener('click', () => show(index)));
    palette.addEventListener('contextmenu', event => {
        event.preventDefault();
        const tile = event.target.closest('.tile');
        if (tile && event.button === 2) toggle(tiles.indexOf(tile));
    });
    select(0);

    const body = new THREE.Vector3(SIZE / 2, 0, SIZE / 2);
    const speed = new THREE.Vector3();
    const keys = new Set();
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
            if (engine.world.has(key(a, b, c))) return true;
        }

        return false;
    }

    function safe(x, y, z) {
        if (y < 0 || engine.world.has(key(x, y, z))) return false;
        return !(body.x + RADIUS > x * SIZE && body.x - RADIUS < (x + 1) * SIZE && body.y < (y + 1) * SIZE && body.y + HEIGHT > y * SIZE && body.z + RADIUS > z * SIZE && body.z - RADIUS < (z + 1) * SIZE);
    }

    function place() {
        if (engine.loading) return;
        const hit = aim();
        if (!hit) return;
        const x = hit.x + (hit.ax || 0), y = hit.y + (hit.ay || 0), z = hit.z + (hit.az || 0);
        if (safe(x, y, z)) add(x, y, z, chosen);
    }

    function destroy() {
        if (engine.loading) return;
        const hit = aim();
        if (hit && hit.block) remove(hit.x, hit.y, hit.z);
    }

    function relocate(a, b, c) {
        if (blocked(a, b, c)) return false;
        body.set(a, b, c);
        speed.set(0, 0, 0);
        step = 0;
        grounded = !flying && blocked(a, b - .0002, c);
        return true;
    }

    camera.rotation.set(pitch, yaw, 0);

    function move(x, z) {
        if (!blocked(x, body.y, z)) { body.x = x; body.z = z; return true; }
        if (!flying && grounded && speed.y <= 0 && !blocked(body.x, body.y + SIZE, body.z) && !blocked(x, body.y + SIZE, z)) {
            body.y += SIZE; step -= SIZE; body.x = x; body.z = z; return true;
        }

        return false;
    }

    function update(dt, now) {
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
    }

    function bind(panel) {
        canvas.addEventListener('contextmenu', event => event.preventDefault());
        canvas.addEventListener('mousedown', event => {
            event.preventDefault();
            if (panel.active) return;
            if (document.pointerLockElement !== canvas) { canvas.requestPointerLock(); return; }
            if (event.button === 1) {
                const hit = aim();
                if (hit && hit.block) select(engine.world.get(key(hit.x, hit.y, hit.z)).type);
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
            if (panel.active) {
                if (event.code === 'Escape') { event.preventDefault(); panel.close(); }
                if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter') { event.preventDefault(); if (!event.repeat) panel.submit(); }
                return;
            }
            if (event.code === 'Escape' && !event.repeat && panel.cancel()) { event.preventDefault(); return; }
            if (event.key === '/' && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                keys.clear();
                buttons.clear();
                sprint = false;
                dash = 0;
                panel.open();
                return;
            }
            const shortcut = ['1', '2', '='].includes(event.key) && !event.ctrlKey && !event.altKey && !event.metaKey;
            if (shortcut || ['Space', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE'].includes(event.code)) event.preventDefault();
            const held = keys.has(event.code);
            keys.add(event.code);
            if (event.repeat || held) return;
            if (shortcut) {
                if (event.key === '=') toggle(chosen); else show(Number(event.key) - 1);
            }
            if (event.code === 'KeyQ') cycle(-1);
            if (event.code === 'KeyE') cycle(1);
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
            if (palette.contains(event.target) || panel.active) return;
            event.preventDefault();
            if (event.deltaY) cycle(Math.sign(event.deltaY));
        }, { passive: false });
    }

    return { body, get yaw() { return yaw; }, relocate, update, bind };
}