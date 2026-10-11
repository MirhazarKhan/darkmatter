var assert = require('assert');
var create = require('../src/core/redCamera').create;
var cinematic = require('../src/core/cinematic');
var createTailCamera = require('../src/core/tailCamera').create;
var checks = 0;
var eye = { x: 0, y: 50, z: 600 };
var aim = { x: 0, y: 50, z: 0 };
var tail = { x: 38, y: 72, z: 105, lookX: 50, lookY: 58, lookZ: -18, gap: 78 };
var fields = ['x', 'y', 'z', 'lookX', 'lookY', 'lookZ', 'radius', 'azimuth', 'elevation', 'dolly', 'turn', 'dock', 'arcLift'];

function test(name, run) {
    run(); checks += 1; console.log('PASS ' + name);
}

function near(actual, expected, tolerance) {
    assert.ok(Math.abs(actual - expected) <= (tolerance || 1e-8), actual + ' should equal ' + expected);
}

function finite(pose) {
    fields.forEach(function (key) {
        assert.ok(Number.isFinite(pose[key]), key + ' must remain finite');
    });
    assert.ok(pose.radius >= 0, 'radius must not become negative');
}

function copy(pose) { return Object.assign({}, pose); }

function distance(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
}

function nearPose(a, b, tolerance) {
    ['x', 'y', 'z', 'lookX', 'lookY', 'lookZ'].forEach(function (key) { near(a[key], b[key], tolerance); });
}

function heading(pose) { return Math.atan2(pose.x - pose.lookX, pose.z - pose.lookZ) * 180 / Math.PI; }

function angularStep(from, to) { return ((to - from + 180) % 360 + 360) % 360 - 180; }

// Reproduce the live emitter's simulation clock and smoothing, then use the
// actual tail-camera history. A static endpoint cannot expose rush-driven laps.
function createEmitter(seed, aspect, mobile) {
    var time = seed, center = { x: 0, y: 0, z: 0 }, chase = createTailCamera();
    return function (wallDt, progress) {
        var phase = cinematic.sample(0.5 + progress * 0.5, false);
        var dt = Math.min(50, wallDt * phase.timeScale);
        var fluidRush = phase.rush + phase.handoffRush + phase.ringRush;
        var speed = 0.85 + fluidRush * 0.45 + phase.red * 0.15;
        time += dt * 0.001 * speed;
        var r = mobile ? 100 : 200, h = mobile ? 40 : 60;
        var response = 1 - Math.pow(0.8, dt / 16.6667);
        center.x += (Math.cos(time) * r - center.x) * response;
        center.y += (Math.cos(time * 4) * h - center.y) * response;
        center.z += (Math.sin(time * 2) * r - center.z) * response;
        return chase.update(center, dt, aspect);
    };
}

test('the first frame preserves the captured title camera and focus exactly', function () {
    var controller = create();
    assert.strictEqual(controller.hasStart(), false);
    controller.begin(eye, aim);
    assert.strictEqual(controller.hasStart(), true);
    var first = controller.update(tail, 0, 16, 1.5);
    nearPose(first, { x: eye.x, y: eye.y, z: eye.z, lookX: aim.x, lookY: aim.y, lookZ: aim.z });
    finite(first);
});

test('captured poses are independent of later changes to the source vectors', function () {
    var controller = create(), mutableEye = copy(eye), mutableAim = copy(aim);
    controller.begin(mutableEye, mutableAim);
    mutableEye.x = 1000; mutableEye.z = -1000; mutableAim.y = -1000;
    nearPose(controller.update(tail, 0, 16, 1), { x: eye.x, y: eye.y, z: eye.z, lookX: aim.x, lookY: aim.y, lookZ: aim.z });
});

test('docking ends exactly on the live chase pose without an additional perspective jump', function () {
    var controller = create(); controller.begin(eye, aim);
    for (var i = 0; i < 180; i++) controller.update(tail, i / 180, 16, 1.5);
    var last = copy(controller.update(tail, 1, 16, 1.5));
    nearPose(last, tail);
    var moved = copy(tail); moved.x += 3; moved.lookY += 2;
    nearPose(controller.update(moved, 1, 16, 1.5), moved);
    finite(last);
});

test('the route approaches both held scenes continuously in either direction', function () {
    var controller = create(); controller.begin(eye, aim);
    var first = copy(controller.update(tail, 0, 16, 1));
    var entering = copy(controller.update(tail, 0.00001, 16, 1));
    assert.ok(distance(first, entering) < 0.01, 'entering the route must not jump away from the title');
    var settled = copy(controller.update(tail, 1, 16, 1));
    var leaving = copy(controller.update(tail, 0.99999, 16, 1));
    assert.ok(distance(settled, leaving) < 0.01, 'reversing must not jump away from the chase');
    nearPose(controller.update(tail, 0, 16, 1), first);
});

test('the shot accelerates gently from rest and brakes before the final camera handoff', function () {
    var controller = create(); controller.begin(eye, aim);
    var start = copy(controller.update(tail, 0, 16, 1));
    var startNear = copy(controller.update(tail, 0.03, 16, 1));
    var startFar = copy(controller.update(tail, 0.04, 16, 1));
    assert.ok(distance(start, startNear) < distance(start, startFar) * 0.2,
        'the first dolly frames should accelerate from rest instead of arriving at full speed');
    var endFar = copy(controller.update(tail, 0.98, 16, 1));
    var endNear = copy(controller.update(tail, 0.99, 16, 1));
    var end = copy(controller.update(tail, 1, 16, 1));
    assert.ok(distance(endNear, end) < distance(endFar, end) * 0.2,
        'the final frames should brake into the chase rather than hit a different camera pose');
});

test('forward and reverse playback remain finite with no one-frame relocation', function () {
    var controller = create(); controller.begin(eye, aim);
    [1, -1].forEach(function (direction) {
        var previous = null;
        for (var i = 0; i <= 300; i++) {
            var progress = direction > 0 ? i / 300 : 1 - i / 300;
            var pose = copy(controller.update(tail, progress, 10, 1.5));
            finite(pose);
            if (previous) assert.ok(distance(previous, pose) < 30, 'a frame must move along the route instead of relocating the camera');
            previous = pose;
        }
    });
});

test('the authored shot advances its dolly and turn before settling into the wake', function () {
    var controller = create(); controller.begin(eye, aim);
    var early = copy(controller.update(tail, 0.2, 16, 1));
    assert.ok(early.dolly > early.turn && early.turn > 0, 'the opening move should lead with the push before the full perspective turn');
    near(early.dock, 0);
    var middle = copy(controller.update(tail, 0.5, 16, 1));
    assert.ok(middle.arcLift > 15, 'the perspective change should have a deliberate upward arc');
    near(middle.dock, 0);
    var landing = copy(controller.update(tail, 0.8, 16, 1));
    assert.ok(landing.dock > 0 && landing.arcLift < middle.arcLift, 'the arc should descend while the camera docks behind the particles');
    var final = controller.update(tail, 1, 16, 1);
    near(final.dolly, 1); near(final.turn, 1); near(final.dock, 1); near(final.arcLift, 0);
});

test('the arc is a single bounded rise and all timeline phases advance monotonically', function () {
    var controller = create(); controller.begin(eye, aim);
    var previous = null, descending = false;
    for (var i = 0; i <= 600; i++) {
        var pose = copy(controller.update(tail, i / 600, 5, 1));
        ['dolly', 'turn', 'dock'].forEach(function (key) {
            assert.ok(pose[key] >= 0 && pose[key] <= 1, key + ' must stay on its timeline');
            if (previous) assert.ok(pose[key] >= previous[key], key + ' must not replay midway through the shot');
        });
        assert.ok(pose.arcLift >= -1e-8 && pose.arcLift <= 26 + 1e-8, 'the elevation arc must stay restrained');
        if (previous && pose.arcLift < previous.arcLift - 1e-8) descending = true;
        if (previous && descending) assert.ok(pose.arcLift <= previous.arcLift + 1e-8, 'a second rise would create an unintended perspective correction');
        previous = pose;
    }
    assert.ok(descending, 'the shot must land after rising');
});

test('pausing freezes target tracking and resuming continues from the same pose', function () {
    var controller = create(); controller.begin(eye, aim);
    controller.update(tail, 0.5, 16, 1);
    var before = copy(controller.update(tail, 0.5, 0, 1));
    var moved = copy(tail); moved.x += 80; moved.lookX += 80;
    for (var i = 0; i < 30; i++) nearPose(controller.update(moved, 0.5, 0, 1), before);
    var resumed = controller.update(moved, 0.5, 16, 1);
    assert.ok(distance(before, resumed) > 0, 'resuming should follow the new live target');
    assert.ok(distance(before, resumed) < 15, 'resuming must damp the target change');
});

test('target damping follows elapsed real time independently of frame rate', function () {
    var fine = create(), coarse = create(); fine.begin(eye, aim); coarse.begin(eye, aim);
    fine.update(tail, 0.5, 0, 1); coarse.update(tail, 0.5, 0, 1);
    var moved = copy(tail); moved.x += 60; moved.lookX += 60;
    var finePose, coarsePose;
    for (var i = 0; i < 60; i++) finePose = fine.update(moved, 0.5, 10, 1);
    for (var j = 0; j < 20; j++) coarsePose = coarse.update(moved, 0.5, 30, 1);
    nearPose(finePose, coarsePose, 1e-6);
});

test('a background-tab frame gap cannot fast-forward target tracking', function () {
    var normal = create(), stalled = create(); normal.begin(eye, aim); stalled.begin(eye, aim);
    normal.update(tail, 0.55, 0, 1); stalled.update(tail, 0.55, 0, 1);
    var moved = copy(tail); moved.y += 80; moved.lookY += 80;
    nearPose(normal.update(moved, 0.55, 50, 1), stalled.update(moved, 0.55, 100000, 1));
});

test('crossing the negative z heading seam does not reverse the turn', function () {
    function angularTail(degrees) {
        var angle = degrees * Math.PI / 180;
        return { x: Math.sin(angle) * 128, y: 62, z: Math.cos(angle) * 128,
            lookX: 0, lookY: 50, lookZ: 0, gap: 78 };
    }
    [1, -1].forEach(function (direction) {
        var controller = create(); controller.begin(eye, aim);
        var previous = copy(controller.update(angularTail(178 * direction), 0.75, 16, 1));
        var signedChange = 0;
        for (var degrees = 179; degrees <= 185; degrees++) {
            var pose = copy(controller.update(angularTail(degrees * direction), 0.75, 16, 1));
            var change = pose.azimuth - previous.azimuth;
            assert.ok(Math.abs(change) < 2, 'heading wrap must not introduce a whole turn');
            if (degrees > 180) assert.ok(change * direction >= -1e-8, 'the camera must continue its established turn across the seam');
            signedChange += change;
            assert.ok(distance(previous, pose) < 25, 'wrapped headings must have a continuous physical route');
            previous = pose;
        }
        assert.ok(signedChange * direction > 0, 'the continuous turn must advance');
    });
});

test('the actual accelerated emitter cannot turn the authored rush into a camera orbit', function () {
    var wallDt = 1000 / 60;
    [{ aspect: 1.5, mobile: false }, { aspect: 0.55, mobile: true }].forEach(function (screen) {
        for (var seed = 0; seed < 8; seed++) {
            var emitter = createEmitter(seed * Math.PI / 4, screen.aspect, screen.mobile);
            var liveTail;
            for (var warm = 0; warm < 1000; warm++) liveTail = emitter(wallDt, 0);
            var controller = create(); controller.begin(eye, aim);
            var previous = heading(controller.update(liveTail, 0, wallDt, screen.aspect));
            var rushTravel = 0, fullTravel = 0;
            for (var frame = 1; frame <= 180; frame++) {
                var progress = frame / 180;
                liveTail = emitter(wallDt, progress);
                var pose = controller.update(liveTail, progress, wallDt, screen.aspect);
                finite(pose);
                var current = heading(pose), step = Math.abs(angularStep(previous, current));
                fullTravel += step;
                if (progress <= 0.64) rushTravel += step;
                previous = current;
            }
            assert.ok(rushTravel < 90, 'emitter phase ' + seed + ' rotated the rush ' + rushTravel.toFixed(1) + ' degrees before the docking brake');
            assert.ok(fullTravel < 360, 'emitter phase ' + seed + ' added a full camera orbit: ' + fullTravel.toFixed(1) + ' degrees');
            nearPose(controller.update(liveTail, 1, wallDt, screen.aspect), liveTail);
        }
    });
});

test('held chase laps cannot accumulate extra camera spins when reversing to the title', function () {
    function loopTail(degrees) {
        var radians = degrees * Math.PI / 180;
        return { x: Math.sin(radians) * 128, y: 62, z: Math.cos(radians) * 128,
            lookX: 0, lookY: 50, lookZ: 0, gap: 78 };
    }
    [1, 4, 8].forEach(function (loops) {
        var controller = create(); controller.begin(eye, aim);
        var liveTail = loopTail(27), pose;
        for (var frame = 0; frame <= 180; frame++) pose = controller.update(liveTail, frame / 180, 1000 / 60, 1);
        for (var held = 1; held <= loops * 180; held++) {
            liveTail = loopTail(27 + held * 2);
            pose = controller.update(liveTail, 1, 1000 / 60, 1);
            nearPose(pose, liveTail);
        }
        assert.ok(Math.abs(pose.azimuth) < 360, 'held target laps must not be retained as hidden camera turns');
        var previous = heading(pose), angularTravel = 0;
        for (var reverse = 1; reverse <= 132; reverse++) {
            pose = controller.update(liveTail, 1 - reverse / 132, 1000 / 60, 1);
            finite(pose);
            var current = heading(pose);
            angularTravel += Math.abs(angularStep(previous, current));
            previous = current;
        }
        assert.ok(angularTravel < 360, loops + ' held laps created an extra reverse camera orbit: ' + angularTravel.toFixed(1) + ' degrees');
        nearPose(pose, { x: eye.x, y: eye.y, z: eye.z, lookX: aim.x, lookY: aim.y, lookZ: aim.z });
    });
});

test('reset and replay capture a new title view without carrying stale chase tracking', function () {
    var controller = create(); controller.begin(eye, aim);
    for (var i = 0; i <= 180; i++) controller.update(tail, i / 180, 16, 1);
    controller.reset(); assert.strictEqual(controller.hasStart(), false);
    var nextEye = { x: 22, y: 68, z: 740 }, nextAim = { x: 3, y: 51, z: 4 };
    controller.begin(nextEye, nextAim);
    var fresh = create(); fresh.begin(nextEye, nextAim);
    [0, 0.2, 0.6, 1].forEach(function (progress) {
        nearPose(controller.update(tail, progress, 16, 1), fresh.update(tail, progress, 16, 1));
    });
});

test('auto initialization keeps the title visible at wide and narrow aspects', function () {
    var wide = create().update(tail, 0, 16, 2.4);
    var narrow = create().update(tail, 0, 16, 0.45);
    finite(wide); finite(narrow);
    assert.ok(wide.z > 0 && narrow.z > 0, 'the default title camera must face the scene');
    assert.ok(narrow.radius > wide.radius, 'portrait screens need more distance for the same title framing');
    [0.35, 0.6, 1, 2.4, 4].forEach(function (aspect) {
        var controller = create();
        for (var i = 0; i <= 200; i++) finite(controller.update(tail, i / 200, 16, aspect));
        nearPose(controller.update(tail, 1, 16, aspect), tail);
    });
});

test('malformed inputs are contained before they reach the live camera', function () {
    [undefined, null, NaN, Infinity, -Infinity, 'invalid', -1e30, 1e30].forEach(function (bad) {
        var controller = create();
        controller.begin({ x: bad, y: bad, z: bad }, { x: bad, y: bad, z: bad });
        finite(controller.update({ x: bad, y: bad, z: bad, lookX: bad, lookY: bad, lookZ: bad, gap: bad }, bad, bad, bad));
    });
    finite(create().update(null, 0.5, 16, 1));
    finite(create().update({}, 0.5, 16, 1));
    var extreme = create();
    extreme.begin({ x: Number.MAX_VALUE, y: 50, z: Number.MAX_VALUE }, { x: -Number.MAX_VALUE, y: 50, z: 0 });
    finite(extreme.update({ x: -Number.MAX_VALUE, y: Number.MAX_VALUE, z: 0,
        lookX: Number.MAX_VALUE, lookY: -Number.MAX_VALUE, lookZ: 0, gap: 78 }, 0.5, 16, 1));
});

console.log(checks + ' red perspective choreography checks passed.');
