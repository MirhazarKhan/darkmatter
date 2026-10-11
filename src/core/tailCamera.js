// Follow the wake on the same clock as its emission. No GPU readback is needed.
exports.create = function () {
    var history = [], time = 0;
    var tail = {}, older = {}, newer = {};
    var forward = { x: 0, y: 0, z: -1 };
    var pose = { x: 0, y: 12, z: 78, lookX: 0, lookY: 0, lookZ: -50, gap: 78, samples: 0 };

    function sample(age, out) {
        var wanted = time - age, a = history[0], b = a;
        for (var i = 1; i < history.length; i++) {
            b = history[i];
            if (b.time >= wanted) break;
            a = b;
        }
        var mix = Math.max(0, Math.min(1, (wanted - a.time) / Math.max(0.001, b.time - a.time)));
        out.x = a.x + (b.x - a.x) * mix;
        out.y = a.y + (b.y - a.y) * mix;
        out.z = a.z + (b.z - a.z) * mix;
    }

    function update(center, dt, aspect) {
        if (!center || !isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) return pose;
        dt = Math.max(0, Math.min(50, Number(dt) || 0));
        time += dt;
        if (!history.length || time - history[history.length - 1].time >= 16) {
            history.push({ time: time, x: center.x, y: center.y, z: center.z });
        }
        while (history.length > 2 && history[1].time < time - 1600) history.shift();

        sample(1000, tail);
        sample(1150, older);
        sample(850, newer);
        var dx = newer.x - older.x, dy = newer.y - older.y, dz = newer.z - older.z;
        var length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (length > 0.01 && dt > 0) {
            var ease = 1 - Math.exp(-dt / 100);
            forward.x += (dx / length - forward.x) * ease;
            forward.y += (dy / length - forward.y) * ease;
            forward.z += (dz / length - forward.z) * ease;
            length = Math.sqrt(forward.x * forward.x + forward.y * forward.y + forward.z * forward.z);
            forward.x /= length; forward.y /= length; forward.z /= length;
        }

        // Attraction bends older particles toward the present emitter.
        tail.x += (center.x - tail.x) * 0.18;
        tail.y += (center.y - tail.y) * 0.18;
        tail.z += (center.z - tail.z) * 0.18;
        var rightLength = Math.sqrt(forward.x * forward.x + forward.z * forward.z);
        var rightX = rightLength > 0.01 ? -forward.z / rightLength : 1;
        var rightZ = rightLength > 0.01 ? forward.x / rightLength : 0;
        var narrow = Math.max(0, Math.min(1, (1 - (Number(aspect) || 1)) / 0.5));
        var setback = 78 + narrow * 14;
        pose.x = tail.x - forward.x * setback + rightX * 9;
        pose.y = tail.y - forward.y * setback + 12;
        pose.z = tail.z - forward.z * setback + rightZ * 9;
        pose.lookX = tail.x + forward.x * 50;
        pose.lookY = tail.y + forward.y * 50;
        pose.lookZ = tail.z + forward.z * 50;
        pose.gap = setback;
        pose.samples = history.length;
        return pose;
    }

    function reset() {
        history.length = 0; time = 0;
        forward.x = forward.y = 0; forward.z = -1;
        pose.samples = 0;
    }

    return { update: update, reset: reset };
};
