var Effect = require('../Effect');
var glslify = require('glslify');
var effect = module.exports = new Effect();

effect.init = function () {
    Effect.prototype.init.call(this, {
        uniforms: { u_strength: { type: 'f', value: 0 } },
        fragmentShader: glslify('./cinematic.frag')
    });
};
