var THREE = require('three');
var glslify = require('glslify');
var shaderParse = require('../helpers/shaderParse');
var settings = require('../core/settings');
var simulator = require('./simulator');

var _mesh, _uniforms;

exports.init = init;
exports.update = update;
exports.dispose = dispose;

function init(container, possessionColor) {
    var width = settings.simulatorTextureWidth;
    var amount = width * settings.simulatorTextureHeight;
    // A stable subset keeps the extra draw inexpensive at the larger quality settings.
    var step = Math.max(1, Math.ceil(amount / 32768));
    var count = Math.ceil(amount / step);
    var positions = new Float32Array(count * 18);
    var textureUVs = new Float32Array(count * 12);
    var corners = [0, -1, 1, -1, 0, 1, 0, 1, 1, -1, 1, 1];
    for (var i = 0; i < count; i++) {
        var identity = i * step;
        // Match the exact identity coordinates used by both head geometries.
        var u = (identity % width) / width;
        var v = Math.floor(identity / width) / settings.simulatorTextureHeight;
        for (var j = 0; j < 6; j++) {
            var vertex = i * 6 + j;
            positions[vertex * 3] = corners[j * 2];
            positions[vertex * 3 + 1] = corners[j * 2 + 1];
            textureUVs[vertex * 2] = u;
            textureUVs[vertex * 2 + 1] = v;
        }
    }
    var geometry = new THREE.BufferGeometry();
    geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.addAttribute('fboUV', new THREE.BufferAttribute(textureUVs, 2));
    _uniforms = {
        texturePosition: { type: 't', value: simulator.positionRenderTarget },
        texturePrevPosition: { type: 't', value: simulator.prevPositionRenderTarget },
        possession: { type: 'f', value: 0 },
        possessionColor: { type: 'c', value: possessionColor },
        strength: { type: 'f', value: 0 },
        deltaRatio: { type: 'f', value: 1 },
        moving: { type: 'f', value: 0 }
    };
    var material = new THREE.ShaderMaterial({
        uniforms: _uniforms,
        vertexShader: shaderParse(glslify('../glsl/particleTrails.vert')),
        fragmentShader: shaderParse(glslify('../glsl/particleTrails.frag')),
        transparent: true,
        blending: THREE.NormalBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    _mesh = new THREE.Mesh(geometry, material);
    _mesh.frustumCulled = false;
    _mesh.visible = false;
    // Heads write depth first; the ribbon lies behind their plane and cannot wash them out.
    _mesh.renderOrder = -1;
    container.add(_mesh);
}

function update(dt) {
    if (!_mesh) return;
    var strength = Math.max(0, Math.min(1, Number(settings.tailStrength) || 0));
    _mesh.visible = strength > 0.001 && dt > 0;
    _uniforms.strength.value = strength;
    _uniforms.possession.value = Math.max(0, Math.min(1, Number(settings.possession) || 0));
    _uniforms.moving.value = dt > 0 ? 1 : 0;
    _uniforms.deltaRatio.value = Math.max(0.001, dt / 16.6667);
    _uniforms.texturePosition.value = simulator.positionRenderTarget;
    _uniforms.texturePrevPosition.value = dt > 0 ? simulator.prevPositionRenderTarget : simulator.positionRenderTarget;
}

function dispose() {
    // Scene traversal disposes the attached geometry and material, matching particles.js ownership.
    _mesh = _uniforms = null;
}
