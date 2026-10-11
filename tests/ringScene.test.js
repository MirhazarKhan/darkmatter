var assert = require('assert');
var cinematic = require('../src/core/cinematic');
var cameraPath = require('../src/core/cameraPath');
var checks = 0;

function test(name, run) {
    run();
    checks += 1;
    console.log('PASS ' + name);
}

function near(actual, expected, tolerance) {
    assert.ok(Math.abs(actual - expected) <= (tolerance || 1e-9), actual + ' should equal ' + expected);
}

function finiteFields(value) {
    Object.keys(value).forEach(function (key) {
        assert.ok(Number.isFinite(value[key]), key + ' must stay finite');
    });
}

test('adding a fourth scene preserves the three established held scenes', function () {
    var arrival = cinematic.sample(0, false);
    assert.strictEqual(arrival.timeScale, 1);
    assert.strictEqual(arrival.nameOpacity, 1);
    assert.strictEqual(arrival.darkness, 0);
    var dark = cinematic.sample(0.5, false);
    assert.strictEqual(dark.timeScale, 0.14);
    assert.strictEqual(dark.formation, 0.42);
    assert.strictEqual(dark.reveal, 1);
    assert.strictEqual(dark.red, 0);
    var red = cinematic.sample(1, false);
    assert.strictEqual(red.timeScale, 0.12);
    assert.strictEqual(red.formation, 0);
    assert.strictEqual(red.red, 1);
    assert.strictEqual(red.tailFollow, 1);
    assert.strictEqual(red.transitionBlur, 0);
    [arrival, dark, red].forEach(function (phase) {
        assert.strictEqual(phase.ringFormation, 0);
        assert.strictEqual(phase.ringSilver, 0);
        assert.strictEqual(phase.ringCamera, 0);
        assert.strictEqual(phase.ringRush, 0);
    });
});

test('the ring bridge is continuous from the red chase with no palette or speed jump', function () {
    var held = cinematic.sample(1, false), entered = cinematic.sample(1 + 1e-8, false);
    Object.keys(held).forEach(function (key) { near(entered[key], held[key], 1e-6); });
});

test('gathering never replays the opening and all fourth-scene forces stay bounded', function () {
    var held = cinematic.sample(1, false);
    var inherited = ['openingProgress', 'chapterProgress', 'nextProgress', 'departure', 'rush', 'darkness',
        'reveal', 'formation', 'travel', 'nameOpacity', 'wipe', 'red', 'arc', 'handoffRush',
        'handoffBrake', 'handoffTravel', 'tailFollow'];
    var weights = ['orbitProgress', 'ringFormation', 'ringCamera', 'ringSilver', 'ringRush', 'transitionBlur'];
    var previous = { ringFormation: 0, ringCamera: 0, ringSilver: 0 };
    for (var i = 0; i <= 10000; i++) {
        var phase = cinematic.sample(1 + i / 20000, false);
        finiteFields(phase);
        inherited.forEach(function (key) { assert.strictEqual(phase[key], held[key], 'replayed ' + key); });
        weights.forEach(function (key) { assert.ok(phase[key] >= 0 && phase[key] <= 1, key + ' out of range'); });
        assert.ok(phase.timeScale > 0 && phase.timeScale <= 2.4, 'unbounded simulation step');
        Object.keys(previous).forEach(function (key) {
            assert.ok(phase[key] >= previous[key], key + ' must gather without oscillating');
            previous[key] = phase[key];
        });
    }
});

test('the held fourth scene is fully formed silver with fluid motion and no transition blur', function () {
    var held = cinematic.sample(1.5, false);
    assert.strictEqual(held.ringFormation, 1);
    assert.strictEqual(held.ringCamera, 1);
    assert.strictEqual(held.ringSilver, 1);
    assert.strictEqual(held.ringRush, 0);
    assert.strictEqual(held.transitionBlur, 0);
    assert.ok(held.timeScale > cinematic.sample(1, false).timeScale, 'living form must move beyond the slow chase');
    assert.deepStrictEqual(cinematic.sample(100, false), held);
});

test('reduced motion gathers and reveals silver without a kinetic rush or extra blur', function () {
    for (var i = 0; i <= 3000; i++) {
        var phase = cinematic.sample(i / 2000, true);
        finiteFields(phase);
        assert.strictEqual(phase.timeScale, 0.16);
        assert.strictEqual(phase.rush + phase.handoffRush + phase.ringRush, 0);
        assert.strictEqual(phase.transitionBlur, 0);
        assert.strictEqual(phase.tailFollow, 0);
    }
    assert.strictEqual(cinematic.sample(1.5, true).ringSilver, 1);
    assert.strictEqual(cinematic.sample(1, true).ringCamera, 0);
    assert.strictEqual(cinematic.sample(1 + 1e-8, true).ringCamera, 1, 'reduced mode must avoid animated pullback');
});

test('malformed progress cannot leak non-finite shader weights', function () {
    [undefined, null, NaN, Infinity, -Infinity, 'invalid', -1e30, 1e30].forEach(function (input) {
        [true, false].forEach(function (reduced) {
            var phase = cinematic.sample(input, reduced);
            finiteFields(phase);
            assert.ok(phase.progress >= 0 && phase.progress <= 1.5);
        });
    });
});

test('ring framing stays in front of the lens and outside the form at wide and narrow aspects', function () {
    [0.2, 0.35, 365 / 616, 871 / 807, 2.4, 4].forEach(function (aspect) {
        for (var i = 0; i <= 2000; i++) {
            var pose = cameraPath.sampleRing(i * 0.05, aspect, false);
            finiteFields(pose);
            assert.ok(pose.radius >= 670, 'eye must stay outside the ring volume');
            assert.ok(pose.z > pose.radius * 0.95, 'orbit must retain the reference-facing view');
            near(Math.sqrt(pose.x * pose.x + pose.y * pose.y + pose.z * pose.z), pose.radius, 1e-8);
        }
    });
    assert.ok(cameraPath.sampleRing(0, 365 / 616, false).radius > cameraPath.sampleRing(0, 2.4, false).radius,
        'narrow framing must pull back to preserve the ring silhouette');
});

test('reduced ring camera is stationary while normal framing has a gentle bounded orbit', function () {
    var frozen = cameraPath.sampleRing(0, 1, true);
    assert.deepStrictEqual(cameraPath.sampleRing(100, 1, true), frozen);
    var a = cameraPath.sampleRing(1, 1, false), b = cameraPath.sampleRing(1.01, 1, false);
    var movement = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
    assert.ok(movement > 0 && movement < 0.25, 'orbit must move continuously without jerking');
});

test('invalid camera inputs fall back to a finite visible ring framing', function () {
    [undefined, null, NaN, Infinity, -Infinity, 'invalid'].forEach(function (value) {
        var pose = cameraPath.sampleRing(value, value, false);
        finiteFields(pose);
        assert.ok(pose.radius >= 670 && pose.z > 0);
    });
});

console.log(checks + ' ring choreography checks passed.');
