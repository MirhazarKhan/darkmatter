uniform sampler2D texturePosition;

#pragma glslify: rotateParticle = require(./helpers/rotateParticle.glsl)

varying vec4 vWorldPosition;

attribute vec2 fboUV;

uniform float flipRatio;

void main() {

    vec4 positionInfo = texture2D( texturePosition, fboUV );
    vec3 pos = positionInfo.xyz;

    vec4 worldPosition = modelMatrix * vec4( pos, 1.0 );
    vec4 mvPosition = viewMatrix * worldPosition;

    vWorldPosition = worldPosition;

    gl_Position = projectionMatrix * (mvPosition + vec4(rotateParticle(position, flipRatio) * smoothstep(0.0, 0.2, positionInfo.w), 0.0));

}
