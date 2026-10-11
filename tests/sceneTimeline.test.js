var assert = require('assert');
var create = require('../src/core/sceneTimeline').create;
var checks = 0;

function test(name, run) {
    run();
    checks += 1;
    console.log('PASS ' + name);
}

function near(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' should equal ' + expected);
}

test('one request plays to an exact endpoint and holds it indefinitely', function () {
    var timeline = create();
    var transition = timeline.request(1, 100);
    assert.strictEqual(transition.kind, 'dark');
    assert.strictEqual(transition.duration, 3);
    near(transition.impactAt, 1.92);
    near(timeline.tick(1600).progress, 0.25);
    assert.strictEqual(timeline.tick(1600).scene, 0);
    var settled = timeline.tick(3100);
    assert.strictEqual(settled.running, false);
    assert.strictEqual(settled.scene, 1);
    near(settled.progress, 0.5);
    near(timeline.tick(500000).progress, 0.5);
});

test('rapid requests during playback are discarded without queuing', function () {
    var timeline = create();
    timeline.request(1, 0);
    for (var at = 1; at < 3000; at += 11) {
        assert.strictEqual(timeline.request(1, at), null);
        assert.strictEqual(timeline.request(-1, at), null);
    }
    var settled = timeline.tick(9000);
    assert.strictEqual(settled.scene, 1);
    assert.strictEqual(settled.transitionId, 1);
    assert.strictEqual(settled.running, false);
    var next = timeline.request(1, 9001);
    assert.strictEqual(next.transitionId, 2);
    assert.strictEqual(next.kind, 'red');
    near(next.impactAt, 1.92);
});

test('continuous wheel inertia remains blocked after a transition finishes', function () {
    var timeline = create();
    assert.strictEqual(timeline.wheel(20, 0), null);
    assert.strictEqual(timeline.wheel(24, 20), null);
    assert.strictEqual(timeline.wheel(1, 40).transitionId, 1);
    for (var at = 60; at < 6000; at += 20) {
        assert.strictEqual(timeline.wheel(100, at), null);
    }
    assert.strictEqual(timeline.tick(6000).scene, 1);
    assert.strictEqual(timeline.tick(6000).armed, false);
    assert.strictEqual(timeline.request(1, 6100), null);
    assert.strictEqual(timeline.wheel(20, 6240), null);
    assert.strictEqual(timeline.wheel(24, 6260), null);
    var next = timeline.wheel(1, 6280);
    assert.ok(next);
    assert.strictEqual(next.from, 1);
    assert.strictEqual(next.to, 2);
});

test('a single giant wheel event cannot skip a chapter', function () {
    var timeline = create();
    assert.strictEqual(timeline.wheel(1e50, 0).to, 1);
    assert.strictEqual(timeline.tick(100000).scene, 1);
    assert.strictEqual(timeline.tick(100000).transitionId, 1);
});

test('opposite wheel directions and separate gestures do not accumulate together', function () {
    var timeline = create();
    assert.strictEqual(timeline.wheel(30, 0), null);
    assert.strictEqual(timeline.wheel(-30, 20), null);
    assert.strictEqual(timeline.wheel(30, 40), null);
    assert.strictEqual(timeline.wheel(30, 400), null);
    assert.ok(timeline.wheel(15, 420));
});

test('held keys block the next chapter until release and a new key press', function () {
    var timeline = create();
    timeline.hold('key:PageDown');
    assert.ok(timeline.request(1, 0));
    assert.strictEqual(timeline.request(1, 400), null);
    assert.strictEqual(timeline.tick(3000).armed, false);
    assert.strictEqual(timeline.request(1, 5000), null);
    timeline.release('key:PageDown', 5100);
    assert.strictEqual(timeline.tick(5100).scene, 1);
    assert.strictEqual(timeline.tick(5100).running, false);
    assert.strictEqual(timeline.tick(5100).armed, true);
    timeline.hold('key:PageDown');
    assert.strictEqual(timeline.request(1, 5200).to, 2);
});

test('touch can initiate while held but must finish before rearming', function () {
    var timeline = create();
    timeline.hold('touch');
    assert.ok(timeline.request(1, 100));
    timeline.tick(3200);
    assert.strictEqual(timeline.request(1, 3300), null);
    timeline.release('touch', 3400);
    assert.strictEqual(timeline.tick(8000).scene, 1);
    timeline.hold('touch');
    assert.strictEqual(timeline.request(1, 8010).to, 2);
});

test('multiple contacts and duplicate holds require each distinct release', function () {
    var timeline = create();
    timeline.hold('key:PageDown');
    timeline.hold('key:PageDown');
    timeline.hold('touch');
    timeline.request(1, 0);
    timeline.tick(3000);
    timeline.release('key:PageDown', 3100);
    assert.strictEqual(timeline.request(1, 3110), null);
    timeline.release('touch', 3200);
    assert.ok(timeline.request(1, 3210));
});

test('reverse transitions preserve continuous progress and settle at prior chapters', function () {
    var timeline = create();
    timeline.seek(1, 0);
    var reverse = timeline.request(-1, 10);
    assert.strictEqual(reverse.kind, 'return');
    assert.strictEqual(reverse.duration, 2.2);
    assert.strictEqual(reverse.impactAt, null);
    near(timeline.tick(1110).progress, 0.75);
    near(timeline.tick(2210).progress, 0.5);
    timeline.request(-1, 2220);
    near(timeline.tick(4420).progress, 0);
    assert.strictEqual(timeline.request(-1, 5000), null);
});

test('pause excludes hidden time and cannot start another transition', function () {
    var timeline = create();
    timeline.hold('key:PageDown');
    timeline.request(1, 100);
    timeline.pause(1100);
    near(timeline.tick(11100).progress, 1 / 6);
    assert.strictEqual(timeline.tick(11100).paused, true);
    assert.strictEqual(timeline.request(1, 11100), null);
    assert.strictEqual(timeline.wheel(90, 11100), null);
    timeline.resume(12100);
    near(timeline.tick(13100).progress, 1 / 3);
    near(timeline.tick(14100).progress, 0.5);
    assert.strictEqual(timeline.tick(14100).armed, true);
    assert.ok(timeline.request(1, 14101));
});

test('repeated pause and resume calls do not change the frozen clock', function () {
    var timeline = create();
    timeline.request(1, 0);
    timeline.pause(1000);
    timeline.pause(2000);
    timeline.resume(4000);
    timeline.resume(5000);
    near(timeline.tick(6000).progress, 0.5);
    assert.strictEqual(timeline.tick(6000).running, false);
});

test('reduced motion uses a brief transition without impact cues', function () {
    var timeline = create({ reducedMotion: true });
    var transition = timeline.request(1, 0);
    assert.strictEqual(transition.duration, 0.4);
    assert.strictEqual(transition.impactAt, null);
    near(timeline.tick(200).progress, 0.25);
    near(timeline.tick(400).progress, 0.5);
    assert.strictEqual(timeline.request(1, 401).duration, 0.4);
});

test('reset cancels movement and clears gestures but keeps transition IDs unique', function () {
    var timeline = create();
    timeline.hold('touch');
    timeline.wheel(90, 0);
    timeline.reset(100);
    var initial = timeline.tick(10000);
    assert.strictEqual(initial.scene, 0);
    assert.strictEqual(initial.kind, null);
    assert.strictEqual(initial.armed, true);
    assert.strictEqual(initial.progress, 0);
    assert.strictEqual(timeline.request(1, 10001).transitionId, 2);
});

test('reset and seek discard an ongoing wheel tail until it becomes quiet', function () {
    var timeline = create();
    timeline.wheel(90, 0);
    timeline.wheel(90, 20);
    assert.strictEqual(timeline.reset(30).armed, false);
    for (var at = 40; at <= 1000; at += 20) {
        assert.strictEqual(timeline.wheel(90, at), null);
    }
    assert.strictEqual(timeline.tick(1000).progress, 0);
    assert.strictEqual(timeline.tick(1260).armed, true);
    assert.ok(timeline.wheel(90, 1270));
    assert.strictEqual(timeline.seek(0.5, 1280).armed, false);
    assert.strictEqual(timeline.wheel(90, 1300), null);
    assert.strictEqual(timeline.request(1, 1500), null);
    assert.strictEqual(timeline.tick(1560).armed, true);
    assert.strictEqual(timeline.wheel(90, 1570).to, 2);
});

test('reset with no active wheel gesture rearms immediately', function () {
    var timeline = create();
    timeline.request(1, 0);
    assert.strictEqual(timeline.reset(100).armed, true);
    assert.ok(timeline.request(1, 100));
    timeline.wheel(90, 120);
    assert.strictEqual(timeline.reset(400).armed, true);
    assert.ok(timeline.request(1, 400));
});

test('seeking retains exact progress and subsequent motion starts continuously', function () {
    var timeline = create();
    var sought = timeline.seek(0.6, 100);
    near(sought.progress, 0.6);
    assert.strictEqual(sought.scene, 1);
    near(timeline.request(1, 200).progress, 0.6);
    near(timeline.tick(1700).progress, 0.8);
    near(timeline.tick(3200).progress, 1);
    assert.strictEqual(timeline.request(1, 3300).kind, 'orbit');
});

test('invalid input and clocks remain finite and cannot reverse time', function () {
    var timeline = create({ forwardDuration: Infinity, quietMs: NaN, wheelThreshold: -1 });
    assert.strictEqual(timeline.request(NaN, NaN), null);
    assert.strictEqual(timeline.wheel(Infinity, 0), null);
    timeline.request(1, 100);
    var atOneSecond = timeline.tick(1100);
    near(timeline.tick(-100).progress, atOneSecond.progress);
    near(timeline.tick(Infinity).progress, atOneSecond.progress);
    near(timeline.tick(NaN).progress, atOneSecond.progress);
    timeline.seek(-Infinity, 2000);
    assert.strictEqual(timeline.tick(2000).progress, 0);
    assert.strictEqual(timeline.seek(20, 2100).progress, 1.5);
});

test('the orbit chapter takes its own convergence clock and holds the fourth endpoint', function () {
    var timeline = create();
    timeline.seek(1, 0);
    var orbit = timeline.request(1, 100);
    assert.strictEqual(orbit.kind, 'orbit');
    assert.strictEqual(orbit.from, 2);
    assert.strictEqual(orbit.to, 3);
    assert.strictEqual(orbit.duration, 4.2);
    near(orbit.impactAt, 2.352);
    near(timeline.tick(2200).progress, 1.25);
    assert.strictEqual(timeline.tick(2200).scene, 2);
    var settled = timeline.tick(4300);
    assert.strictEqual(settled.running, false);
    assert.strictEqual(settled.scene, 3);
    near(settled.progress, 1.5);
    near(timeline.tick(100000).progress, 1.5);
    assert.strictEqual(timeline.request(1, 100001), null);
});

test('orbit timing is configurable without changing the previous scenes or reverse clock', function () {
    var timeline = create({ orbitDuration: 5.5 });
    assert.strictEqual(timeline.request(1, 0).duration, 3);
    timeline.seek(0.5, 100);
    assert.strictEqual(timeline.request(1, 110).duration, 3);
    timeline.seek(1, 200);
    var orbit = timeline.request(1, 210);
    assert.strictEqual(orbit.duration, 5.5);
    near(orbit.impactAt, 3.08);
    timeline.seek(1.5, 220);
    var reverse = timeline.request(-1, 230);
    assert.strictEqual(reverse.kind, 'return');
    assert.strictEqual(reverse.duration, 2.2);
    assert.strictEqual(reverse.impactAt, null);
    near(timeline.tick(1330).progress, 1.25);
    var settled = timeline.tick(2430);
    assert.strictEqual(settled.scene, 2);
    near(settled.progress, 1);
    [-1, Infinity, NaN].forEach(function (invalid) {
        var fallback = create({ orbitDuration: invalid });
        fallback.seek(1, 0);
        assert.strictEqual(fallback.request(1, 1).duration, 4.2);
    });
});

test('orbit playback discards queued direction changes and rearms after the gesture ends', function () {
    var timeline = create();
    timeline.seek(1, 0);
    timeline.hold('touch');
    assert.strictEqual(timeline.wheel(90, 100).kind, 'orbit');
    for (var at = 120; at < 5000; at += 20) {
        assert.strictEqual(timeline.request(at % 40 ? -1 : 1, at), null);
        assert.strictEqual(timeline.wheel(-90, at), null);
    }
    var settled = timeline.tick(5000);
    assert.strictEqual(settled.scene, 3);
    assert.strictEqual(settled.transitionId, 1);
    assert.strictEqual(settled.armed, false);
    timeline.release('touch', 5100);
    assert.strictEqual(timeline.request(-1, 5101), null);
    assert.strictEqual(timeline.tick(5260).armed, true);
    var reverse = timeline.request(-1, 5261);
    assert.strictEqual(reverse.to, 2);
    assert.strictEqual(reverse.transitionId, 2);
});

test('reduced-motion orbit is brief, silent at convergence, and supports an exact reverse', function () {
    var timeline = create({ reducedMotion: true });
    timeline.seek(1, 0);
    var orbit = timeline.request(1, 100);
    assert.strictEqual(orbit.kind, 'orbit');
    assert.strictEqual(orbit.duration, 0.4);
    assert.strictEqual(orbit.impactAt, null);
    near(timeline.tick(300).progress, 1.25);
    near(timeline.tick(500).progress, 1.5);
    var reverse = timeline.request(-1, 501);
    assert.strictEqual(reverse.duration, 0.4);
    assert.strictEqual(reverse.impactAt, null);
    near(timeline.tick(901).progress, 1);
});

test('pausing the orbit excludes hidden time from its convergence and final endpoint', function () {
    var timeline = create();
    timeline.seek(1, 0);
    timeline.request(1, 100);
    var paused = timeline.pause(1100);
    near(paused.elapsed, 1);
    near(timeline.tick(11100).progress, 1 + 0.5 / 4.2);
    assert.strictEqual(timeline.request(-1, 11100), null);
    timeline.resume(12100);
    var convergence = timeline.tick(13452);
    near(convergence.elapsed, 2.352);
    near(convergence.progress, 1.28);
    near(convergence.impactAt, 2.352);
    var settled = timeline.tick(15300);
    assert.strictEqual(settled.scene, 3);
    assert.strictEqual(settled.running, false);
    near(settled.progress, 1.5);
});

test('seeking inside the orbit preserves progress and reset restores the first endpoint', function () {
    var timeline = create();
    var sought = timeline.seek(1.2, 0);
    near(sought.progress, 1.2);
    assert.strictEqual(sought.scene, 2);
    near(timeline.request(1, 100).progress, 1.2);
    near(timeline.tick(2200).progress, 1.35);
    near(timeline.tick(4300).progress, 1.5);
    var reset = timeline.reset(4400);
    assert.strictEqual(reset.scene, 0);
    assert.strictEqual(reset.progress, 0);
    assert.strictEqual(reset.kind, null);
    assert.strictEqual(timeline.request(1, 4500).kind, 'dark');
});

test('snapshots cannot mutate the controller', function () {
    var timeline = create();
    var start = timeline.request(1, 0);
    start.progress = 1;
    start.elapsed = 100;
    start.to = 2;
    near(timeline.tick(1500).progress, 0.25);
    assert.strictEqual(timeline.tick(1500).to, 1);
});

console.log(checks + ' scene timeline checks passed.');
