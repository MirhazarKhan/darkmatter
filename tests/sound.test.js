var assert = require('assert');
var modulePath = require.resolve('../src/core/sound');
var checks = 0;

function near(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' should equal ' + expected);
}

// The mock records the public Web Audio calls. It deliberately delays ended
// callbacks so cancellation and resource bounds are checked under suspension.
function audioFixture(options) {
    options = options || {};
    var nodes = [];
    var contexts = [];
    var fetches = [];
    var bytes = new Uint8Array([73, 68, 51, 1]).buffer;
    var decodedBuffer = { duration: 10.24 };
    var signalDecode;
    var decodeStarted = new Promise(function (resolve) { signalDecode = resolve; });
    var signalFetch;
    var fetchStarted = new Promise(function (resolve) { signalFetch = resolve; });

    function Param(value) {
        this.value = value || 0;
        this.events = [];
        if (!options.fallbackParams) {
            this.cancelAndHoldAtTime = function (time) { this.events.push(['hold', time]); };
        }
    }
    Param.prototype.setValueAtTime = function (value, time) {
        assert.ok(isFinite(value) && isFinite(time));
        this.events.push(['set', value, time]);
        this.value = value;
    };
    Param.prototype.linearRampToValueAtTime = function (value, time) {
        assert.ok(isFinite(value) && isFinite(time));
        this.events.push(['linear', value, time]);
    };
    Param.prototype.exponentialRampToValueAtTime = function (value, time) {
        assert.ok(value > 0 && isFinite(value) && isFinite(time));
        this.events.push(['exponential', value, time]);
    };
    Param.prototype.cancelScheduledValues = function (time) { this.events.push(['cancel', time]); };

    function AudioNode(type) {
        this.type = type;
        this.gain = new Param(1);
        this.frequency = new Param(440);
        this.Q = new Param(1);
        this.starts = [];
        this.stops = [];
        this.disconnected = false;
        nodes.push(this);
    }
    AudioNode.prototype.connect = function () {};
    AudioNode.prototype.disconnect = function () { this.disconnected = true; };
    AudioNode.prototype.start = function (time, offset) { this.starts.push([time, offset]); };
    AudioNode.prototype.stop = function (time) { this.stops.push(time); };

    function AudioContext() {
        this.state = options.suspended ? 'suspended' : 'running';
        this.currentTime = 20;
        this.sampleRate = 48000;
        this.decodes = [];
        contexts.push(this);
    }
    AudioContext.prototype.createGain = function () { return new AudioNode('gain'); };
    AudioContext.prototype.createOscillator = function () { return new AudioNode('oscillator'); };
    AudioContext.prototype.createBufferSource = function () { return new AudioNode('buffer'); };
    AudioContext.prototype.createBiquadFilter = function () { return new AudioNode('filter'); };
    AudioContext.prototype.createBuffer = function (channels, length, sampleRate) {
        return { duration: length / sampleRate, getChannelData: function () { return new Float32Array(length); } };
    };
    AudioContext.prototype.decodeAudioData = function (input, success, failure) {
        this.decodes.push(input);
        signalDecode();
        if (options.callbackDecode) {
            success(decodedBuffer);
            return;
        }
        if (options.deferredDecode) {
            var context = this;
            return new Promise(function (resolve) {
                context.finishDecode = function () { success(decodedBuffer); resolve(decodedBuffer); };
            });
        }
        if (options.failedDecode) {
            failure(new Error('Decode failed'));
            return Promise.reject(new Error('Decode failed'));
        }
        success(decodedBuffer);
        return Promise.resolve(decodedBuffer);
    };
    AudioContext.prototype.resume = function () {
        var context = this;
        if (options.suspended) {
            return new Promise(function (resolve) {
                context.finishResume = function () { context.state = 'running'; resolve(); };
            });
        }
        this.state = 'running';
        return Promise.resolve();
    };
    AudioContext.prototype.close = function () { this.state = 'closed'; return Promise.resolve(); };

    delete require.cache[modulePath];
    var fixture = { nodes: nodes, contexts: contexts, fetches: fetches, bytes: bytes,
        buffer: decodedBuffer, decodeStarted: decodeStarted, fetchStarted: fetchStarted };
    global.window = { AudioContext: AudioContext, fetch: function (url) {
        fetches.push(url);
        signalFetch();
        var response = { ok: !options.failedFetch, arrayBuffer: function () { return Promise.resolve(bytes); } };
        if (options.deferredFetch) return new Promise(function (resolve) { fixture.finishFetch = function () { resolve(response); }; });
        return Promise.resolve(response);
    } };
    fixture.sound = require(modulePath);
    return fixture;
}

function sourcesSince(fixture, index) {
    return fixture.nodes.slice(index).filter(function (node) { return node.starts.length > 0; });
}

async function test(name, run) {
    await run();
    checks++;
    console.log('PASS ' + name);
}

async function run() {
    await test('import and muted transitions never create an audio device', async function () {
        var f = audioFixture();
        assert.strictEqual(f.sound.isEnabled(), false);
        assert.strictEqual(f.sound.playTransition('dark', 3, 1.92, 0), false);
        assert.strictEqual(f.sound.playTransition('orbit', 4.2, 2.352, 0), false);
        assert.strictEqual(f.sound.thump(1), false);
        f.sound.cancelTransition();
        assert.strictEqual(f.contexts.length, 0);
        assert.strictEqual(await f.sound.dispose(), true);
    });

    await test('orbit convergence uses a restrained metallic rise and the supplied or default impact clock', async function () {
        var f = audioFixture();
        await f.sound.enable();
        var context = f.contexts[0];
        var index = f.nodes.length;
        assert.strictEqual(f.sound.playTransition('orbit', 4.2, 2.352, 0), true);
        var sources = sourcesSince(f, index);
        var drops = sources.filter(function (node) { return Math.abs(node.starts[0][0] - 22.352) < 1e-9; });
        assert.strictEqual(drops.length, 2, 'orbit bass and impact share the convergence beat');
        var bass = drops.filter(function (node) { return node.type === 'sine'; })[0];
        assert.ok(bass);
        near(bass.frequency.events[0][1], 80);
        near(bass.frequency.events[bass.frequency.events.length - 1][1], 24);
        var tone = sources.filter(function (node) { return node.type === 'triangle'; })[0];
        assert.ok(tone);
        near(tone.frequency.events[0][1], 220);
        near(tone.frequency.events[1][1], 1440);
        assert.ok(tone.starts[0][0] < bass.starts[0][0], 'metallic rise precedes the low impact');
        var gains = f.nodes.slice(index).filter(function (node) { return node.type === 'gain'; });
        assert.ok(gains.some(function (node) { return node.gain.events.some(function (event) { return event[0] === 'exponential' && Math.abs(event[1] - 0.48) < 1e-9; }); }), 'orbit bass attack is lower than the 0.72 opening/red attack');
        assert.ok(gains.some(function (node) { return node.gain.events.some(function (event) { return event[0] === 'exponential' && Math.abs(event[1] - 0.014) < 1e-9; }); }), 'the metallic tone remains restrained');

        context.currentTime = 40;
        index = f.nodes.length;
        assert.strictEqual(f.sound.playTransition('orbit', 5, undefined, 0.7), true);
        sources = sourcesSince(f, index);
        drops = sources.filter(function (node) { return Math.abs(node.starts[0][0] - 42.1) < 1e-9; });
        assert.strictEqual(drops.length, 2, 'default beat follows 56% of a configured duration');
        sources.forEach(function (node) { assert.ok(node.starts[0][0] >= context.currentTime); });
        context.currentTime = 60;
        index = f.nodes.length;
        assert.strictEqual(f.sound.playTransition('orbit'), true);
        drops = sourcesSince(f, index).filter(function (node) { return Math.abs(node.starts[0][0] - 62.352) < 1e-9; });
        assert.strictEqual(drops.length, 2, 'the default 4.2-second orbit converges at 2.352 seconds');
        await f.sound.dispose();
    });

    await test('dark and red drops follow the supplied transition clock and resume offset', async function () {
        var f = audioFixture();
        assert.strictEqual(await f.sound.enable(), true);
        var context = f.contexts[0];
        var index = f.nodes.length;
        assert.strictEqual(f.sound.playTransition('dark', 3, 1.92, 0), true);
        var sources = sourcesSince(f, index);
        var drops = sources.filter(function (node) { return Math.abs(node.starts[0][0] - 21.92) < 1e-9; });
        assert.strictEqual(drops.length, 2, 'bass and impact texture start together');
        var darkBass = drops.filter(function (node) { return node.type === 'sine'; })[0];
        assert.ok(darkBass);
        assert.ok(sources.some(function (node) { return node.starts[0][0] < 21.92; }), 'buildup precedes impact');

        context.currentTime = 40;
        index = f.nodes.length;
        assert.strictEqual(f.sound.playTransition('red', 3, 1.92, 0.7), true);
        sources = sourcesSince(f, index);
        drops = sources.filter(function (node) { return Math.abs(node.starts[0][0] - 41.22) < 1e-9; });
        assert.strictEqual(drops.length, 2);
        var redBass = drops.filter(function (node) { return node.type === 'sine'; })[0];
        assert.ok(redBass);
        assert.notStrictEqual(redBass.frequency.events[0][1], darkBass.frequency.events[0][1], 'chapters have distinct bass attacks');
        sources.forEach(function (node) { assert.ok(node.starts[0][0] >= context.currentTime); });
        context.currentTime = 60;
        index = f.nodes.length;
        assert.strictEqual(f.sound.playTransition('red', 3, undefined, 0.7), true);
        sources = sourcesSince(f, index);
        drops = sources.filter(function (node) { return Math.abs(node.starts[0][0] - 61.22) < 1e-9; });
        assert.strictEqual(drops.length, 2, 'the default red impact follows the same 64% braking beat');
        await f.sound.dispose();
    });

    await test('late opt-in or resume never repeats an impact or a completed return', async function () {
        var f = audioFixture();
        await f.sound.enable();
        var index = f.nodes.length;
        ['dark', 'red', 'orbit'].forEach(function (kind) {
            var impact = kind === 'orbit' ? 2.352 : 1.92;
            var duration = kind === 'orbit' ? 4.2 : 3;
            assert.strictEqual(f.sound.playTransition(kind, duration, impact, impact), false);
            assert.strictEqual(f.sound.playTransition(kind, duration, impact, impact + 0.05), false);
            assert.strictEqual(f.sound.playTransition(kind, duration, impact, duration), false);
        });
        assert.strictEqual(f.sound.playTransition('return', 1.2, 0, 1), false);
        assert.strictEqual(f.nodes.length, index, 'no nodes are created for elapsed cues');
        assert.strictEqual(f.sound.playTransition('return', 1.2, 0, 0.2), true);
        var sources = sourcesSince(f, index);
        assert.strictEqual(sources.length, 1);
        assert.strictEqual(sources[0].type, 'buffer', 'return uses a whoosh without a bass oscillator');
        near(sources[0].stops[0], 20.71);
        await f.sound.dispose();
    });

    await test('cancellation just before impact stops future cues immediately and fades sounding layers', async function () {
        var f = audioFixture({ fallbackParams: true });
        await f.sound.enable();
        var context = f.contexts[0];
        var index = f.nodes.length;
        f.sound.playTransition('dark', 3, 1.92, 0);
        var sources = sourcesSince(f, index);
        context.currentTime = 21.9;
        f.sound.cancelTransition();
        sources.forEach(function (source) {
            var stop = source.stops[source.stops.length - 1];
            if (source.starts[0][0] > context.currentTime) {
                near(stop, context.currentTime);
                assert.ok(stop < source.starts[0][0], 'a pending impact never gets a brief audible start');
            } else {
                near(stop, context.currentTime + 0.045);
            }
        });
        var stopCounts = sources.map(function (source) { return source.stops.length; });
        f.sound.cancelTransition();
        sources.forEach(function (source, i) { assert.strictEqual(source.stops.length, stopCounts[i]); });
        await f.sound.dispose();
    });

    await test('mute cancels pending sound and rapid chapter replacement keeps resources bounded', async function () {
        var f = audioFixture();
        await f.sound.enable();
        var context = f.contexts[0];
        f.sound.playTransition('red', 3, 1.92, 0);
        f.sound.disable();
        assert.strictEqual(f.sound.isEnabled(), false);
        f.nodes.filter(function (node) { return node.starts.length; }).forEach(function (source) {
            var stop = source.stops[source.stops.length - 1];
            assert.ok(stop <= context.currentTime + 0.045);
            if (source.starts[0][0] > context.currentTime) assert.ok(stop < source.starts[0][0]);
        });
        await f.sound.enable();
        for (var i = 0; i < 100; i++) {
            var kind = ['dark', 'red', 'orbit'][i % 3];
            f.sound.playTransition(kind, kind === 'orbit' ? 4.2 : 3, kind === 'orbit' ? 2.352 : 1.92, 0);
        }
        var connectedSources = f.nodes.filter(function (node) { return node.starts.length && !node.disconnected; });
        assert.ok(connectedSources.length <= 24, 'at most six four-source voices remain while ended callbacks are delayed');
        assert.strictEqual(await f.sound.dispose(), true);
        assert.strictEqual(context.state, 'closed');
        assert.ok(f.nodes.every(function (node) { return node.disconnected; }), 'dispose disconnects every owned node');
        assert.strictEqual(await f.sound.enable(), true, 'sound can be initialized after disposal');
        await f.sound.dispose();
    });

    await test('disable during a pending browser resume cannot enable playback later', async function () {
        var f = audioFixture({ suspended: true });
        var pending = f.sound.enable();
        var context = f.contexts[0];
        f.sound.disable();
        context.finishResume();
        assert.strictEqual(await pending, false);
        assert.strictEqual(f.sound.isEnabled(), false);
        assert.strictEqual(f.sound.playTransition('dark', 3, 1.92, 0), false);
        assert.strictEqual(await f.sound.enable(), true);
        await f.sound.dispose();
    });

    await test('natural completion retains the bass tail until every layer has ended', async function () {
        var f = audioFixture();
        await f.sound.enable();
        var index = f.nodes.length;
        f.sound.playTransition('dark', 3, 1.92, 0);
        var chapterNodes = f.nodes.slice(index);
        var sources = sourcesSince(f, index).sort(function (a, b) { return a.stops[0] - b.stops[0]; });
        sources.slice(0, -1).forEach(function (source) { source.onended(); });
        assert.ok(chapterNodes.every(function (node) { return !node.disconnected; }), 'ending the riser must not disconnect the bass tail');
        sources[sources.length - 1].onended();
        assert.ok(chapterNodes.every(function (node) { return node.disconnected; }));
        assert.ok(sources.every(function (source) { return source.onended === null; }));
        f.sound.cancelTransition();
        await f.sound.dispose();
    });

    await test('impact preload fetches once without creating or decoding on an audio device', async function () {
        var f = audioFixture();
        var first = f.sound.preloadImpact();
        assert.strictEqual(f.sound.preloadImpact(), first, 'concurrent downloads share the same request');
        assert.strictEqual(await first, true);
        assert.strictEqual(f.fetches.length, 1);
        assert.strictEqual(f.fetches[0], 'audio/cinematic_drums_titanic_impact.mp3');
        assert.strictEqual(f.contexts.length, 0);
        assert.strictEqual(f.sound.impactReady(), false);
        assert.strictEqual(await f.sound.prepareImpact(), false);
        assert.strictEqual(f.sound.playImpactTrack(), false);
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.strictEqual(await f.sound.enable(), true);
        assert.strictEqual(await f.sound.prepareImpact(), true);
        assert.strictEqual(f.sound.impactReady(), true);
        assert.strictEqual(f.contexts[0].decodes.length, 1);
        assert.notStrictEqual(f.contexts[0].decodes[0], f.bytes, 'decode receives a copy so retained bytes cannot detach');
        assert.strictEqual(await f.sound.prepareImpact(), true);
        assert.strictEqual(f.contexts[0].decodes.length, 1);
        assert.strictEqual(f.fetches.length, 1);
        await f.sound.dispose();
    });

    await test('the impact track starts at its supplied offset and exports the audio clock', async function () {
        var f = audioFixture();
        await f.sound.enable();
        await f.sound.prepareImpact();
        var context = f.contexts[0];
        var index = f.nodes.length;
        assert.strictEqual(f.sound.playImpactTrack(1.25), true);
        var source = sourcesSince(f, index)[0];
        assert.strictEqual(source.buffer, f.buffer);
        near(source.starts[0][0], 20);
        near(source.starts[0][1], 1.25);
        near(source.stops[0], 28.99);
        near(f.sound.impactElapsed(), 1.25);
        context.currentTime += 2.865;
        near(f.sound.impactElapsed(), 4.115);
        context.currentTime = 100;
        near(f.sound.impactElapsed(), 10.24);
        f.sound.cancelImpactTrack();
        assert.strictEqual(f.sound.impactElapsed(), null);
        near(source.stops[source.stops.length - 1], 100.045);
        await f.sound.dispose();
    });

    await test('impact offsets are bounded and playback has no deferred restart', async function () {
        var f = audioFixture();
        await f.sound.enable();
        var index = f.nodes.length;
        assert.strictEqual(f.sound.playImpactTrack(), false);
        await f.sound.prepareImpact();
        assert.strictEqual(sourcesSince(f, index).length, 0, 'finishing decode does not start an old play request');
        assert.strictEqual(f.sound.playImpactTrack(10.24), false);
        assert.strictEqual(f.sound.playImpactTrack(100), false);
        assert.strictEqual(sourcesSince(f, index).length, 0);
        assert.strictEqual(f.sound.playImpactTrack(-2), true);
        near(sourcesSince(f, index)[0].starts[0][1], 0);
        assert.strictEqual(f.sound.playImpactTrack(Infinity), true);
        near(f.sound.impactElapsed(), 0);
        await f.sound.dispose();
    });

    await test('natural track completion releases nodes and keeps its finished clock until cancellation', async function () {
        var f = audioFixture();
        await f.sound.enable();
        await f.sound.prepareImpact();
        var index = f.nodes.length;
        f.sound.playImpactTrack();
        var trackNodes = f.nodes.slice(index);
        var source = sourcesSince(f, index)[0];
        source.onended();
        assert.ok(trackNodes.every(function (node) { return node.disconnected; }));
        assert.strictEqual(source.onended, null);
        near(f.sound.impactElapsed(), 10.24);
        assert.strictEqual(f.sound.playImpactTrack(0.2), true, 'a new hold gets a new clock');
        near(f.sound.impactElapsed(), 0.2);
        f.sound.cancelImpactTrack();
        assert.strictEqual(f.sound.impactElapsed(), null);
        await f.sound.dispose();
    });

    await test('cancelled decoding cannot mark an abandoned hold ready or revive playback', async function () {
        var f = audioFixture({ deferredDecode: true });
        await f.sound.enable();
        var pending = f.sound.prepareImpact();
        await f.decodeStarted;
        f.sound.cancelImpactTrack();
        f.contexts[0].finishDecode();
        assert.strictEqual(await pending, false);
        assert.strictEqual(f.sound.impactReady(), false);
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.strictEqual(f.nodes.filter(function (node) { return node.starts.length; }).length, 0);
        await f.sound.dispose();
    });

    await test('muting an impact stops its source and re-enabling never restarts it', async function () {
        var f = audioFixture({ fallbackParams: true });
        await f.sound.enable();
        await f.sound.prepareImpact();
        var index = f.nodes.length;
        f.sound.playImpactTrack();
        var source = sourcesSince(f, index)[0];
        f.contexts[0].currentTime = 22;
        f.sound.disable();
        near(source.stops[source.stops.length - 1], 22.045);
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.strictEqual(f.sound.playImpactTrack(), false);
        assert.strictEqual(await f.sound.enable(), true);
        assert.strictEqual(sourcesSince(f, index).length, 1, 'enable cannot resurrect the previous track');
        assert.strictEqual(f.sound.impactElapsed(), null);
        await f.sound.dispose();
    });

    await test('mute during loading or decoding invalidates preparation without delayed playback', async function () {
        var f = audioFixture({ deferredFetch: true });
        await f.sound.enable();
        var pending = f.sound.prepareImpact();
        await f.fetchStarted;
        f.sound.disable();
        f.finishFetch();
        assert.strictEqual(await pending, false);
        assert.strictEqual(f.contexts[0].decodes.length, 0);
        assert.strictEqual(f.sound.impactReady(), false);
        await f.sound.dispose();

        f = audioFixture({ deferredDecode: true });
        await f.sound.enable();
        pending = f.sound.prepareImpact();
        await f.decodeStarted;
        f.sound.disable();
        f.contexts[0].finishDecode();
        assert.strictEqual(await pending, false);
        assert.strictEqual(f.sound.impactReady(), false);
        assert.strictEqual(f.sound.impactElapsed(), null);
        await f.sound.dispose();
    });

    await test('context suspension or loss abandons the track and its clock through later resume', async function () {
        var f = audioFixture();
        await f.sound.enable();
        await f.sound.prepareImpact();
        var context = f.contexts[0];
        var index = f.nodes.length;
        f.sound.playImpactTrack();
        var source = sourcesSince(f, index)[0];
        context.state = 'suspended';
        context.onstatechange();
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.ok(source.stops.length > 1);
        assert.strictEqual(await f.sound.enable(), true);
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.strictEqual(sourcesSince(f, index).length, 1);
        f.sound.playImpactTrack();
        context.state = 'suspended';
        assert.strictEqual(await f.sound.enable(), true, 'resuming is guarded even if statechange is delayed');
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.strictEqual(sourcesSince(f, index).length, 2, 'resume cannot restart either abandoned source');
        f.sound.playImpactTrack();
        context.state = 'closed';
        assert.strictEqual(f.sound.impactElapsed(), null, 'clock access also guards browsers that delay statechange');
        assert.strictEqual(await f.sound.enable(), true);
        assert.strictEqual(f.contexts.length, 2);
        assert.strictEqual(f.sound.impactReady(), false, 'a replacement device prepares its own decoded resource');
        assert.strictEqual(await f.sound.prepareImpact(), true);
        assert.strictEqual(f.sound.impactElapsed(), null);
        await f.sound.dispose();
    });

    await test('download and decode failures return false and legacy callback decoding remains supported', async function () {
        var f = audioFixture({ failedFetch: true });
        assert.strictEqual(await f.sound.preloadImpact(), false);
        await f.sound.enable();
        assert.strictEqual(await f.sound.prepareImpact(), false);
        assert.strictEqual(f.contexts[0].decodes.length, 0);
        await f.sound.dispose();
        f = audioFixture({ failedDecode: true });
        await f.sound.enable();
        assert.strictEqual(await f.sound.prepareImpact(), false);
        assert.strictEqual(f.sound.impactReady(), false);
        await f.sound.dispose();
        f = audioFixture({ callbackDecode: true });
        await f.sound.enable();
        assert.strictEqual(await f.sound.prepareImpact(), true);
        assert.strictEqual(f.sound.playImpactTrack(), true);
        await f.sound.dispose();
    });

    await test('repeated track replacement stays bounded and disposal invalidates pending downloads', async function () {
        var f = audioFixture();
        await f.sound.enable();
        await f.sound.prepareImpact();
        for (var i = 0; i < 100; i++) f.sound.playImpactTrack();
        assert.ok(f.nodes.filter(function (node) { return node.starts.length && !node.disconnected; }).length <= 6);
        await f.sound.dispose();
        assert.ok(f.nodes.every(function (node) { return node.disconnected; }));
        assert.strictEqual(f.sound.impactElapsed(), null);
        assert.strictEqual(f.sound.impactReady(), false);
        f = audioFixture({ deferredFetch: true });
        var pending = f.sound.preloadImpact();
        await f.fetchStarted;
        await f.sound.dispose();
        f.finishFetch();
        assert.strictEqual(await pending, false);
        assert.strictEqual(f.sound.impactReady(), false);
    });

    console.log(checks + ' sound checks passed.');
}

var previousWindow = global.window;
run().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
}).finally(function () {
    if (typeof previousWindow === 'undefined') delete global.window;
    else global.window = previousWindow;
});
