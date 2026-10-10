var THREE = require('three');
var raf = require('raf');
var settings = require('./core/settings');
var story = require('./core/cinematic');
var cameraPath = require('./core/cameraPath');
var sound = require('./core/sound');
var morphTargets = require('./3d/morphTargets');
var postprocessing = require('./3d/postprocessing/postprocessing');
var effectComposer = require('./3d/postprocessing/effectComposer');
var cinematicBlur = require('./3d/postprocessing/cinematic/cinematic');
var motionBlur = require('./3d/postprocessing/motionBlur/motionBlur');
var fxaa = require('./3d/postprocessing/fxaa/fxaa');
var bloom = require('./3d/postprocessing/bloom/bloom');
var fboHelper = require('./3d/fboHelper');
var simulator = require('./3d/simulator');
var particles = require('./3d/particles');
var lights = require('./3d/lights');

var _renderer, _scene, _camera, _frame, _halo, _ascendingHalo;
var _ready = false, _disposed = false, _paused = false;
var _progress = 0, _targetProgress = 0, _lastProgress = 0, _velocity = 0;
var _time = 0, _elapsed = 0, _arrival = 0, _impactAge = 100, _impactArmed = true;
var _pointer = new THREE.Vector2();
var _look = new THREE.Vector3(0, 50, 0);
var _bg = new THREE.Color(), _ink = new THREE.Color(), _particleColor = new THREE.Color();
var _lightPaper = new THREE.Color('#f4f2ec'), _darkPaper = new THREE.Color('#07080d');
var _lightInk = new THREE.Color('#15161a'), _darkInk = new THREE.Color('#eeece7');
var _lightParticle = new THREE.Color('#777875'), _darkParticle = new THREE.Color('#bbc2d5');
var _listeners = [], _ui = {};
var _reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function on(target, event, handler, options) {
    target.addEventListener(event, handler, options || false);
    _listeners.push(function () { target.removeEventListener(event, handler, options || false); });
}

function init() {
    var ids = ['intro-name', 'dark-title', 'scroll-cue', 'scroll-progress', 'sound-toggle', 'sound-label', 'sound-status',
        'experience-loading', 'experience-error', 'credits-toggle', 'credits-panel', 'credits-close', 'restart-experience', 'next-scene-cue'];
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
        simulator.init(_renderer);
        _halo = morphTargets.getCinematicTexture('halo');
        _ascendingHalo = morphTargets.getCinematicTexture('ascendingHalo');
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
        resize();
        readScroll();
        _progress = _lastProgress = _targetProgress;
        if (_progress >= story.impactPoint) { _impactArmed = false; _impactAge = 0; }
        on(window, 'resize', resize);
        on(window, 'scroll', readScroll, { passive: true });
        on(window, 'mousemove', function (event) {
            _pointer.set(event.clientX / window.innerWidth * 2 - 1, -(event.clientY / window.innerHeight * 2 - 1));
        }, { passive: true });
        on(document, 'visibilitychange', function () {
            _time = 0;
            if (document.hidden && _frame) { raf.cancel(_frame); _frame = null; }
            else if (!document.hidden && _ready && !_frame) _frame = raf(loop);
        });
        on(_renderer.domElement, 'webglcontextlost', function (event) {
            event.preventDefault(); _ready = false;
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
    on(_ui['restart-experience'], 'click', function () { window.scrollTo({ top: 0, behavior: _reducedMotion ? 'auto' : 'smooth' }); });
    on(_ui['sound-toggle'], 'click', function () {
        if (sound.isEnabled()) { sound.disable(); updateSound(false); return; }
        _ui['sound-label'].textContent = 'Starting…';
        sound.enable().then(function (enabled) {
            if (_disposed) return;
            updateSound(enabled);
            if (enabled && _progress >= story.impactPoint) sound.thump(0.65);
        });
    });
    on(_ui['credits-toggle'], 'click', function () { showCredits(!_ui['credits-panel'].hidden); });
    on(_ui['credits-close'], 'click', function () { showCredits(true); });
    on(window, 'keydown', function (event) {
        if (event.keyCode === 27 && !_ui['credits-panel'].hidden) showCredits(true);
    });
}

function updateSound(enabled) {
    _ui['sound-label'].textContent = enabled ? 'Sound on' : 'Sound off';
    _ui['sound-toggle'].setAttribute('aria-pressed', String(enabled));
    _ui['sound-toggle'].setAttribute('aria-label', enabled ? 'Disable sound' : 'Enable sound');
    _ui['sound-status'].textContent = enabled ? 'Sound enabled. Scroll into Dark Matter for the impact.' : 'Sound is off.';
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

function readScroll() {
    var height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    _targetProgress = Math.max(0, Math.min(1, (window.scrollY || window.pageYOffset || 0) / Math.max(1, height)));
}

function resize() {
    if (!_renderer || !_camera) return;
    var width = window.innerWidth, height = window.innerHeight;
    var scale = Math.min(settings.isMobile ? 0.8 : 1, 1600 / Math.max(width, height));
    postprocessing.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    _renderer.domElement.style.width = width + 'px';
    _renderer.domElement.style.height = height + 'px';
    readScroll();
}

function loop() {
    _frame = null;
    if (!_ready || document.hidden || _disposed) return;
    var now = Date.now();
    var dt = _time ? Math.max(0, Math.min(50, now - _time)) : 16.6667;
    _time = now;
    _elapsed += dt * 0.001;
    _arrival = _reducedMotion ? 1 : Math.min(1, _arrival + dt / 3200);
    _progress += (_targetProgress - _progress) * (_reducedMotion ? 1 : 1 - Math.exp(-dt / 145));
    var delta = _progress - _lastProgress;
    _velocity += (Math.min(1, Math.abs(delta) / story.firstSceneEnd * 1000 / Math.max(1, dt)) - _velocity) * (1 - Math.exp(-dt / 110));
    if (_progress < story.rearmPoint) _impactArmed = true;
    if (_impactArmed && _lastProgress < story.impactPoint && _progress >= story.impactPoint) {
        _impactAge = 0; _impactArmed = false;
        sound.thump(1);
    }
    _lastProgress = _progress;
    _impactAge += dt * 0.001;
    var phase = story.sample(_progress, _reducedMotion, _impactArmed ? undefined : _impactAge);
    var impact = _reducedMotion ? 0 : Math.exp(-_impactAge * 4.8);
    var travel = phase.travel;
    var aspect = window.innerWidth / window.innerHeight;
    var baseDistance = Math.max(670, 350 / Math.max(0.4, aspect));
    var distance = baseDistance * (1 - travel * 0.31) + phase.reveal * 75 + impact * 7;
    var possessionDistance = Math.max(distance, 480 / Math.max(0.35, aspect));
    distance += (possessionDistance - distance) * (_reducedMotion ? 0 : story.smooth(0.05, 0.60, phase.red));
    var cameraPose = cameraPath.sample(distance, aspect, phase.arc);
    var parallax = _reducedMotion ? 0 : 1;
    _camera.position.set(cameraPose.x + _pointer.x * 16 * parallax + Math.sin(_elapsed * 0.15) * 8 * parallax,
        cameraPose.y + _pointer.y * 9 * parallax + Math.sin(_elapsed * 0.2) * 6 * parallax, cameraPose.z);
    _camera.lookAt(_look);
    _camera.updateMatrixWorld();
    _bg.copy(_lightPaper).lerp(_darkPaper, phase.darkness);
    _ink.copy(_lightInk).lerp(_darkInk, phase.darkness);
    _renderer.setClearColor(_bg);
    _scene.fog.color.copy(_bg);
    document.body.style.setProperty('--scene-paper', '#' + _bg.getHexString());
    document.body.style.setProperty('--scene-ink', '#' + _ink.getHexString());
    _particleColor.copy(_lightParticle).lerp(_darkParticle, phase.darkness);
    settings.color1 = '#' + _particleColor.getHexString();
    settings.color2 = '#' + _particleColor.clone().lerp(_bg, 0.45).getHexString();
    settings.possession = phase.red;
    settings.tailStrength = phase.red;
    settings.targetStrength = phase.formation;
    settings.targetTextureB = _ascendingHalo;
    settings.targetMix = phase.red;
    settings.intensity = 0.65 + phase.rush * 0.3 + phase.red * 0.15;
    settings.speed = 0.85 + phase.rush * 0.45 + phase.red * 0.15;
    settings.dieSpeed = 0.012;
    settings.radius = 0.9 + phase.rush * 1.0;
    settings.curlSize = 0.019 - phase.rush * 0.004;
    settings.attraction = 0.8 - phase.rush * 0.5;
    settings.burst = impact * 0.85;
    simulator.initAnimation = _arrival;
    var simulationDt = _paused && Math.abs(delta) < 0.00001 ? 0 : dt * phase.timeScale;
    if (simulationDt > 0) simulator.update(simulationDt);
    particles.update(simulationDt);
    lights.update(dt);
    fxaa.enabled = true;
    motionBlur.enabled = settings.motionBlur && motionBlur.supported && !_reducedMotion;
    var sharpness = 1 - story.smooth(0.02, 0.45, phase.red);
    motionBlur.maxDistance = (16 + phase.rush * 125 + phase.handoffRush * 35 + impact * 24) * sharpness;
    motionBlur.motionMultiplier = (0.35 + phase.rush * 3.2 + _velocity * 1.5 + phase.handoffRush * 0.8 + impact * 0.7) * sharpness;
    bloom.enabled = phase.darkness > 0.45 && sharpness > 0.005 && !_reducedMotion;
    bloom.amount = (0.10 + phase.rush * 0.10) * sharpness;
    cinematicBlur.uniforms.u_strength.value = _reducedMotion ? 0 : Math.min(1, phase.rush * 0.85 + _velocity * 0.28 + phase.handoffRush * 0.16 + impact * 0.7) * sharpness;
    cinematicBlur.enabled = cinematicBlur.uniforms.u_strength.value > 0.005;
    var arrivalOpacity = story.smooth(0.08, 0.68, _arrival);
    _ui['intro-name'].style.opacity = arrivalOpacity * phase.nameOpacity;
    _ui['intro-name'].style.transform = 'translate3d(0,' + (-phase.departure * 80) + 'px,0) scale(' + (1 + phase.departure * 0.10) + ')';
    _ui['intro-name'].style.filter = _reducedMotion ? 'none' : 'blur(' + (phase.departure * 14) + 'px)';
    _ui['intro-name'].setAttribute('aria-hidden', String(phase.nameOpacity < 0.05));
    _ui['dark-title'].style.opacity = phase.reveal;
    _ui['dark-title'].style.transform = 'translate3d(0,' + ((1 - phase.reveal) * 28) + 'px,0) scale(' + (0.96 + phase.reveal * 0.04) + ')';
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
    _ui['scroll-progress'].style.transform = 'scaleX(' + _progress + ')';
    document.body.setAttribute('data-scene', phase.arc > 0.01 ? 'red-ascent' : phase.red > 0.95 ? 'red-particles' : phase.wipe > 0.01 ? 'title-wipe' : phase.reveal > 0.6 ? 'dark-matter' : phase.departure > 0.8 ? 'rush' : 'arrival');
    document.body.setAttribute('data-motion-scale', phase.timeScale.toFixed(3));
    document.body.setAttribute('data-title-wipe', phase.wipe.toFixed(3));
    document.body.setAttribute('data-particle-color', phase.red > 0.999 ? settings.possessionColor : settings.color1);
    document.body.setAttribute('data-red-possession', phase.red.toFixed(3));
    document.body.setAttribute('data-camera-elevation', cameraPose.elevation.toFixed(2));
    document.body.setAttribute('data-camera-azimuth', cameraPose.azimuth.toFixed(2));
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
    if (_frame) raf.cancel(_frame);
    for (var i = 0; i < _listeners.length; i++) _listeners[i]();
    _listeners = [];
    if (_scene) _scene.traverse(function (object) {
        if (object.geometry) object.geometry.dispose();
        if (object.material && object.material.dispose) object.material.dispose();
        if (object.motionMaterial) object.motionMaterial.dispose();
        if (object.customDistanceMaterial) object.customDistanceMaterial.dispose();
    });
    morphTargets.dispose(); simulator.dispose(); postprocessing.dispose(); fboHelper.dispose(); particles.dispose(); sound.dispose();
    if (_renderer) {
        _renderer.dispose();
        if (_renderer.domElement.parentNode) _renderer.domElement.parentNode.removeChild(_renderer.domElement);
    }
    settings.targetTextureA = settings.targetTextureB = settings.camera = settings.cameraPosition = null;
    lights.mesh = lights.pointLight = null;
    _renderer = _scene = _camera = _halo = _ascendingHalo = _frame = null;
}

window.Spirit = {
    setTimeline: function (progress) {
        if (_disposed) return;
        var height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight;
        window.scrollTo(0, Math.max(0, Math.min(1, Number(progress) || 0)) * height);
        readScroll();
    },
    pause: function () { _paused = true; },
    resume: function () { _paused = false; },
    settings: settings,
    dispose: dispose
};
init();
