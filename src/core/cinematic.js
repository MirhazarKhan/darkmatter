function smooth(a, b, value) {
    value = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return value * value * (3 - 2 * value);
}

exports.smooth = smooth;
exports.firstSceneEnd = 0.5;
exports.impactPoint = 0.64 * exports.firstSceneEnd;
exports.rearmPoint = 0.38 * exports.firstSceneEnd;
function sampleOpening(progress, reducedMotion, impactAge) {
    progress = Math.max(0, Math.min(1, Number(progress) || 0));
    var departure = smooth(0.06, 0.30, progress);
    var rush = smooth(0.12, 0.38, progress) * (1 - smooth(0.58, 0.77, progress));
    var reveal = smooth(0.66, 0.90, progress);
    var slow = smooth(0.62, 0.80, progress);
    var darkness = smooth(0.24, 0.60, progress);
    var timeScale = (1 + rush * 1.4) * (1 - slow) + 0.14 * slow;
    var formation = smooth(0.64, 0.94, progress) * 0.42;
    if (typeof impactAge === 'number' && isFinite(impactAge)) {
        // Once the impact is crossed, let its beat finish even when scrolling stops.
        var weight = smooth(0.54, 0.64, progress);
        var braking = smooth(0, 0.9, impactAge) * weight;
        var titleBeat = smooth(0.18, 1.5, impactAge) * weight;
        timeScale += (0.14 - timeScale) * braking;
        rush *= 1 - braking;
        reveal = Math.max(reveal, titleBeat);
        darkness = Math.max(darkness, smooth(0, 0.7, impactAge) * weight);
        formation = Math.max(formation, titleBeat * 0.42);
    }
    return {
        progress: progress,
        departure: departure,
        rush: reducedMotion ? 0 : rush,
        darkness: darkness,
        reveal: reveal,
        timeScale: reducedMotion ? 0.16 : timeScale,
        formation: formation,
        travel: reducedMotion ? 0 : smooth(0.13, 0.65, progress),
        nameOpacity: 1 - departure
    };
}

exports.sample = function (progress, reducedMotion, impactAge) {
    progress = Math.max(0, Math.min(1, Number(progress) || 0));
    var openingProgress = Math.min(1, progress / exports.firstSceneEnd);
    var chapterProgress = Math.max(0, (progress - exports.firstSceneEnd) / (1 - exports.firstSceneEnd));
    var nextProgress = Math.min(1, chapterProgress * 1.5);
    var phase = sampleOpening(openingProgress, reducedMotion, impactAge);
    phase.progress = progress;
    phase.openingProgress = openingProgress;
    phase.nextProgress = nextProgress;
    phase.chapterProgress = chapterProgress;
    phase.wipe = smooth(0.04, 0.60, nextProgress);
    phase.red = smooth(0.10, 0.65, nextProgress);
    phase.arc = reducedMotion ? 0 : smooth(0.48, 1, chapterProgress);
    phase.handoffRush = reducedMotion ? 0 : smooth(0.02, 0.25, nextProgress) * (1 - smooth(0.55, 0.82, nextProgress));
    phase.timeScale += ((reducedMotion ? 0.16 : 0.82) - phase.timeScale) * smooth(0.32, 0.85, nextProgress);
    phase.formation = phase.formation * (1 - phase.red * 0.25) + phase.arc * 0.10;
    return phase;
};
