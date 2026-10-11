var Effect = require('../Effect');
var glslify = require('glslify');
var effect = module.exports = new Effect();

effect.init = function () {
    Effect.prototype.init.call(this, {
        uniforms: {
            u_reveal: { type: 'f', value: 0 },
            u_flash: { type: 'f', value: 0 },
            u_time: { type: 'f', value: 0 }
        },
        fragmentShader: glslify('./afterglow.frag')
    });
    this.enabled = false;
};
