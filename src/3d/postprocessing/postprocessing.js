var effectComposer = require('./effectComposer');
var fxaa = require('./fxaa/fxaa');
var bloom = require('./bloom/bloom');
var motionBlur = require('./motionBlur/motionBlur');
var fboHelper = require('../fboHelper');

var undef;

exports.init = init;
exports.dispose = dispose;
exports.resize = resize;
exports.render = render;
exports.visualizeTarget = undef;

var _renderer;
var _scene;
var _camera;

function init(renderer, scene, camera) {

    _renderer = renderer;
    _scene = scene;
    _camera = camera;

    effectComposer.init(renderer, scene, camera);

    // for less power machine, pass true
    // fxaa.init(true);

    fxaa.init();
    effectComposer.queue.push(fxaa);

    var gl = renderer.getContext();
    motionBlur.supported = !!gl.getExtension('OES_texture_float');
    if(motionBlur.supported) {
        motionBlur.init();
        effectComposer.queue.push(motionBlur);
    } else {
        motionBlur.enabled = false;
    }

    bloom.init();
    effectComposer.queue.push(bloom);

}

function resize(width, height) {
    effectComposer.resize(width, height);
}


function render(dt) {

    effectComposer.renderQueue(dt);

    if(exports.visualizeTarget) {
        fboHelper.copy(exports.visualizeTarget);
    }

}

function dispose() {
    effectComposer.dispose();
    // Also cover effects that failed during initialization before joining the queue.
    fxaa.dispose();
    motionBlur.dispose();
    bloom.dispose();
    exports.visualizeTarget = undef;
    _renderer = _scene = _camera = undef;
}
