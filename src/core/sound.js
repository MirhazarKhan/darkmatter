var _context = null;
var _master = null;
var _noiseBuffer = null;
var _enabled = false;
var _wanted = false;
var _request = 0;
var _lastThump = -Infinity;
var _voices = [];
var _transitionVoice = null;
var _impactURL = 'audio/cinematic_drums_titanic_impact.mp3';
var _impactBytes = null;
var _impactFetch = null;
var _impactBuffer = null;
var _impactPrepare = null;
var _impactVoice = null;
var _impactClock = null;
var _impactEpoch = 0;
var _impactLoadEpoch = 0;

exports.enable = enable;
exports.disable = disable;
exports.isEnabled = isEnabled;
exports.thump = thump;
exports.playTransition = playTransition;
exports.cancelTransition = cancelTransition;
exports.preloadImpact = preloadImpact;
exports.prepareImpact = prepareImpact;
exports.impactReady = impactReady;
exports.playImpactTrack = playImpactTrack;
exports.impactElapsed = impactElapsed;
exports.cancelImpactTrack = cancelImpactTrack;
exports.dispose = dispose;

function enable() {
    var request = ++_request;
    _wanted = true;
    try {
        if (!_context || _context.state === 'closed') {
            cancelImpactTrack();
            _impactBuffer = null;
            var AudioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
            if (!AudioContext) {
                _wanted = false;
                return Promise.resolve(false);
            }
            // This function is called by the sound button's user gesture.
            // Importing the module never creates or starts an audio device.
            _context = new AudioContext();
            _master = _context.createGain();
            _master.gain.value = 0;
            _master.connect(_context.destination);
            _noiseBuffer = _makeNoiseBuffer(_context);
            var createdContext = _context;
            createdContext.onstatechange = function () {
                // A suspended/closed device cannot remain the clock for a
                // hold. Resuming later never revives its abandoned track.
                if (createdContext === _context && createdContext.state !== 'running') cancelImpactTrack();
            };
        }
        var context = _context;
        if (context.state !== 'running') cancelImpactTrack();
        var resumed = context.state === 'running' ? null : context.resume();
        return Promise.resolve(resumed).then(function () {
            if (request !== _request || !_wanted || context !== _context || context.state !== 'running') return false;
            _enabled = true;
            _fadeMaster(0.42, 0.07);
            return true;
        }, function () {
            if (request === _request) {
                _enabled = false;
                _wanted = false;
            }
            return false;
        });
    } catch (error) {
        _enabled = false;
        _wanted = false;
        return Promise.resolve(false);
    }
}

function disable() {
    ++_request;
    _wanted = false;
    _enabled = false;
    cancelImpactTrack();
    _fadeMaster(0, 0.08);
    // Stop scheduled sources as well as fading them: enabling sound again
    // must never reveal an impact from an abandoned chapter.
    var voices = _voices.slice();
    for (var i = 0; i < voices.length; i++) _stopVoice(voices[i], false);
    _transitionVoice = null;
}

function isEnabled() {
    return _enabled && !!_context && _context.state === 'running';
}

function thump(strength) {
    if (!isEnabled()) return false;
    var context = _context;
    var now = context.currentTime;
    if (now - _lastThump < 0.26 || _voices.length >= 3) return false;
    strength = typeof strength === 'number' && isFinite(strength) ? strength : 1;
    strength = Math.max(0, Math.min(1, strength));
    if (strength <= 0) return false;

    var voice = _makeVoice();
    _lastThump = now;
    _scheduleImpact(voice, 'dark', now, strength);
    return true;
}

function playTransition(kind, duration, impactAt, elapsed) {
    cancelTransition();
    if (!isEnabled() || (kind !== 'dark' && kind !== 'red' && kind !== 'orbit' && kind !== 'return')) return false;
    duration = _finite(duration, kind === 'orbit' ? 4.2 : 3);
    duration = Math.max(0.1, Math.min(8, duration));
    elapsed = Math.max(0, _finite(elapsed, 0));
    if (elapsed >= duration) return false;

    var now = _context.currentTime;
    var voice;
    if (kind === 'return') {
        if (elapsed >= Math.min(0.9, duration)) return false;
        voice = _makeVoice();
        _scheduleReturn(voice, now, duration, elapsed);
    } else {
        impactAt = Math.max(0, Math.min(duration, _finite(impactAt, kind === 'orbit' ? duration * 0.56 : 1.92)));
        // Resuming a tab or opting in after the hit does not repeat the hit.
        if (elapsed >= impactAt) return false;
        voice = _makeVoice();
        var impactTime = now + impactAt - elapsed;
        _scheduleRiser(voice, kind, now, impactTime, impactAt, elapsed);
        _scheduleImpact(voice, kind, impactTime, 1);
    }
    _transitionVoice = voice;
    return true;
}

function cancelTransition() {
    if (!_transitionVoice) return;
    _stopVoice(_transitionVoice, false);
    _transitionVoice = null;
}

function preloadImpact() {
    if (_impactBytes) return Promise.resolve(true);
    if (_impactFetch) return _impactFetch;
    var fetchAudio = typeof window !== 'undefined' && window.fetch;
    if (!fetchAudio && typeof fetch === 'function') fetchAudio = fetch;
    if (!fetchAudio) return Promise.resolve(false);
    var loadEpoch = _impactLoadEpoch;
    var pending = Promise.resolve().then(function () {
        return fetchAudio(_impactURL);
    }).then(function (response) {
        if (!response || response.ok === false || !response.arrayBuffer) return null;
        return response.arrayBuffer();
    }).then(function (bytes) {
        if (loadEpoch !== _impactLoadEpoch || !bytes || !bytes.byteLength) return false;
        _impactBytes = bytes;
        return true;
    }, function () { return false; }).then(function (ready) {
        if (_impactFetch === pending) _impactFetch = null;
        return ready;
    });
    _impactFetch = pending;
    return pending;
}

function prepareImpact() {
    // Bytes may download on page load; decoding uses only the audio device
    // that the user has explicitly enabled with a gesture.
    if (!isEnabled()) return Promise.resolve(false);
    if (impactReady()) return Promise.resolve(true);
    if (_impactPrepare) return _impactPrepare;
    var context = _context;
    var epoch = _impactEpoch;
    var pending = preloadImpact().then(function (loaded) {
        if (!loaded || epoch !== _impactEpoch || context !== _context || !isEnabled()) return null;
        return new Promise(function (resolve) {
            var finished = false;
            function complete(buffer) {
                if (finished) return;
                finished = true;
                resolve(buffer || null);
            }
            try {
                // decodeAudioData can detach its input and older Web Audio
                // implementations provide callbacks instead of a Promise.
                var decoded = context.decodeAudioData(_impactBytes.slice(0), complete, function () { complete(null); });
                if (decoded && decoded.then) decoded.then(complete, function () { complete(null); });
            } catch (error) { complete(null); }
        });
    }).then(function (buffer) {
        if (!buffer || !isFinite(buffer.duration) || buffer.duration <= 0 ||
            epoch !== _impactEpoch || context !== _context || !isEnabled()) return false;
        _impactBuffer = buffer;
        return true;
    }, function () { return false; }).then(function (ready) {
        if (_impactPrepare === pending) _impactPrepare = null;
        return ready;
    });
    _impactPrepare = pending;
    return pending;
}

function impactReady() {
    return !!_impactBuffer && !!_context && _context.state !== 'closed';
}

function playImpactTrack(elapsed) {
    cancelImpactTrack();
    if (!isEnabled() || !impactReady()) return false;
    elapsed = Math.max(0, _finite(elapsed, 0));
    if (elapsed >= _impactBuffer.duration) return false;
    var now = _context.currentTime;
    var voice = _makeVoice();
    var source = _addNode(voice, _context.createBufferSource());
    source.buffer = _impactBuffer;
    source.connect(voice.gain);
    voice.gain.gain.value = 0.9;
    _impactVoice = voice;
    _impactClock = { context: _context, voice: voice, start: now, offset: elapsed,
        duration: _impactBuffer.duration, complete: false };
    _startSource(voice, source, now, now + _impactBuffer.duration - elapsed, elapsed);
    return true;
}

function impactElapsed() {
    if (!_impactClock) return null;
    if (_impactClock.context !== _context || !isEnabled()) {
        cancelImpactTrack();
        return null;
    }
    if (_impactClock.complete) return _impactClock.duration;
    return Math.max(0, Math.min(_impactClock.duration,
        _impactClock.offset + _context.currentTime - _impactClock.start));
}

function cancelImpactTrack() {
    ++_impactEpoch;
    _impactPrepare = null;
    _impactClock = null;
    var voice = _impactVoice;
    _impactVoice = null;
    if (voice) _stopVoice(voice, false);
}

function _scheduleImpact(voice, kind, now, strength) {
    var context = _context;
    var red = kind === 'red';
    var orbit = kind === 'orbit';
    var oscillator = _addNode(voice, context.createOscillator());
    var bassGain = _addNode(voice, context.createGain());
    var noise = _addNode(voice, context.createBufferSource());
    var noiseGain = _addNode(voice, context.createGain());
    var filter = _addNode(voice, context.createBiquadFilter());

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(orbit ? 80 : red ? 128 : 96, now);
    oscillator.frequency.exponentialRampToValueAtTime(orbit ? 30 : red ? 36 : 38, now + (red ? 0.12 : 0.16));
    oscillator.frequency.exponentialRampToValueAtTime(orbit ? 24 : red ? 28 : 34, now + 0.85);
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime((orbit ? 0.48 : 0.72) * strength, now + 0.012);
    bassGain.gain.exponentialRampToValueAtTime((orbit ? 0.20 : 0.30) * strength, now + 0.14);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    oscillator.connect(bassGain);
    bassGain.connect(voice.gain);

    noise.buffer = _noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(orbit ? 700 : red ? 1800 : 500, now);
    filter.frequency.exponentialRampToValueAtTime(red ? 120 : 90, now + 0.55);
    filter.Q.value = 0.7;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime((orbit ? 0.05 : red ? 0.16 : 0.10) * strength, now + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.015 * strength, now + 0.23);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(voice.gain);

    _startSource(voice, oscillator, now, now + 1.45);
    _startSource(voice, noise, now, now + 1.25);
}

function _scheduleRiser(voice, kind, now, impactTime, impactAt, elapsed) {
    var context = _context;
    var red = kind === 'red';
    var orbit = kind === 'orbit';
    var onset = Math.min(orbit ? 0.10 : red ? 0.03 : 0.08, impactAt * 0.2);
    var start = now + Math.max(0, onset - elapsed);
    var remaining = impactTime - start;
    if (remaining < 0.045) return;
    var progress = Math.max(0, Math.min(1, (elapsed - onset) / Math.max(0.001, impactAt - onset)));
    var peakTime = impactTime - Math.min(0.025, remaining * 0.2);

    var noise = _addNode(voice, context.createBufferSource());
    var filter = _addNode(voice, context.createBiquadFilter());
    var airGain = _addNode(voice, context.createGain());
    noise.buffer = _noiseBuffer;
    noise.loop = true;
    filter.type = 'bandpass';
    filter.Q.value = orbit ? 2.4 : red ? 1.6 : 0.7;
    filter.frequency.setValueAtTime(_curve(orbit ? 350 : red ? 520 : 180, orbit ? 5600 : red ? 7200 : 4400, progress), start);
    filter.frequency.exponentialRampToValueAtTime(orbit ? 5600 : red ? 7200 : 4400, peakTime);
    airGain.gain.setValueAtTime(0.0001, start);
    airGain.gain.linearRampToValueAtTime(0.002 + (orbit ? 0.075 : red ? 0.16 : 0.11) * progress * progress, start + Math.min(0.025, remaining * 0.15));
    airGain.gain.exponentialRampToValueAtTime(orbit ? 0.085 : red ? 0.17 : 0.12, peakTime);
    airGain.gain.linearRampToValueAtTime(0, impactTime);
    noise.connect(filter);
    filter.connect(airGain);
    airGain.connect(voice.gain);
    _startSource(voice, noise, start, impactTime + 0.01, elapsed % _noiseBuffer.duration);

    // Distinct rises: a low opening tone, a sharper red possession,
    // and a lighter metallic harmonic above the orbit's airy sweep.
    var tone = _addNode(voice, context.createOscillator());
    var toneGain = _addNode(voice, context.createGain());
    tone.type = red || orbit ? 'triangle' : 'sine';
    tone.frequency.setValueAtTime(_curve(orbit ? 220 : red ? 160 : 65, orbit ? 1440 : red ? 960 : 280, progress), start);
    tone.frequency.exponentialRampToValueAtTime(orbit ? 1440 : red ? 960 : 280, peakTime);
    toneGain.gain.setValueAtTime(0.0001, start);
    toneGain.gain.linearRampToValueAtTime((orbit ? 0.002 : 0.005) + (orbit ? 0.008 : 0.015) * progress, start + Math.min(0.025, remaining * 0.15));
    toneGain.gain.exponentialRampToValueAtTime(orbit ? 0.014 : red ? 0.035 : 0.027, peakTime);
    toneGain.gain.linearRampToValueAtTime(0, impactTime);
    tone.connect(toneGain);
    toneGain.connect(voice.gain);
    _startSource(voice, tone, start, impactTime + 0.01);
}

function _scheduleReturn(voice, now, duration, elapsed) {
    var context = _context;
    var length = Math.min(0.9, duration);
    var remaining = length - elapsed;
    var progress = elapsed / length;
    var noise = _addNode(voice, context.createBufferSource());
    var filter = _addNode(voice, context.createBiquadFilter());
    var gain = _addNode(voice, context.createGain());
    noise.buffer = _noiseBuffer;
    noise.loop = true;
    filter.type = 'bandpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(_curve(1500, 180, progress), now);
    filter.frequency.exponentialRampToValueAtTime(180, now + remaining);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.045 * (1 - progress), now + Math.min(0.09, remaining * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + remaining);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(voice.gain);
    _startSource(voice, noise, now, now + remaining + 0.01, elapsed % _noiseBuffer.duration);
}

function _curve(start, end, progress) {
    return start * Math.pow(end / start, progress);
}

function _finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function _makeVoice() {
    // Usually only one chapter voice is alive; the bound also covers rapid
    // cancellation while a browser waits to deliver source-ended callbacks.
    while (_voices.length >= 6) _stopVoice(_voices[0], true);
    var gain = _context.createGain();
    gain.gain.value = 1;
    gain.connect(_master);
    var voice = { gain: gain, nodes: [gain], sources: [], startTimes: [], live: 0, stopped: false, released: false };
    _voices.push(voice);
    return voice;
}

function _addNode(voice, node) {
    voice.nodes.push(node);
    return node;
}

function _startSource(voice, source, start, stop, offset) {
    voice.sources.push(source);
    voice.startTimes.push(start);
    voice.live++;
    source.onended = function () {
        if (voice.released) return;
        voice.live--;
        if (voice.live <= 0) _releaseVoice(voice);
    };
    if (typeof offset === 'number') source.start(start, offset);
    else source.start(start);
    source.stop(stop);
}

function _stopVoice(voice, immediate) {
    if (voice.released) return;
    if (_impactVoice === voice) {
        _impactVoice = null;
        _impactClock = null;
    }
    var now = _context ? _context.currentTime : 0;
    if (!voice.stopped) {
        voice.stopped = true;
        _hold(voice.gain.gain, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + (immediate ? 0 : 0.04));
        for (var i = 0; i < voice.sources.length; i++) {
            // Future cues stop immediately; sounding sources receive a short
            // fade so leaving a chapter does not introduce a click.
            var stopAt = immediate || voice.startTimes[i] > now ? now : now + 0.045;
            try { voice.sources[i].stop(stopAt); } catch (error) {}
        }
    }
    if (immediate || voice.live === 0) _releaseVoice(voice);
}

function _fadeMaster(value, duration) {
    if (!_context || !_master || _context.state === 'closed') return;
    var now = _context.currentTime;
    var gain = _master.gain;
    _hold(gain, now);
    gain.linearRampToValueAtTime(value, now + duration);
}

function _hold(gain, now) {
    if (gain.cancelAndHoldAtTime) {
        gain.cancelAndHoldAtTime(now);
    } else {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
    }
}

function _makeNoiseBuffer(context) {
    var length = Math.ceil(context.sampleRate * 1.4);
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var samples = buffer.getChannelData(0);
    var seed = 187391;
    var previous = 0;
    for (var i = 0; i < length; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        // A little correlated noise gives the low-pass tail a softer texture.
        previous = previous * 0.65 + (seed / 4294967296 * 2 - 1) * 0.35;
        samples[i] = previous;
    }
    return buffer;
}

function _releaseVoice(voice) {
    if (voice.released) return;
    voice.released = true;
    if (_transitionVoice === voice) _transitionVoice = null;
    if (_impactVoice === voice) _impactVoice = null;
    if (_impactClock && _impactClock.voice === voice) _impactClock.complete = true;
    var index = _voices.indexOf(voice);
    if (index >= 0) _voices.splice(index, 1);
    for (var i = 0; i < voice.nodes.length; i++) {
        try { voice.nodes[i].disconnect(); } catch (error) {}
    }
    for (i = 0; i < voice.sources.length; i++) voice.sources[i].onended = null;
}

function dispose() {
    disable();
    ++_impactLoadEpoch;
    _impactFetch = null;
    _impactBytes = null;
    _impactBuffer = null;
    var voices = _voices.slice();
    for (var i = 0; i < voices.length; i++) {
        _stopVoice(voices[i], true);
    }
    var context = _context;
    if (context) context.onstatechange = null;
    if (_master) {
        try { _master.disconnect(); } catch (error) {}
    }
    _context = null;
    _master = null;
    _noiseBuffer = null;
    _transitionVoice = null;
    _lastThump = -Infinity;
    if (!context || context.state === 'closed' || !context.close) return Promise.resolve(true);
    try {
        return Promise.resolve(context.close()).then(function () { return true; }, function () { return false; });
    } catch (error) {
        return Promise.resolve(false);
    }
}
