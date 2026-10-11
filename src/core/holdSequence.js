var IMPACT_AT = 4.115;
var COMPLETE_AT = IMPACT_AT + 3.5;

exports.impactAt = IMPACT_AT;
exports.completeAt = COMPLETE_AT;

// The hold owns a separate score clock; it never changes the scroll chapters.
exports.create = function (options) {
    options = options || {};
    var impactAt = positive(options.impactAt, IMPACT_AT);
    var completeAt = Math.max(impactAt + 2.7, positive(options.completeAt, impactAt + 3.5));
    var cancelDuration = positive(options.cancelDuration, 0.85);
    var returnDuration = positive(options.returnDuration, 1.2);
    var reducedMotion = !!options.reducedMotion;
    var onsets = cleanOnsets(options.scoreOnsets, impactAt);
    var state = 'idle';
    var elapsed = 0;
    var committed = false;
    var paused = false;
    var lastNow = 0;
    var lastActiveAt = 0;
    var returning = null;
    var sequenceId = 0;

    function now(value) {
        lastNow = Math.max(lastNow, finite(value, lastNow));
        return lastNow;
    }

    function clear() {
        state = 'idle';
        elapsed = 0;
        committed = false;
        returning = null;
    }

    function advance(at, audioElapsed) {
        at = now(at);
        if (paused) return at;
        if (state === 'returning') {
            returning.elapsed += Math.max(0, at - lastActiveAt) / 1000;
            if (returning.elapsed >= returning.duration) clear();
        } else if (state !== 'idle') {
            // A decoded soundtrack can correct the clock forward, but a stale
            // media sample can never undo a committed impact or visible morph.
            if (typeof audioElapsed === 'number' && isFinite(audioElapsed) && audioElapsed >= 0) {
                elapsed = Math.max(elapsed, audioElapsed);
            } else {
                elapsed = finite(elapsed + Math.max(0, at - lastActiveAt) / 1000, elapsed);
            }
            committed = committed || elapsed >= impactAt;
            state = elapsed < impactAt ? 'holding' : elapsed < impactAt + 0.7 ? 'burst' : elapsed < completeAt ? 'revealing' : 'complete';
        }
        lastActiveAt = at;
        return at;
    }

    function visual(at) {
        var age = at - impactAt;
        var titleFormation = smooth(impactAt + 0.3, impactAt + 2.7, at);
        var scorePulse = 0;
        if (!reducedMotion) {
            for (var i = 0; i < onsets.length; i++) {
                var beatAge = at - onsets[i].time;
                if (beatAge >= 0) scorePulse = Math.max(scorePulse, onsets[i].strength * Math.exp(-beatAge / 0.18));
            }
        }
        return {
            progress: clamp(at / completeAt),
            awaken: smooth(0, Math.max(0.01, impactAt - 0.15), at),
            awakenTime: Math.min(at, impactAt),
            scorePulse: scorePulse,
            burstFlash: reducedMotion || age < 0 ? 0 : 1 - smooth(0, 0.6, age),
            titleFormation: titleFormation,
            titleBrightness: smooth(0, 0.7, titleFormation)
        };
    }

    function snapshot() {
        var weight = state === 'idle' ? 0 : state === 'returning' ? 1 - smooth(0, returning.duration, returning.elapsed) : 1;
        var values = state === 'returning' ? returning.values : visual(elapsed);
        return {
            state: state,
            active: state !== 'idle',
            committed: committed,
            paused: paused,
            elapsed: elapsed,
            progress: values.progress * weight,
            awaken: values.awaken * weight,
            awakenTime: values.awakenTime,
            scorePulse: values.scorePulse * weight,
            burstFlash: values.burstFlash * weight,
            titleFormation: values.titleFormation * weight,
            titleBrightness: values.titleBrightness * weight,
            returnWeight: weight,
            impactAt: impactAt,
            completeAt: completeAt,
            sequenceId: sequenceId
        };
    }

    function unwind(at, duration) {
        returning = { elapsed: 0, duration: duration, values: visual(elapsed) };
        state = 'returning';
        lastActiveAt = at;
        return snapshot();
    }

    function begin(at) {
        at = advance(at);
        if (state !== 'idle' || paused) return snapshot();
        elapsed = 0;
        committed = false;
        returning = null;
        state = 'holding';
        lastActiveAt = at;
        sequenceId += 1;
        return snapshot();
    }

    function release(at) {
        at = advance(at);
        if (state === 'holding' && !committed) return unwind(at, cancelDuration);
        return snapshot();
    }

    function returnToRing(at) {
        at = advance(at);
        if (state === 'complete') return unwind(at, returnDuration);
        return snapshot();
    }

    function pause(at) {
        advance(at);
        paused = true;
        return snapshot();
    }

    function resume(at) {
        at = now(at);
        if (paused) {
            paused = false;
            lastActiveAt = at;
        }
        advance(at);
        return snapshot();
    }

    return {
        begin: begin,
        snapshot: snapshot,
        tick: function (at, audioElapsed) { advance(at, audioElapsed); return snapshot(); },
        release: release,
        returnToRing: returnToRing,
        pause: pause,
        resume: resume,
        reset: function (at) {
            lastActiveAt = now(at);
            clear();
            paused = false;
            return snapshot();
        }
    };
};

function cleanOnsets(values, impactAt) {
    if (!Array.isArray(values)) values = [impactAt];
    return values.map(function (value) {
        var time = typeof value === 'number' ? value : value && value.time;
        var strength = typeof value === 'number' ? 1 : finite(value && value.strength, 1);
        return { time: time, strength: clamp(strength) };
    }).filter(function (value) {
        return typeof value.time === 'number' && isFinite(value.time) && value.time >= 0 && value.strength > 0;
    }).sort(function (a, b) { return a.time - b.time; });
}

function finite(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
    value = finite(value, fallback);
    return value > 0 ? Math.min(value, 60000) : fallback;
}

function clamp(value) {
    return Math.max(0, Math.min(1, value));
}

function smooth(start, end, value) {
    var t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
}
