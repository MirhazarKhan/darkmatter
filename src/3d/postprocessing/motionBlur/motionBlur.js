var Effect = require('../Effect');
var effectComposer = require('../effectComposer');
var fboHelper = require('../../fboHelper');

var glslify = require('glslify');
var THREE = require('three');

var undef;

var exports = module.exports = new Effect();
var _super = Effect.prototype;

exports.init = init;
exports.resize = resize;
exports.render = render;
exports.dispose = dispose;

exports.useSampling = false;

// for debug
exports.skipMatrixUpdate = false;

exports.fadeStrength = 1;
exports.motionMultiplier = 1;
exports.maxDistance = 100;
exports.targetFPS = 60;
exports.leaning = 0.5;

// Perspective camera view-space distances. Zero strength preserves the opening's blur.
exports.depthStrength = 0;
exports.focusNear = 350;
exports.focusFar = 550;
exports.depthMotionMultiplier = 6;
exports.farBlurRadius = 0;

// lines method only options
exports.jitter = 0;
exports.opacity = 1;
exports.depthBias = 0.002;
exports.depthTest = false;
exports.useDithering = false;

exports.motionRenderTargetScale = 1;
exports.linesRenderTargetScale = 1 / 2;

var _motionRenderTarget;
var _linesRenderTarget;

var _lines;
var _linesCamera;
var _linesScene;
var _linesPositions;
var _linesPositionAttribute;
var _linesGeometry;
var _linesMaterial;

var _samplingMaterial;
var _focusMaterial;

var _prevUseDithering;
var _prevUseSampling;

var _visibleCache = [];

var _width;
var _height;

function init(sampleCount) {

    var gl = effectComposer.renderer.getContext();
    var floatLinear = !!gl.getExtension('OES_texture_float_linear');
    // Depth must never interpolate with the empty background. Float-nearest is also
    // supported by GPUs that can simulate particles but cannot filter float textures.
    _motionRenderTarget = fboHelper.createRenderTarget(1, 1, THREE.RGBAFormat, THREE.FloatType,
        THREE.NearestFilter, THREE.NearestFilter);
    _motionRenderTarget.depthBuffer = true;

    _linesRenderTarget = fboHelper.createRenderTarget(1, 1, THREE.RGBAFormat,
        floatLinear ? THREE.FloatType : THREE.UnsignedByteType);
    _linesCamera = new THREE.Camera();
    _linesCamera.position.z = 1.0;
    _linesScene = new THREE.Scene();

    _super.init.call(this, {
        uniforms: {
            u_lineAlphaMultiplier: { type: 'f', value: 1 },
            u_linesTexture: { type: 't', value: _linesRenderTarget }
            // u_motionTexture: { type: 't', value: _motionRenderTarget }
        },
        fragmentShader: glslify('./motionBlur.frag')
    });

    _linesPositions = [];
    _linesGeometry = new THREE.BufferGeometry();
    _linesMaterial = new THREE.RawShaderMaterial({
        uniforms: {
            u_texture: { type: 't', value: undef },
            u_motionTexture: { type: 't', value: _motionRenderTarget },
            u_resolution: { type: 'v2', value: effectComposer.resolution },
            u_maxDistance: { type: 'f', value: 1 },
            u_jitter: { type: 'f', value: 0.3 },
            u_fadeStrength: { type: 'f', value: 1 },
            u_motionMultiplier: { type: 'f', value: 1 },
            u_depthTest: { type: 'f', value: 0 },
            u_opacity: { type: 'f', value: 1 },
            u_leaning: { type: 'f', value: 0.5 },
            u_depthBias: { type: 'f', value: 0.01 },
            u_clipPlanes: { type: 'v2', value: new THREE.Vector2() },
            u_focusRange: { type: 'v2', value: new THREE.Vector2() },
            u_depthStrength: { type: 'f', value: 0 },
            u_depthMotionMultiplier: { type: 'f', value: 1 }
        },
        vertexShader: fboHelper.rawShaderPrefix + glslify('./motionBlurLines.vert'),
        fragmentShader: fboHelper.rawShaderPrefix + glslify('./motionBlurLines.frag'),

        blending : THREE.CustomBlending,
        blendEquation : THREE.AddEquation,
        blendSrc : THREE.OneFactor,
        blendDst : THREE.OneFactor ,
        blendEquationAlpha : THREE.AddEquation,
        blendSrcAlpha : THREE.OneFactor,
        blendDstAlpha : THREE.OneFactor,
        depthTest: false,
        depthWrite: false,
        transparent: true
    });
    _lines = new THREE.LineSegments(_linesGeometry, _linesMaterial);
    _linesScene.add(_lines);

    _samplingMaterial = new THREE.RawShaderMaterial({
        uniforms: {
            u_texture: { type: 't', value: undef },
            u_motionTexture: { type: 't', value: _motionRenderTarget },
            u_resolution: { type: 'v2', value: effectComposer.resolution },
            u_maxDistance: { type: 'f', value: 1 },
            u_fadeStrength: { type: 'f', value: 1 },
            u_motionMultiplier: { type: 'f', value: 1 },
            u_leaning: { type: 'f', value: 0.5 },
            u_clipPlanes: { type: 'v2', value: new THREE.Vector2() },
            u_focusRange: { type: 'v2', value: new THREE.Vector2() },
            u_depthStrength: { type: 'f', value: 0 },
            u_depthMotionMultiplier: { type: 'f', value: 1 }
        },
        defines: {
            SAMPLE_COUNT: sampleCount || 21
        },
        vertexShader: this.material.vertexShader,
        fragmentShader: fboHelper.rawShaderPrefix + '#define SAMPLE_COUNT ' + (sampleCount || 21) + '\n' + glslify('./motionBlurSampling.frag')
    });

    _focusMaterial = new THREE.RawShaderMaterial({
        uniforms: {
            u_texture: { type: 't', value: undef },
            u_motionTexture: { type: 't', value: _motionRenderTarget },
            u_resolution: { type: 'v2', value: effectComposer.resolution },
            u_clipPlanes: { type: 'v2', value: new THREE.Vector2() },
            u_focusRange: { type: 'v2', value: new THREE.Vector2() },
            u_depthStrength: { type: 'f', value: 0 },
            u_farBlurRadius: { type: 'f', value: 0 }
        },
        vertexShader: this.material.vertexShader,
        fragmentShader: fboHelper.rawShaderPrefix + glslify('./motionBlurFocus.frag'),
        depthTest: false,
        depthWrite: false
    });
}

function resize(width, height) {

    if(!width) {
        width = _width;
        height = _height;
    } else {
        _width = width;
        _height = height;
    }

    var motionWidth = Math.max(1, ~~(width * exports.motionRenderTargetScale));
    var motionHeight = Math.max(1, ~~(height * exports.motionRenderTargetScale));
    _motionRenderTarget.setSize(motionWidth , motionHeight);

    if(!exports.useSampling) {
        var linesWidth = Math.max(1, ~~(width * exports.linesRenderTargetScale));
        var linesHeight = Math.max(1, ~~(height * exports.linesRenderTargetScale));
        _linesRenderTarget.setSize(linesWidth, linesHeight);

        var i;
        var noDithering = !exports.useDithering;
        var amount = noDithering ? linesWidth * linesHeight : _getDitheringAmount(linesWidth, linesHeight);
        var currentLen = _linesPositions.length / 6;
        if(amount > currentLen) {
            _linesPositions = new Float32Array(amount * 6);
            _linesPositionAttribute = new THREE.BufferAttribute(_linesPositions, 3);
            _linesGeometry.removeAttribute('position');
            _linesGeometry.addAttribute( 'position', _linesPositionAttribute );
        }
        var i6 = 0;
        var x, y;
        var size = linesWidth * linesHeight;
        for(i = 0; i < size; i++) {
            x = i % linesWidth;
            y = ~~(i / linesWidth);
            if(noDithering || ((x + (y & 1)) & 1)) {
                _linesPositions[i6 + 0] = _linesPositions[i6 + 3] = (x + 0.5) / linesWidth;
                _linesPositions[i6 + 1] = _linesPositions[i6 + 4] = (y + 0.5) / linesHeight;
                _linesPositions[i6 + 2] = 0;
                _linesPositions[i6 + 5] = (0.001 + 0.999 * Math.random());
                i6 += 6;
            }
        }
        _linesPositionAttribute.needsUpdate = true;
        _linesGeometry.drawRange.count = amount * 2;
    }

    _prevUseDithering = exports.useDithering;
    _prevUseSampling = exports.useSampling;

}

// dithering
function _getDitheringAmount(width, height) {
    if((width & 1) && (height & 1)) {
        return (((width - 1) * (height - 1)) >> 1) + (width >> 1) + (height >> 1);
    } else {
        return (width * height) >> 1;
    }
}

function render(dt, renderTarget, toScreen) {

    if(_prevUseDithering !== exports.useDithering) {
        resize();
    } else if(_prevUseSampling !== exports.useSampling) {
        resize();
    }

    var useSampling = exports.useSampling;
    var fpsRatio = 1000 / (dt < 16.667 ? 16.667 : dt) / exports.targetFPS;
    var depthStrength = Math.max(0, Math.min(1, Number(exports.depthStrength) || 0));
    var softenFar = depthStrength > 0 && exports.farBlurRadius > 0;

    var state = fboHelper.getColorState();
    // Alpha distinguishes a visible particle from clear background for depth gating.
    effectComposer.renderer.setClearColor(0, 0);
    effectComposer.renderer.clearTarget(_motionRenderTarget, true);

    effectComposer.scene.traverseVisible(_setObjectBeforeState);
    effectComposer.renderScene(_motionRenderTarget);
    for(var i = 0, len = _visibleCache.length; i < len; i++) {
        _setObjectAfterState(_visibleCache[i]);
    }
    _visibleCache = [];

    if(!useSampling) {
        _setDepthUniforms(_linesMaterial.uniforms, depthStrength);
        _linesMaterial.uniforms.u_maxDistance.value = exports.maxDistance;
        _linesMaterial.uniforms.u_jitter.value = exports.jitter;
        _linesMaterial.uniforms.u_fadeStrength.value = exports.fadeStrength;
        _linesMaterial.uniforms.u_motionMultiplier.value = exports.motionMultiplier * fpsRatio;
        _linesMaterial.uniforms.u_depthTest.value = exports.depthTest;
        _linesMaterial.uniforms.u_opacity.value = exports.opacity;
        _linesMaterial.uniforms.u_leaning.value = Math.max(0.001, Math.min(0.999, exports.leaning));
        _linesMaterial.uniforms.u_depthBias.value = Math.max(0.00001, exports.depthBias);
        _linesMaterial.uniforms.u_texture.value = renderTarget;

        effectComposer.renderer.setClearColor(0, 0);
        effectComposer.renderer.clearTarget(_linesRenderTarget, true);
        effectComposer.renderer.render(_linesScene, _linesCamera, _linesRenderTarget);
    }

    fboHelper.setColorState(state);

    if(useSampling) {
        _setDepthUniforms(_samplingMaterial.uniforms, depthStrength);
        _samplingMaterial.uniforms.u_maxDistance.value = exports.maxDistance;
        _samplingMaterial.uniforms.u_fadeStrength.value = exports.fadeStrength;
        _samplingMaterial.uniforms.u_motionMultiplier.value = exports.motionMultiplier * fpsRatio;
        _samplingMaterial.uniforms.u_leaning.value = Math.max(0.001, Math.min(0.999, exports.leaning));
        _samplingMaterial.uniforms.u_texture.value = renderTarget;

        renderTarget = effectComposer.render(_samplingMaterial, toScreen && !softenFar);
    } else {
        this.uniforms.u_lineAlphaMultiplier.value = 1 + exports.useDithering;
        renderTarget = _super.render.call(this, dt, renderTarget, toScreen && !softenFar);
    }

    if (softenFar) {
        _setDepthUniforms(_focusMaterial.uniforms, depthStrength);
        _focusMaterial.uniforms.u_farBlurRadius.value = Math.max(0, Math.min(8, exports.farBlurRadius));
        _focusMaterial.uniforms.u_texture.value = renderTarget;
        effectComposer.render(_focusMaterial, toScreen);
    }

}

function _setObjectBeforeState(obj) {
    if(obj.motionMaterial) {
        obj._tmpMaterial = obj.material;
        obj.material = obj.motionMaterial;
        obj.material.uniforms.u_motionMultiplier.value = obj.material.motionMultiplier;
    } else if(obj.material) {
        obj.visible = false;
    }

    _visibleCache.push(obj);
}

function _setObjectAfterState(obj) {
    if(obj.motionMaterial) {
        obj.material = obj._tmpMaterial;
        obj._tmpMaterial = undef;
        if(!exports.skipMatrixUpdate) {
            obj.motionMaterial.uniforms.u_prevModelViewMatrix.value.copy(obj.modelViewMatrix);
        }
    } else {
        obj.visible = true;
    }
}

function _setDepthUniforms(uniforms, strength) {
    var camera = effectComposer.camera;
    uniforms.u_clipPlanes.value.set(camera.near, camera.far);
    var focusNear = Math.max(camera.near, Number(exports.focusNear) || camera.near);
    var focusFar = Math.max(focusNear + 1, Number(exports.focusFar) || focusNear + 1);
    uniforms.u_focusRange.value.set(focusNear, focusFar);
    uniforms.u_depthStrength.value = strength;
    if (uniforms.u_depthMotionMultiplier) {
        uniforms.u_depthMotionMultiplier.value = Math.max(0, Math.min(24,
            Number(exports.depthMotionMultiplier) || 0));
    }
}

function dispose() {
    for (var i = 0; i < _visibleCache.length; i++) {
        var object = _visibleCache[i];
        if (object.motionMaterial && object._tmpMaterial) {
            object.material = object._tmpMaterial;
            object._tmpMaterial = undef;
        } else if (object.material) {
            object.visible = true;
        }
    }
    _visibleCache = [];
    var resources = [_motionRenderTarget, _linesRenderTarget, _linesGeometry, _linesMaterial, _samplingMaterial, _focusMaterial];
    var disposed = [];
    for (i = 0; i < resources.length; i++) {
        var resource = resources[i];
        if (resource && disposed.indexOf(resource) === -1) {
            disposed.push(resource);
            resource.dispose();
        }
    }
    _motionRenderTarget = _linesRenderTarget = undef;
    _lines = _linesCamera = _linesScene = undef;
    _linesPositions = _linesPositionAttribute = _linesGeometry = _linesMaterial = undef;
    _samplingMaterial = _focusMaterial = undef;
    _prevUseDithering = _prevUseSampling = undef;
    _width = _height = undef;
    exports.supported = false;
    _super.dispose.call(this);
}
