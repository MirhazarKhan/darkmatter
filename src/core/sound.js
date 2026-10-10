var _context = null;
var _master = null;
var _noiseBuffer = null;
var _enabled = false;
var _wanted = false;
var _request = 0;
var _lastThump = -Infinity;
var _voices = [];

exports.enable = enable;
exports.disable = disable;
exports.isEnabled = isEnabled;
exports.thump = thump;
exports.dispose = dispose;

function enable() {
    var request = ++_request;
    _wanted = true;
    try {
        if (!_context || _context.state === 'closed') {
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
        }
        var context = _context;
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
    _fadeMaster(0, 0.08);
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

    var oscillator = context.createOscillator();
    var bassGain = context.createGain();
    var noise = context.createBufferSource();
    var noiseGain = context.createGain();
    var filter = context.createBiquadFilter();
    var voice = { nodes: [oscillator, bassGain, noise, noiseGain, filter], sources: [oscillator, noise] };
    _voices.push(voice);
    _lastThump = now;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(96, now);
    oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    oscillator.frequency.exponentialRampToValueAtTime(34, now + 0.85);
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime(0.72 * strength, now + 0.012);
    bassGain.gain.exponentialRampToValueAtTime(0.30 * strength, now + 0.14);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    oscillator.connect(bassGain);
    bassGain.connect(_master);

    noise.buffer = _noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(90, now + 0.55);
    filter.Q.value = 0.7;
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.10 * strength, now + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.015 * strength, now + 0.23);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(_master);

    oscillator.onended = function () { _releaseVoice(voice); };
    oscillator.start(now);
    noise.start(now);
    oscillator.stop(now + 1.45);
    noise.stop(now + 1.25);
    return true;
}

function _fadeMaster(value, duration) {
    if (!_context || !_master || _context.state === 'closed') return;
    var now = _context.currentTime;
    var gain = _master.gain;
    if (gain.cancelAndHoldAtTime) {
        gain.cancelAndHoldAtTime(now);
    } else {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
    }
    gain.linearRampToValueAtTime(value, now + duration);
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
    var index = _voices.indexOf(voice);
    if (index >= 0) _voices.splice(index, 1);
    for (var i = 0; i < voice.nodes.length; i++) {
        try { voice.nodes[i].disconnect(); } catch (error) {}
    }
    for (i = 0; i < voice.sources.length; i++) voice.sources[i].onended = null;
}

function dispose() {
    disable();
    var voices = _voices.slice();
    for (var i = 0; i < voices.length; i++) {
        for (var source = 0; source < voices[i].sources.length; source++) {
            try { voices[i].sources[source].stop(); } catch (error) {}
        }
        _releaseVoice(voices[i]);
    }
    var context = _context;
    if (_master) {
        try { _master.disconnect(); } catch (error) {}
    }
    _context = null;
    _master = null;
    _noiseBuffer = null;
    _lastThump = -Infinity;
    if (!context || context.state === 'closed' || !context.close) return Promise.resolve(true);
    try {
        return Promise.resolve(context.close()).then(function () { return true; }, function () { return false; });
    } catch (error) {
        return Promise.resolve(false);
    }
}
