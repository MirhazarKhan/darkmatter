var assert = require('assert');
var sequence = require('../src/core/holdSequence');
var checks = 0;

function test(name, run) {
    run();
    checks += 1;
    console.log('PASS ' + name);
}

function near(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' should equal ' + expected);
}

test('a hold begins only from idle and repeated presses do not restart its clock', function () {
    var hold = sequence.create();
    var idle = hold.tick(0);
    assert.strictEqual(idle.state, 'idle');
    assert.strictEqual(idle.active, false);
    near(idle.returnWeight, 0);
    var started = hold.begin(100);
    assert.strictEqual(started.state, 'holding');
    assert.strictEqual(started.active, true);
    near(started.elapsed, 0);
    near(started.impactAt, 4.115);
    near(started.completeAt, 7.615);
    near(hold.begin(1100).elapsed, 1);
    assert.strictEqual(hold.tick(1100).sequenceId, 1);
});

test('the decoded score can run slower than frames and its clock remains authoritative', function () {
    var hold = sequence.create();
    hold.begin(100);
    near(hold.tick(2100, 0.8).elapsed, 0.8);
    near(hold.tick(4100, 0.8).elapsed, 0.8);
    assert.strictEqual(hold.tick(10000, 4).state, 'holding');
    var impact = hold.tick(10001, sequence.impactAt);
    assert.strictEqual(impact.state, 'burst');
    assert.strictEqual(impact.committed, true);
    near(impact.burstFlash, 1);
});

test('an audio jump commits the impact and can settle the title in one frame', function () {
    var hold = sequence.create();
    hold.begin(0);
    var settled = hold.tick(10, 7.7);
    assert.strictEqual(settled.state, 'complete');
    assert.strictEqual(settled.committed, true);
    near(settled.progress, 1);
    near(settled.titleFormation, 1);
    near(settled.titleBrightness, 1);
    near(settled.burstFlash, 0);
    near(hold.tick(11, 1).elapsed, 7.7);
    assert.strictEqual(hold.tick(12, 0).state, 'complete');
});

test('releasing before the impact smoothly unwinds the current shape to the original ring', function () {
    var hold = sequence.create();
    hold.begin(0);
    var before = hold.tick(2000);
    var released = hold.release(2000);
    assert.strictEqual(released.state, 'returning');
    assert.strictEqual(released.committed, false);
    near(released.awaken, before.awaken);
    near(released.progress, before.progress);
    near(hold.tick(2425).awaken, before.awaken / 2);
    near(hold.tick(2425).returnWeight, 0.5);
    var restored = hold.tick(2850);
    assert.strictEqual(restored.state, 'idle');
    assert.strictEqual(restored.active, false);
    near(restored.awaken, 0);
    near(restored.progress, 0);
    near(restored.elapsed, 0);
    near(restored.returnWeight, 0);
    assert.strictEqual(hold.begin(2851).sequenceId, 2);
});

test('a cancelled hold cannot restart until its unwind finishes', function () {
    var hold = sequence.create();
    hold.begin(0);
    hold.release(1000);
    assert.strictEqual(hold.begin(1200).state, 'returning');
    assert.strictEqual(hold.begin(1200).sequenceId, 1);
    assert.strictEqual(hold.release(1300).state, 'returning');
    assert.strictEqual(hold.tick(1850).state, 'idle');
    assert.strictEqual(hold.begin(1850).sequenceId, 2);
});

test('releasing at or after the score impact commits the automatic reveal', function () {
    [4115, 4300, 8000].forEach(function (at) {
        var hold = sequence.create();
        hold.begin(0);
        var released = hold.release(at);
        assert.strictEqual(released.committed, true);
        assert.notStrictEqual(released.state, 'returning');
        assert.strictEqual(hold.tick(8000).state, 'complete');
        near(hold.tick(8000).titleFormation, 1);
    });
});

test('the title forms after the burst and finishes before the held final scene', function () {
    var hold = sequence.create();
    hold.begin(0);
    near(hold.tick(4115).titleFormation, 0);
    near(hold.tick(4415).titleFormation, 0);
    var forming = hold.tick(5615);
    assert.strictEqual(forming.state, 'revealing');
    near(forming.titleFormation, 0.5);
    assert.ok(forming.titleBrightness > 0 && forming.titleBrightness < 1);
    near(hold.tick(6815).titleFormation, 1);
    assert.strictEqual(hold.tick(7615).state, 'complete');
    near(hold.tick(7615).progress, 1);
});

test('returning from the completed title preserves its first frame then restores the ring', function () {
    var hold = sequence.create();
    hold.begin(0);
    assert.strictEqual(hold.returnToRing(500).state, 'holding');
    assert.strictEqual(hold.returnToRing(4200).state, 'burst');
    assert.strictEqual(hold.returnToRing(6000).state, 'revealing');
    var returned = hold.returnToRing(8000);
    assert.strictEqual(returned.state, 'returning');
    assert.strictEqual(returned.committed, true);
    near(returned.titleFormation, 1);
    near(returned.titleBrightness, 1);
    near(hold.tick(8600).titleFormation, 0.5);
    near(hold.tick(8600).returnWeight, 0.5);
    var ring = hold.tick(9200);
    assert.strictEqual(ring.state, 'idle');
    assert.strictEqual(ring.committed, false);
    near(ring.titleFormation, 0);
});

test('hidden time is excluded from the hold and paused media samples do not advance it', function () {
    var hold = sequence.create();
    hold.begin(100);
    near(hold.pause(1100).elapsed, 1);
    near(hold.tick(11100, 6).elapsed, 1);
    assert.strictEqual(hold.tick(11100).paused, true);
    near(hold.resume(12100).elapsed, 1);
    near(hold.tick(13100).elapsed, 2);
    near(hold.tick(15000, 2.1).elapsed, 2.1);
    assert.strictEqual(hold.tick(15000).state, 'holding');
});

test('pause also freezes an unwind and repeated visibility calls do not add hidden time', function () {
    var hold = sequence.create();
    hold.begin(0);
    hold.release(1000);
    var frozen = hold.pause(1200);
    hold.pause(2200);
    near(hold.tick(10000).returnWeight, frozen.returnWeight);
    hold.resume(11200);
    hold.resume(11200);
    near(hold.tick(11200).returnWeight, frozen.returnWeight);
    assert.strictEqual(hold.tick(11850).state, 'idle');
});

test('muting the score continues from the last audio sample without a clock discontinuity', function () {
    var hold = sequence.create();
    hold.begin(0);
    near(hold.tick(1000, 0.7).elapsed, 0.7);
    near(hold.tick(1500).elapsed, 1.2);
    near(hold.tick(2000, 1.1).elapsed, 1.2);
    near(hold.tick(2100).elapsed, 1.3);
    assert.strictEqual(hold.tick(5000).state, 'burst');
});

test('the visual endpoint stays fixed while the remaining score decay keeps its elapsed clock', function () {
    var hold = sequence.create();
    hold.begin(0);
    var complete = hold.tick(7615);
    var tail = hold.tick(10240);
    assert.strictEqual(tail.state, 'complete');
    assert.strictEqual(tail.active, true);
    near(tail.elapsed, 10.24);
    near(tail.progress, complete.progress);
    near(tail.awakenTime, complete.awakenTime);
    near(tail.titleFormation, complete.titleFormation);
    near(tail.titleBrightness, complete.titleBrightness);
    near(hold.tick(500000).progress, 1);
});

test('score onsets drive short pulses and are copied rather than retaining caller data', function () {
    var onsets = [0.25, { time: 1, strength: 0.6 }, NaN, Infinity, -1, {}, { time: 2, strength: -1 }];
    var hold = sequence.create({ scoreOnsets: onsets });
    onsets[1].time = 0;
    onsets.push(2);
    hold.begin(0);
    near(hold.tick(250).scorePulse, 1);
    assert.ok(hold.tick(430).scorePulse < 0.4);
    near(hold.tick(1000).scorePulse, 0.6);
    assert.ok(hold.tick(2000).scorePulse < 0.01);
    near(sequence.create().tick(0).scorePulse, 0);
});

test('reduced motion keeps sound timing while suppressing flashes and rhythmic pulses', function () {
    var hold = sequence.create({ reducedMotion: true, scoreOnsets: [1, 4.115] });
    hold.begin(0);
    near(hold.tick(1000).scorePulse, 0);
    var impact = hold.tick(4115);
    assert.strictEqual(impact.state, 'burst');
    near(impact.burstFlash, 0);
    near(impact.scorePulse, 0);
    assert.ok(hold.tick(5615).titleFormation > 0);
    assert.strictEqual(hold.tick(7615).state, 'complete');
});

test('reset clears a held, committed, returning, or paused sequence and keeps IDs unique', function () {
    [1000, 5000, 8000].forEach(function (at) {
        var hold = sequence.create();
        hold.begin(0);
        hold.tick(at);
        hold.pause(at);
        var reset = hold.reset(at);
        assert.strictEqual(reset.state, 'idle');
        assert.strictEqual(reset.paused, false);
        assert.strictEqual(reset.committed, false);
        near(reset.elapsed, 0);
        assert.strictEqual(hold.begin(at + 10).sequenceId, 2);
    });
    var returning = sequence.create();
    returning.begin(0);
    returning.release(1000);
    assert.strictEqual(returning.reset(1100).state, 'idle');
});

test('stale or invalid clocks cannot rewind or poison any visual field', function () {
    var hold = sequence.create({ impactAt: NaN, completeAt: Infinity, cancelDuration: -1 });
    hold.begin(100);
    var current = hold.tick(1100, 1);
    [-1, NaN, Infinity, -Infinity, '12'].forEach(function (invalid) {
        var result = hold.tick(invalid, invalid);
        near(result.elapsed, current.elapsed);
        Object.keys(result).forEach(function (key) {
            if (typeof result[key] === 'number') assert.ok(isFinite(result[key]), key + ' must stay finite');
        });
    });
    near(hold.tick(0, 0.5).elapsed, 1);
    near(hold.tick(1200).elapsed, 1.1);
    var frozen = hold.pause(1200);
    assert.strictEqual(hold.begin(1300).sequenceId, frozen.sequenceId);
});

test('a snapshot cannot mutate the controller or an unwind anchor', function () {
    var hold = sequence.create();
    hold.begin(0);
    var before = hold.tick(1000);
    var cancelled = hold.release(1000);
    cancelled.state = 'complete';
    cancelled.awaken = 100;
    cancelled.returnWeight = 0;
    var actual = hold.tick(1425);
    assert.strictEqual(actual.state, 'returning');
    near(actual.awaken, before.awaken / 2);
    near(actual.returnWeight, 0.5);
});

test('reading a snapshot does not advance the authored score clock', function () {
    var hold = sequence.create();
    assert.strictEqual(hold.snapshot().state, 'idle');
    hold.begin(0);
    hold.tick(1000, 0.75);
    var snapshot = hold.snapshot();
    near(snapshot.elapsed, 0.75);
    snapshot.elapsed = 20;
    near(hold.snapshot().elapsed, 0.75);
    near(hold.tick(1100).elapsed, 0.85);
});

test('custom short holds and very large finite clocks still produce a complete finite form', function () {
    var quick = sequence.create({ impactAt: 0.05 });
    quick.begin(0);
    var impact = quick.tick(50);
    assert.strictEqual(impact.state, 'burst');
    near(impact.awaken, 1);
    var long = sequence.create();
    long.begin(0);
    long.tick(0, Number.MAX_VALUE);
    var complete = long.tick(Number.MAX_VALUE);
    assert.strictEqual(complete.state, 'complete');
    Object.keys(complete).forEach(function (key) {
        if (typeof complete[key] === 'number') assert.ok(isFinite(complete[key]), key + ' must stay finite');
    });
    near(complete.titleFormation, 1);
});

console.log(checks + ' hold sequence checks passed.');
