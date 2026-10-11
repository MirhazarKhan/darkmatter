var THREE = require('three');
var raf = require('raf');
var settings = require('./core/settings');
var story = require('./core/cinematic');
var createTimeline = require('./core/sceneTimeline').create;
var cameraPath = require('./core/cameraPath');
var tailCamera = require('./core/tailCamera').create();
var redCamera = require('./core/redCamera').create();
var sound = require('./core/sound');
var holdSequence = require('./core/holdSequence');
var morphTargets = require('./3d/morphTargets');
var postprocessing = require('./3d/postprocessing/postprocessing');
var effectComposer = require('./3d/postprocessing/effectComposer');
var cinematicBlur = require('./3d/postprocessing/cinematic/cinematic');
var afterglow = require('./3d/postprocessing/afterglow/afterglow');
var motionBlur = require('./3d/postprocessing/motionBlur/motionBlur');
var fxaa = require('./3d/postprocessing/fxaa/fxaa');
var bloom = require('./3d/postprocessing/bloom/bloom');
var fboHelper = require('./3d/fboHelper');
var simulator = require('./3d/simulator');
var particles = require('./3d/particles');
var lights = require('./3d/lights');

var _renderer, _scene, _camera, _frame, _halo, _ascendingHalo, _finalTitle;
var _ready = false, _disposed = false, _paused = false;
var _progress = 0, _lastProgress = 0, _velocity = 0;
var _time = 0, _elapsed = 0, _arrival = 0, _impactAge = 100;
var _timeline, _chapterRunning = false, _announcedScene = -1;
var _heldKeys = {}, _touchId = null, _touchY = 0, _touchTriggered = false;
var _pointer = new THREE.Vector2();
var _look = new THREE.Vector3(0, 50, 0);
var _sceneCenter = new THREE.Vector3(0, 50, 0), _subjectTarget = new THREE.Vector3();
var _cameraAim = new THREE.Vector3(), _cameraOffset = new THREE.Vector3();
var _ringOffset = new THREE.Vector3(), _ringAim = new THREE.Vector3();
var _cameraTurn = new THREE.Quaternion(), _cameraBlend = new THREE.Quaternion();
var _flowRadius = settings.radius;
var _bg = new THREE.Color(), _ink = new THREE.Color(), _particleColor = new THREE.Color();
var _lightPaper = new THREE.Color('#f4f2ec'), _darkPaper = new THREE.Color('#07080d');
var _lightInk = new THREE.Color('#15161a'), _darkInk = new THREE.Color('#eeece7');
var _lightParticle = new THREE.Color('#777875'), _darkParticle = new THREE.Color('#bbc2d5');
var _listeners = [], _ui = {};
var _holdInput = null, _holdPending = false, _holdToken = 0, _soundMutedByUser = false;
var _holdAnnounced = '', _holdEye = new THREE.Vector3();
var _reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
_timeline = createTimeline({ reducedMotion: _reducedMotion });
var _hold = holdSequence.create({ reducedMotion: _reducedMotion });

function clockNow() { return window.performance && window.performance.now ? window.performance.now() : Date.now(); }

function on(target, event, handler, options) {
    target.addEventListener(event, handler, options || false);
    _listeners.push(function () { target.removeEventListener(event, handler, options || false); });
}

function init() {
    var ids = ['intro-name', 'dark-title', 'scroll-cue', 'scroll-progress', 'sound-toggle', 'sound-label', 'sound-status',
        'experience-loading', 'experience-error', 'credits-toggle', 'credits-panel', 'credits-close', 'restart-experience', 'next-scene-cue', 'return-scene-cue', 'chapter-status',
        'hold-cue', 'hold-label', 'hold-hint', 'hold-status', 'final-caption'];
    for (var i = 0; i < ids.length; i++) _ui[ids[i]] = document.getElementById(ids[i]);
    bindInterface();
    try {
        _renderer = new THREE.WebGLRenderer({ antialias: !settings.isMobile });
        checkCapabilities(_renderer);
        _renderer.domElement.className = 'spirit-canvas';
        _renderer.domElement.setAttribute('aria-label', 'Fluid particle scene controlled by scrolling');
        _renderer.domElement.setAttribute('role', 'img');
        _renderer.shadowMap.enabled = false;
        document.body.insertBefore(_renderer.domElement, document.body.firstChild);
        _scene = new THREE.Scene();
        _scene.fog = new THREE.FogExp2('#f4f2ec', 0.0004);
        _camera = new THREE.PerspectiveCamera(45, 1, 10, 3000);
        _camera.position.set(0, 50, 720);
        _camera.lookAt(_look);
        _camera.updateMatrixWorld();
        settings.camera = _camera;
        settings.cameraPosition = _camera.position;
        settings.mouse = new THREE.Vector2();
        settings.mouse3d = new THREE.Vector3(0, 50, 0);
        settings.followMouse = false;
        settings.useTriangleParticles = true;
        fboHelper.init(_renderer);
        postprocessing.init(_renderer, _scene, _camera);
        cinematicBlur.init();
        effectComposer.queue.push(cinematicBlur);
        afterglow.init();
        effectComposer.queue.push(afterglow);
        simulator.init(_renderer);
        _halo = morphTargets.getCinematicTexture('halo');
        _ascendingHalo = morphTargets.getCinematicTexture('ascendingHalo');
        _finalTitle = morphTargets.getCinematicTexture('finalTitle');
        settings.targetTextureA = settings.targetTextureB = _halo;
        particles.init(_renderer);
        _scene.add(particles.container);
        lights.init();
        _scene.add(lights.mesh);
        motionBlur.linesRenderTargetScale = settings.isMobile ? 0.25 : 1 / 3;
        motionBlur.motionRenderTargetScale = settings.isMobile ? 0.65 : 1;
        motionBlur.opacity = 0.9;
        settings.motionBlur = motionBlur.supported && !_reducedMotion;
        settings.fxaa = true;
        bloom.blurRadius = 1.25;
        sound.preloadImpact().catch(function () {});
        resize();
        on(window, 'resize', resize);
        on(window, 'mousemove', function (event) {
            _pointer.set(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight * 2 - 1));
        }, { passive: true });
        on(document, 'visibilitychange', function () {
            _time = 0;
            releaseContacts();
            if (document.hidden) {
                suspendHold();
                _timeline.pause(clockNow()); sound.cancelTransition();
                if (_frame) { raf.cancel(_frame); _frame = null; }
            } else if (_ready && !_frame) {
                if (!_paused) { _timeline.resume(clockNow()); resumeHold(); scoreChapter(_timeline.tick(clockNow())); }
                _frame = raf(loop);
            }
        });
        on(_renderer.domElement, 'webglcontextlost', function (event) {
            event.preventDefault(); _ready = false; sound.cancelTransition();
            resetHold();
            if (_frame) raf.cancel(_frame);
            showError('The graphics session was interrupted. Reload to return to the experience.');
        });
        _ready = true;
        _ui['experience-loading'].hidden = true;
        _frame = raf(loop);
    } catch (error) {
        if (_renderer) _renderer.dispose();
        showError('This experience needs floating-point WebGL. Try a browser with hardware acceleration enabled.');
        console.error('Spirit initialization:', error);
    }
}

function bindInterface() {
    on(_ui['restart-experience'], 'click', restart);
    on(_ui['scroll-cue'], 'click', function () { requestChapter(1); });
    on(_ui['next-scene-cue'], 'click', function () { requestChapter(1); });
    on(_ui['return-scene-cue'], 'click', function () { requestChapter(-1); });
    // Button activation gives keyboard and assistive-technology users a full-play alternative.
    on(_ui['hold-cue'], 'click', function (event) { if (event.detail === 0) startHold('play'); });
    on(_ui['sound-toggle'], 'click', function () {
        if (sound.isEnabled()) { _soundMutedByUser = true; sound.disable(); updateSound(false); return; }
        _soundMutedByUser = false;
        _ui['sound-label'].textContent = 'Starting…';
        sound.enable().then(function (enabled) {
            if (_disposed) return;
            updateSound(enabled);
            if (enabled && !document.hidden && !_paused) {
                sound.prepareImpact().then(function (ready) {
                    var hold = _hold.snapshot();
                    if (ready && !_disposed && !document.hidden && !_paused && !hold.paused && hold.active && hold.state !== 'returning' && sound.isEnabled()) sound.playImpactTrack(hold.elapsed);
                });
                scoreChapter(_timeline.tick(clockNow()));
            }
        });
    });
    on(_ui['credits-toggle'], 'click', function () { showCredits(!_ui['credits-panel'].hidden); });
    on(_ui['credits-close'], 'click', function () { showCredits(true); });
    on(window, 'keydown', function (event) {
        if (event.keyCode === 27 && !_ui['credits-panel'].hidden) { showCredits(true); return; }
        if (blocksNavigation(event.target) || event.altKey || event.metaKey || event.ctrlKey) return;
        var code = event.keyCode;
        if (code === 32 && canHold() && (!isControl(event.target) || event.target === _ui['hold-cue'])) {
            event.preventDefault();
            if (!event.repeat && !_holdInput) startHold('key:' + code);
            return;
        }
        var direction = code === 32 ? (event.shiftKey ? -1 : 1) : code === 40 || code === 34 || code === 35 ? 1 : code === 38 || code === 33 ? -1 : 0;
        if (code === 32 && isControl(event.target)) return;
        if (!direction) return;
        event.preventDefault();
        if (event.repeat || _heldKeys[code]) return;
        _timeline.tick(clockNow()); _heldKeys[code] = true; _timeline.hold('key:' + code);
        requestChapter(direction);
    });
    on(window, 'keyup', function (event) {
        if (_holdInput === 'key:' + event.keyCode) endHold();
        delete _heldKeys[event.keyCode]; _timeline.release('key:' + event.keyCode, clockNow());
    });
    on(window, 'pointerdown', function (event) {
        if (event.button !== 0 || !event.isPrimary || !canHold()) return;
        if (event.pointerType === 'touch' && event.target !== _ui['hold-cue'] && !_ui['hold-cue'].contains(event.target)) return;
        if (isControl(event.target) && event.target !== _ui['hold-cue'] && !_ui['hold-cue'].contains(event.target)) return;
        startHold('pointer:' + event.pointerId);
    });
    on(window, 'pointerup', function (event) { if (_holdInput === 'pointer:' + event.pointerId) endHold(); });
    on(window, 'pointercancel', function (event) { if (_holdInput === 'pointer:' + event.pointerId) endHold(); });
    on(window, 'contextmenu', function (event) { if (_holdInput || _holdPending) event.preventDefault(); });
    on(window, 'blur', releaseContacts);
    on(window, 'wheel', function (event) {
        if (blocksNavigation(event.target) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        if (!_ready || _disposed || _paused) return;
        if (_holdPending || _hold.snapshot().active) {
            _timeline.wheel(event.deltaY, clockNow());
            if (_hold.snapshot().state === 'complete' && event.deltaY < 0) returnToRing();
            return;
        }
        var pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
        beginChapter(_timeline.wheel(pixels, clockNow()));
    }, { passive: false });
    on(window, 'touchstart', function (event) {
        if (event.touches.length !== 1) {
            if (!_hold.snapshot().committed && _holdInput && _holdInput.indexOf('pointer:') === 0) endHold();
            finishTouch(); return;
        }
        if (_holdInput || _holdPending || (_hold.snapshot().active && _hold.snapshot().state !== 'complete')) return;
        if (blocksNavigation(event.target) || isControl(event.target)) return;
        _touchId = event.touches[0].identifier; _touchY = event.touches[0].clientY; _touchTriggered = false;
        _timeline.tick(clockNow()); _timeline.hold('touch');
    }, { passive: true });
    on(window, 'touchmove', function (event) {
        if (_touchId === null || event.touches.length !== 1) return;
        var touch = event.touches[0];
        if (touch.identifier !== _touchId) return;
        event.preventDefault();
        var distance = _touchY - touch.clientY;
        if (!_touchTriggered && Math.abs(distance) >= 46) {
            _touchTriggered = true; requestChapter(distance > 0 ? 1 : -1);
        }
    }, { passive: false });
    on(window, 'touchend', finishTouch, { passive: true });
    on(window, 'touchcancel', finishTouch, { passive: true });
}

function isControl(target) {
    return target && target.closest && target.closest('button, a, input, select, textarea, [contenteditable="true"]');
}

function blocksNavigation(target) {
    return !_ui['credits-panel'].hidden || (target && target.closest && target.closest('input, select, textarea, [contenteditable="true"]'));
}

function finishTouch() { _touchId = null; _touchTriggered = false; _timeline.release('touch', clockNow()); }

function releaseContacts() {
    endHold();
    for (var code in _heldKeys) _timeline.release('key:' + code, clockNow());
    _heldKeys = {}; finishTouch();
}

function requestChapter(direction) {
    if (!_ready || _disposed || _paused || document.hidden) return;
    var hold = _hold.snapshot();
    if (_holdPending || hold.active) {
        if (hold.state === 'complete' && direction < 0) returnToRing();
        return;
    }
    beginChapter(_timeline.request(direction, clockNow()));
}

function canHold() {
    var chapter = _timeline.tick(clockNow());
    return _ready && !_disposed && !_paused && !document.hidden && _ui['credits-panel'].hidden && chapter.scene === 3 && chapter.armed && _hold.snapshot().state === 'idle' && !_holdPending;
}

function startHold(input) {
    if (!canHold() || _holdInput) return;
    _holdInput = input; _holdPending = true;
    _timeline.pause(clockNow());
    var token = ++_holdToken;
    sound.cancelTransition();
    // Holding is itself the gesture that opts into this soundtrack; a chosen mute is respected.
    var enabled = _soundMutedByUser ? Promise.resolve(false) : sound.enable();
    enabled.then(function (ready) {
        if (ready && !_disposed) updateSound(true);
        return ready ? sound.prepareImpact() : false;
    }).then(function (ready) {
        if (token !== _holdToken || !_holdInput || _disposed || document.hidden || _paused) return;
        _holdPending = false;
        _hold.begin(clockNow());
        if (ready && sound.isEnabled()) sound.playImpactTrack(0);
    }).catch(function () {
        if (token === _holdToken && _holdInput && !_disposed && !document.hidden && !_paused) {
            _holdPending = false; _hold.begin(clockNow());
        }
    });
}

function endHold() {
    if (!_holdInput && !_holdPending) return;
    _holdInput = null; _holdPending = false; ++_holdToken;
    _hold.tick(clockNow(), sound.impactElapsed());
    var state = _hold.release(clockNow());
    if (!state.committed) sound.cancelImpactTrack();
}

function returnToRing() {
    _holdInput = null; _holdPending = false; ++_holdToken;
    sound.cancelImpactTrack();
    _hold.returnToRing(clockNow());
}

function resetHold() {
    _holdInput = null; _holdPending = false; ++_holdToken;
    sound.cancelImpactTrack(); _hold.reset(); _holdAnnounced = '';
}

function suspendHold() {
    endHold(); _hold.pause(clockNow()); sound.cancelImpactTrack();
}

function resumeHold() {
    var state = _hold.resume(clockNow());
    if (state.active) _timeline.pause(clockNow());
    if (state.committed && state.state !== 'returning' && sound.isEnabled()) sound.playImpactTrack(state.elapsed);
}

function beginChapter(chapter) {
    if (!chapter) return;
    if (!_reducedMotion && chapter.kind === 'red' && chapter.direction > 0) redCamera.begin(_camera.position, _cameraAim);
    _impactAge = 100;
    scoreChapter(chapter);
}

function scoreChapter(chapter) {
    if (chapter.running && !_reducedMotion) sound.playTransition(chapter.kind, chapter.duration, chapter.impactAt, chapter.elapsed);
}

function restart() {
    if (_disposed) return;
    sound.cancelTransition(); releaseContacts(); _timeline.reset(clockNow());
    resetHold();
    redCamera.reset();
    if (_paused || document.hidden) _timeline.pause(clockNow());
    _progress = _lastProgress = _velocity = 0; _impactAge = 100; _chapterRunning = false; _announcedScene = -1;
}

function updateSound(enabled) {
    _ui['sound-label'].textContent = enabled ? 'Sound on' : 'Sound off';
    _ui['sound-toggle'].setAttribute('aria-pressed', String(enabled));
    _ui['sound-toggle'].setAttribute('aria-label', enabled ? 'Disable sound' : 'Enable sound');
    _ui['sound-status'].textContent = enabled ? 'Sound enabled. Each transition has its own buildup and bass impact.' : 'Sound is off.';
}

function showCredits(close) {
    _ui['credits-panel'].hidden = close;
    _ui['credits-toggle'].setAttribute('aria-expanded', String(!close));
    if (!close) _ui['credits-close'].focus();
    else _ui['credits-toggle'].focus();
}

function checkCapabilities(renderer) {
    var gl = renderer.getContext();
    if (!gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) || !gl.getExtension('OES_texture_float')) throw new Error('Float textures unavailable');
    gl.getExtension('WEBGL_color_buffer_float');
    var previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D), previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    var texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    var supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    gl.deleteFramebuffer(framebuffer); gl.deleteTexture(texture);
    renderer.resetGLState();
    if (!supported) throw new Error('Float framebuffer unavailable');
}

function resize() {
    if (!_renderer || !_camera) return;
    var width = window.innerWidth, height = window.innerHeight;
    var scale = Math.min(settings.isMobile ? 0.8 : 1, 1600 / Math.max(width, height));
    postprocessing.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    _renderer.domElement.style.width = width + 'px';
    _renderer.domElement.style.height = height + 'px';
}

function loop() {
    _frame = null;
    if (!_ready || document.hidden || _disposed) return;
    var now = clockNow();
    var dt = _time ? Math.max(0, Math.min(50, now - _time)) : 16.6667;
    _time = now;
    _elapsed += dt * 0.001;
    _arrival = _reducedMotion ? 1 : Math.min(1, _arrival + dt / 3200);
    var chapter = _timeline.tick(now);
    _progress = chapter.progress;
    var delta = _progress - _lastProgress;
    _velocity += (Math.min(1, Math.abs(delta) / story.firstSceneEnd * 1000 / Math.max(1, dt)) - _velocity) * (1 - Math.exp(-dt / 110));
    if (chapter.running || _chapterRunning) _impactAge = chapter.direction > 0 && !_reducedMotion && chapter.elapsed >= chapter.impactAt ? chapter.elapsed - chapter.impactAt : 100;
    else if (!_paused) _impactAge += dt * 0.001;
    _chapterRunning = chapter.running;
    _lastProgress = _progress;
    var phase = story.sample(_progress, _reducedMotion);
    var hold = _hold.tick(now, sound.impactElapsed());
    if (!_holdPending && !hold.active && chapter.paused && !_paused) chapter = _timeline.resume(now);
    var impact = _reducedMotion ? 0 : Math.exp(-_impactAge * 4.8);
    var travel = phase.travel;
    var aspect = window.innerWidth / window.innerHeight;
    var baseDistance = Math.max(670, 350 / Math.max(0.4, aspect));
    var distance = _reducedMotion ? baseDistance : baseDistance * (1 - travel * 0.31) + phase.reveal * 75 + impact * 7;
    var closeUp = _reducedMotion ? 0 : story.smooth(0.08, 0.85, phase.red);
    var cameraPose = cameraPath.sample(distance, aspect, phase.arc, closeUp, phase.handoffTravel);
    var tailFollow = phase.tailFollow;
    _bg.copy(_lightPaper).lerp(_darkPaper, phase.darkness);
    _ink.copy(_lightInk).lerp(_darkInk, phase.darkness);
    _renderer.setClearColor(_bg);
    _scene.fog.color.copy(_bg);
    document.body.style.setProperty('--scene-paper', '#' + _bg.getHexString());
    document.body.style.setProperty('--scene-ink', '#' + _ink.getHexString());
    _particleColor.copy(_lightParticle).lerp(_darkParticle, phase.darkness);
    settings.color1 = '#' + _particleColor.getHexString();
    settings.color2 = '#' + _particleColor.clone().lerp(_bg, 0.45).getHexString();
    settings.possession = phase.red * (1 - phase.ringSilver);
    settings.tailStrength = phase.red * 0.38 * (1 - phase.ringFormation * 0.88);
    settings.ringFormation = phase.ringFormation;
    settings.ringMetallic = phase.ringSilver;
    settings.ringMotion = _reducedMotion ? 0 : 1;
    var dissolve = hold.active ? story.smooth(hold.impactAt, hold.impactAt + 0.24, hold.elapsed) * hold.returnWeight : 0;
    settings.ringFormation *= 1 - dissolve;
    settings.ringMetallic *= 1 - hold.awaken;
    settings.awaken = hold.awaken;
    settings.awakenTime = _reducedMotion ? 0 : hold.awakenTime;
    settings.scorePulse = hold.scorePulse;
    settings.titleFormation = hold.titleFormation;
    settings.titleBrightness = hold.titleBrightness;
    settings.titleTexture = _finalTitle;
    settings.titleAspect = aspect;
    settings.burstFlash = hold.burstFlash;
    settings.tailStrength += hold.awaken * (1 - hold.titleFormation) * 0.085;
    settings.targetStrength = phase.formation;
    settings.targetTextureB = _ascendingHalo;
    settings.targetMix = phase.red;
    var fluidRush = phase.rush + phase.handoffRush + phase.ringRush;
    settings.intensity = 0.65 + fluidRush * 0.3;
    settings.speed = 0.85 + fluidRush * 0.45 + phase.red * 0.15;
    settings.dieSpeed = 0.012 + phase.red * 0.003;
    settings.radius = (0.9 + phase.rush) * (1 - phase.red) + _flowRadius * phase.red + phase.handoffRush * (1 + phase.red * 0.35);
    settings.curlSize = 0.019 - fluidRush * 0.004 + phase.red * 0.001;
    settings.attraction = 0.8 - fluidRush * 0.5 + phase.red * 0.2;
    settings.burst = impact * 0.85;
    if (hold.active) {
        settings.targetStrength = 0;
        settings.intensity += hold.scorePulse * 0.25;
        settings.dieSpeed *= 1 - hold.titleFormation * 0.62;
        phase.timeScale += ((_reducedMotion ? 0.35 : 1.08) - phase.timeScale) * hold.awaken;
        phase.timeScale += (0.42 - phase.timeScale) * hold.titleFormation;
    }
    simulator.initAnimation = _arrival;
    var simulationDt = _paused ? 0 : Math.min(50, dt * phase.timeScale);
    if (simulationDt > 0) simulator.update(simulationDt);
    var tailPose = tailCamera.update(simulator.flowCenter, simulationDt, aspect);
    var redShotActive = !_reducedMotion && _progress >= 0.5 && (phase.chapterProgress > 0 || redCamera.hasStart());
    var redShot = redShotActive ? redCamera.update(tailPose, phase.chapterProgress, _paused ? 0 : dt, aspect) : null;
    _subjectTarget.copy(_sceneCenter);
    if (simulator.flowCenter && !_reducedMotion) _subjectTarget.lerp(simulator.flowCenter, story.smooth(0.12, 0.85, phase.red));
    _subjectTarget.lerp(_sceneCenter, phase.ringCamera);
    _look.lerp(_subjectTarget, 1 - Math.exp(-dt * phase.timeScale / 650));
    var parallax = _reducedMotion ? 0 : 1 - tailFollow;
    _camera.position.set(cameraPose.x + _look.x + _pointer.x * 16 * parallax + Math.sin(_elapsed * 0.15) * 8 * parallax,
        cameraPose.y + _look.y - 50 + _pointer.y * 9 * parallax + Math.sin(_elapsed * 0.2) * 6 * parallax, cameraPose.z + _look.z);
    _cameraAim.copy(_look);
    if (redShot) {
        // This shot replaces the competing orbit and tail rotations. Its focus,
        // rise and docking all advance on the chapter clock, not the fluid clock.
        _camera.position.set(redShot.x, redShot.y, redShot.z);
        _cameraAim.set(redShot.lookX, redShot.lookY, redShot.lookZ);
        if (phase.chapterProgress === 0) _look.copy(_cameraAim);
    }
    if (phase.ringCamera > 0) {
        // Pull out along an arc, keeping the gathering form in front of the lens.
        var ringPose = cameraPath.sampleRing(simulator.ringTime, aspect, _reducedMotion);
        _ringOffset.set(ringPose.x, ringPose.y, ringPose.z);
        _cameraOffset.copy(_camera.position).sub(_cameraAim);
        var entryRadius = _cameraOffset.length();
        _cameraOffset.normalize(); _ringOffset.normalize();
        _cameraTurn.setFromUnitVectors(_cameraOffset, _ringOffset);
        _cameraBlend.set(0, 0, 0, 1).slerp(_cameraTurn, phase.ringCamera);
        _cameraOffset.applyQuaternion(_cameraBlend).multiplyScalar(entryRadius + (ringPose.radius - entryRadius) * phase.ringCamera);
        _ringAim.copy(_cameraAim).lerp(_sceneCenter, phase.ringCamera);
        _cameraAim.copy(_ringAim);
        _camera.position.copy(_cameraAim).add(_cameraOffset);
    }
    if (hold.active) {
        var open = _reducedMotion ? 0 : story.smooth(0, hold.impactAt * 0.72, hold.elapsed) * hold.returnWeight;
        var settledDistance = Math.max(670, 610 / Math.max(0.35, aspect));
        var openedDistance = Math.max(850, 800 / Math.max(0.35, aspect));
        var holdDistance = settledDistance + (openedDistance - settledDistance) * open * (1 - hold.titleFormation);
        _holdEye.set(0, 50, holdDistance);
        var cameraWeight = _reducedMotion ? hold.returnWeight : story.smooth(0, 1.15, hold.elapsed) * hold.returnWeight;
        _camera.position.lerp(_holdEye, cameraWeight);
        _cameraAim.lerp(_sceneCenter, cameraWeight);
    }
    _camera.lookAt(_cameraAim);
    _camera.updateMatrixWorld();
    _cameraOffset.copy(_camera.position).sub(_cameraAim);
    particles.update(simulationDt);
    lights.update(dt);
    fxaa.enabled = true;
    motionBlur.enabled = settings.motionBlur && motionBlur.supported && !_reducedMotion;
    var sharpness = 1 - story.smooth(0.02, 0.45, phase.red);
    var cameraSweep = redShot && phase.ringCamera === 0 ?
        4 * redShot.turn * (1 - redShot.turn) * 0.45 + 4 * redShot.dock * (1 - redShot.dock) * 0.22 : 0;
    var transitionBlur = Math.max(phase.transitionBlur, cameraSweep);
    motionBlur.depthStrength = _reducedMotion ? 0 : phase.red * (1 - transitionBlur * 0.85) * (1 - phase.ringCamera * 0.70);
    var chaseFocus = Math.max(90, tailPose.gap * 1.25);
    motionBlur.focusNear = Math.max(40, cameraPose.radius - 45) * (1 - tailFollow) + chaseFocus * tailFollow;
    motionBlur.focusFar = (cameraPose.radius + 130) * (1 - tailFollow) + (chaseFocus + 150) * tailFollow;
    if (redShot) {
        motionBlur.focusNear = Math.max(40, redShot.radius - 45) * (1 - redShot.dock) + chaseFocus * redShot.dock;
        motionBlur.focusFar = (redShot.radius + 130) * (1 - redShot.dock) + (chaseFocus + 150) * redShot.dock;
    }
    if (phase.ringCamera > 0) {
        motionBlur.focusNear += (ringPose.radius - 30 - motionBlur.focusNear) * phase.ringCamera;
        motionBlur.focusFar += (ringPose.radius + 205 - motionBlur.focusFar) * phase.ringCamera;
    }
    motionBlur.depthMotionMultiplier = 7;
    motionBlur.farBlurRadius = 1.8;
    motionBlur.maxDistance = (16 + phase.rush * 125 + impact * 24) * sharpness + phase.red * 16 + transitionBlur * 125;
    motionBlur.motionMultiplier = (0.35 + phase.rush * 3.2 + _velocity * 1.5 + impact * 0.7) * sharpness + phase.red + transitionBlur * 3.2;
    motionBlur.opacity = Math.min(0.96, 0.9 - phase.red * 0.3 + transitionBlur * 0.24);
    bloom.enabled = phase.darkness > 0.45 && sharpness > 0.005 && !_reducedMotion;
    bloom.amount = (0.10 + phase.rush * 0.10) * sharpness;
    if (phase.ringSilver > 0) {
        bloom.enabled = !_reducedMotion;
        bloom.amount += phase.ringSilver * 0.065;
        motionBlur.maxDistance += (12 - motionBlur.maxDistance) * phase.ringFormation;
        motionBlur.motionMultiplier += (0.65 - motionBlur.motionMultiplier) * phase.ringFormation;
    }
    if (hold.active) {
        motionBlur.depthStrength *= 1 - hold.titleFormation;
        motionBlur.maxDistance += hold.burstFlash * 180;
        motionBlur.motionMultiplier += hold.burstFlash * 4.5 + hold.scorePulse * 0.45;
        bloom.enabled = !_reducedMotion;
        bloom.amount += hold.awaken * 0.075 + hold.burstFlash * 0.24 + hold.titleBrightness * 0.045;
    }
    cinematicBlur.uniforms.u_strength.value = _reducedMotion ? 0 : Math.min(1,
        Math.min(1, phase.rush * 0.85 + _velocity * 0.28 + impact * 0.7) * sharpness + transitionBlur * 0.85);
    cinematicBlur.uniforms.u_strength.value = Math.min(1, cinematicBlur.uniforms.u_strength.value + hold.burstFlash * 0.95);
    cinematicBlur.enabled = cinematicBlur.uniforms.u_strength.value > 0.005;
    afterglow.uniforms.u_reveal.value = hold.titleBrightness;
    afterglow.uniforms.u_flash.value = hold.burstFlash;
    afterglow.uniforms.u_time.value = _reducedMotion ? 0 : _elapsed;
    afterglow.enabled = hold.titleBrightness > 0.001 || hold.burstFlash > 0.001;
    var arrivalOpacity = story.smooth(0.08, 0.68, _arrival);
    _ui['intro-name'].style.opacity = arrivalOpacity * phase.nameOpacity;
    _ui['intro-name'].style.transform = _reducedMotion ? 'none' : 'translate3d(0,' + (-phase.departure * 80) + 'px,0) scale(' + (1 + phase.departure * 0.10) + ')';
    _ui['intro-name'].style.filter = _reducedMotion ? 'none' : 'blur(' + (phase.departure * 14) + 'px)';
    _ui['intro-name'].setAttribute('aria-hidden', String(phase.nameOpacity < 0.05));
    _ui['dark-title'].style.opacity = phase.reveal;
    _ui['dark-title'].style.transform = _reducedMotion ? 'none' : 'translate3d(0,' + ((1 - phase.reveal) * 28) + 'px,0) scale(' + (0.96 + phase.reveal * 0.04) + ')';
    var wipeMotion = _reducedMotion ? 0 : Math.sin(phase.wipe * Math.PI);
    _ui['dark-title'].style.setProperty('--word-shift', (_reducedMotion ? 0 : phase.wipe * window.innerWidth * 1.1) + 'px');
    _ui['dark-title'].style.setProperty('--word-stretch', 1 + wipeMotion * 0.18);
    _ui['dark-title'].style.setProperty('--word-blur', (wipeMotion * Math.min(13, window.innerWidth * 0.016)) + 'px');
    _ui['dark-title'].style.setProperty('--word-trail', (wipeMotion * Math.min(76, window.innerWidth * 0.09)) + 'px');
    _ui['dark-title'].style.setProperty('--word-opacity', 1 - story.smooth(_reducedMotion ? 0 : 0.50, 0.98, phase.wipe));
    _ui['dark-title'].style.setProperty('--title-details-opacity', 1 - story.smooth(0.02, 0.20, phase.nextProgress));
    _ui['dark-title'].setAttribute('aria-hidden', String(phase.reveal < 0.05 || phase.wipe > 0.98));
    _ui['scroll-cue'].style.opacity = arrivalOpacity * (1 - story.smooth(0.02, 0.16, phase.openingProgress));
    _ui['next-scene-cue'].style.opacity = phase.reveal * story.smooth(0.83, 0.98, phase.openingProgress) * (1 - story.smooth(0, 0.18, phase.nextProgress));
    _ui['next-scene-cue'].setAttribute('aria-label', chapter.scene === 2 ? 'Form the living ring' : 'Continue into red matter');
    _ui['next-scene-cue'].firstElementChild.textContent = chapter.scene === 2 ? 'SCROLL TO FORM' : 'SCROLL TO CONTINUE';
    if (chapter.scene === 2) _ui['next-scene-cue'].style.opacity = chapter.running ? 0 : 1;
    var cues = ['scroll-cue', 'next-scene-cue', 'return-scene-cue'];
    for (var cueIndex = 0; cueIndex < cues.length; cueIndex++) {
        var showCue = !_holdPending && !hold.active && chapter.armed && (cueIndex === 0 ? chapter.scene === 0 : cueIndex === 1 ? chapter.scene === 1 || chapter.scene === 2 : chapter.scene === 3);
        if (cueIndex === 2 && hold.state === 'complete') showCue = true;
        _ui[cues[cueIndex]].style.visibility = showCue ? 'visible' : 'hidden';
        _ui[cues[cueIndex]].disabled = !showCue;
        _ui[cues[cueIndex]].setAttribute('aria-hidden', String(!showCue));
    }
    _ui['return-scene-cue'].setAttribute('aria-label', hold.state === 'complete' ? 'Return to the living ring' : 'Return to red matter');
    _ui['return-scene-cue'].style.opacity = chapter.scene === 3 && !chapter.running ? 1 : 0;
    var showHold = chapter.scene === 3 && !chapter.running && !hold.committed && hold.state !== 'returning';
    _ui['hold-cue'].style.visibility = showHold ? 'visible' : 'hidden';
    _ui['hold-cue'].style.opacity = showHold ? 1 : 0;
    _ui['hold-cue'].disabled = !showHold;
    _ui['hold-cue'].setAttribute('aria-hidden', String(!showHold));
    _ui['hold-cue'].style.setProperty('--hold-progress', Math.min(1, hold.elapsed / hold.impactAt));
    _ui['hold-label'].textContent = _holdPending ? 'GATHERING SOUND…' : hold.state === 'holding' ? 'KEEP HOLDING' : settings.isMobile ? 'PRESS AND HOLD' : 'CLICK AND HOLD';
    _ui['hold-hint'].textContent = hold.state === 'holding' ? 'Release to return · hold for the impact' : _soundMutedByUser ? 'Awaken the matter · sound is muted' : 'Awaken the matter · sound on hold';
    _ui['final-caption'].style.opacity = story.smooth(0.72, 1, hold.titleFormation);
    _ui['final-caption'].setAttribute('aria-hidden', String(hold.titleFormation < 0.72));
    if (_holdAnnounced !== hold.state) {
        _holdAnnounced = hold.state;
        _ui['hold-status'].textContent = { idle: '', holding: 'Keep holding to awaken the ring. Release early to return.', burst: 'Impact. The particles are bursting into a new form.', revealing: 'Dark Matter is forming.', complete: 'Dark Matter. Scroll up or use Return to the living ring to replay.', returning: 'Returning to the living ring.' }[hold.state];
    }
    if (!chapter.running && _announcedScene !== chapter.scene) {
        _announcedScene = chapter.scene;
        _ui['chapter-status'].textContent = ['Arrival. Scroll down or press Page Down to enter Dark Matter.', 'Dark Matter. Scroll down or press Page Down to continue. Scroll up to return.', 'Red matter. Scroll down or press Page Down to form the living ring. Scroll up to return.', 'Living ring. Click and hold, or hold Space, to awaken it. Scroll up to return to red matter.'][chapter.scene];
    }
    _ui['scroll-progress'].style.transform = 'scaleX(' + (_progress / 1.5) + ')';
    document.body.setAttribute('data-chapter', String(hold.titleFormation > 0.99 ? 5 : chapter.scene + 1));
    document.body.setAttribute('data-transition', chapter.running ? chapter.kind : 'holding');
    document.body.setAttribute('data-transition-id', chapter.transitionId);
    document.body.setAttribute('data-transition-elapsed', chapter.elapsed.toFixed(3));
    document.body.setAttribute('data-timeline-progress', _progress.toFixed(4));
    document.body.setAttribute('data-transition-blur', transitionBlur.toFixed(3));
    document.body.setAttribute('data-cinematic-blur', cinematicBlur.uniforms.u_strength.value.toFixed(3));
    document.body.setAttribute('data-fluid-rush', fluidRush.toFixed(3));
    document.body.setAttribute('data-handoff-travel', phase.handoffTravel.toFixed(3));
    document.body.setAttribute('data-scene', phase.ringFormation > 0.98 ? 'living-ring' : phase.ringCamera > 0 ? 'ring-convergence' : tailFollow > 0.95 ? 'red-tail-follow' : phase.arc > 0.01 ? 'red-ascent' : phase.red > 0.95 ? 'red-particles' : phase.wipe > 0.01 ? 'title-wipe' : phase.reveal > 0.6 ? 'dark-matter' : phase.departure > 0.8 ? 'rush' : 'arrival');
    document.body.setAttribute('data-motion-scale', phase.timeScale.toFixed(3));
    document.body.setAttribute('data-title-wipe', phase.wipe.toFixed(3));
    document.body.setAttribute('data-particle-color', phase.ringSilver > 0.999 ? '#c3c6c8' : phase.red > 0.999 ? settings.possessionColor : settings.color1);
    document.body.setAttribute('data-red-possession', settings.possession.toFixed(3));
    document.body.setAttribute('data-camera-elevation', (Math.asin(_cameraOffset.y / Math.max(1, _cameraOffset.length())) * 180 / Math.PI).toFixed(2));
    document.body.setAttribute('data-camera-azimuth', (Math.atan2(_cameraOffset.x, _cameraOffset.z) * 180 / Math.PI).toFixed(2));
    document.body.setAttribute('data-camera-radius', _cameraOffset.length().toFixed(2));
    document.body.setAttribute('data-camera-mode', phase.ringCamera > 0.99 ? 'ring-orbit' : tailFollow > 0.95 && phase.ringCamera === 0 ? 'tail-follow' : 'cinematic');
    document.body.setAttribute('data-camera-shot', redShot && phase.ringCamera === 0 ? redShot.dock > 0.65 ? 'wake-settle' : redShot.turn > 0.05 ? 'dolly-arc' : 'forward-push' : 'scene');
    document.body.setAttribute('data-camera-dock', redShot ? redShot.dock.toFixed(3) : '0');
    document.body.setAttribute('data-tail-follow', tailFollow.toFixed(3));
    document.body.setAttribute('data-tail-gap', tailPose.gap.toFixed(2));
    document.body.setAttribute('data-camera-position', [_camera.position.x, _camera.position.y, _camera.position.z].map(function (value) { return value.toFixed(2); }).join(','));
    document.body.setAttribute('data-formation', phase.formation.toFixed(3));
    document.body.setAttribute('data-depth-focus', motionBlur.depthStrength.toFixed(3));
    document.body.setAttribute('data-ring-formation', phase.ringFormation.toFixed(3));
    document.body.setAttribute('data-ring-silver', phase.ringSilver.toFixed(3));
    document.body.setAttribute('data-ring-time', (simulator.ringTime || 0).toFixed(3));
    document.body.setAttribute('data-hold-state', _holdPending ? 'preparing' : hold.state);
    document.body.setAttribute('data-hold-elapsed', hold.elapsed.toFixed(3));
    document.body.setAttribute('data-hold-sequence', hold.sequenceId);
    document.body.setAttribute('data-awaken', hold.awaken.toFixed(3));
    document.body.setAttribute('data-score-pulse', hold.scorePulse.toFixed(3));
    document.body.setAttribute('data-burst-flash', hold.burstFlash.toFixed(3));
    document.body.setAttribute('data-title-formation', hold.titleFormation.toFixed(3));
    document.body.setAttribute('data-impact-clock', sound.impactElapsed() === null ? 'visual' : 'audio');
    if (hold.active) document.body.setAttribute('data-scene', hold.state === 'complete' ? 'particle-title' : hold.state === 'holding' ? 'charged-matter' : hold.state === 'returning' ? 'ring-return' : 'matter-' + hold.state);
    postprocessing.render(dt);
    _frame = raf(loop);
}

function showError(message) {
    if (_ui['experience-loading']) _ui['experience-loading'].hidden = true;
    var errorElement = _ui['experience-error'];
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.className = 'experience-error';
        document.body.appendChild(errorElement);
    }
    errorElement.hidden = false;
    errorElement.textContent = message;
}

function dispose() {
    if (_disposed) return;
    _disposed = true; _ready = false;
    resetHold();
    if (_frame) raf.cancel(_frame);
    for (var i = 0; i < _listeners.length; i++) _listeners[i]();
    _listeners = [];
    if (_scene) _scene.traverse(function (object) {
        if (object.geometry) object.geometry.dispose();
        if (object.material && object.material.dispose) object.material.dispose();
        if (object.motionMaterial) object.motionMaterial.dispose();
        if (object.customDistanceMaterial) object.customDistanceMaterial.dispose();
    });
    tailCamera.reset(); redCamera.reset(); morphTargets.dispose(); simulator.dispose(); postprocessing.dispose(); fboHelper.dispose(); particles.dispose(); sound.dispose();
    if (_renderer) {
        _renderer.dispose();
        if (_renderer.domElement.parentNode) _renderer.domElement.parentNode.removeChild(_renderer.domElement);
    }
    settings.targetTextureA = settings.targetTextureB = settings.titleTexture = settings.camera = settings.cameraPosition = null;
    lights.mesh = lights.pointLight = null;
    _renderer = _scene = _camera = _halo = _ascendingHalo = _finalTitle = _frame = null;
}

window.Spirit = {
    setTimeline: function (progress) {
        if (_disposed) return;
        sound.cancelTransition(); releaseContacts(); _timeline.seek(Number(progress) || 0, clockNow());
        resetHold();
        redCamera.reset();
        if (_paused || document.hidden) _timeline.pause(clockNow());
        _impactAge = 100; _chapterRunning = false;
    },
    pause: function () { _paused = true; _timeline.pause(clockNow()); suspendHold(); sound.cancelTransition(); releaseContacts(); },
    resume: function () { if (!_paused) return; _paused = false; if (!document.hidden) { _timeline.resume(clockNow()); resumeHold(); scoreChapter(_timeline.tick(clockNow())); } },
    settings: settings,
    dispose: dispose
};
init();
