uniform sampler2D texturePosition;
uniform float possession;
uniform float ringMetallic;
uniform float ringTime;
uniform float awaken;
uniform float titleBrightness;
uniform sampler2D titleTexture;

#pragma glslify: possessionMask = require(./helpers/possessionMask.glsl)
#pragma glslify: rotateParticle = require(./helpers/rotateParticle.glsl)
#pragma glslify: ringPosition = require(./helpers/ringPosition.glsl)

// chunk(shadowmap_pars_vertex);

varying float vLife;
varying float vPossession;
varying vec3 vRingNormal;
varying vec3 vRingView;
varying float vRingFacet;
varying float vAwakenClan;
varying float vTitleDust;
attribute vec2 fboUV;

uniform float flipRatio;
uniform mat4 cameraMatrix;

void main() {

    vec4 positionInfo = texture2D( texturePosition, fboUV );
    vec3 pos = positionInfo.xyz;

    vec4 worldPosition = modelMatrix * vec4( pos, 1.0 );
    vec4 mvPosition = viewMatrix * worldPosition;

    vLife = positionInfo.w;
    vPossession = possessionMask(positionInfo.xyz, fboUV, possession);
    vRingNormal = vec3(0.0, 0.0, 1.0);
    vRingView = vec3(0.0, 0.0, 1.0);
    vRingFacet = 0.0;
    vAwakenClan = fract(sin(dot(fboUV, vec2(127.1, 311.7)) + 4.0 * 74.73) * 43758.5453);
    vTitleDust = 0.0;
    if (titleBrightness > 0.0) vTitleDust = 1.0 - texture2D(titleTexture, fboUV).w;
    if (awaken > 0.0 || titleBrightness > 0.0) {
        vRingFacet = fract(sin(dot(fboUV, vec2(12.9898, 78.233))) * 43758.5453);
    }
    if (ringMetallic > 0.0) {
        vec3 surfaceNormal;
        vec3 surfacePosition = ringPosition(fboUV, ringTime, surfaceNormal);
        vRingFacet = fract(sin(dot(fboUV, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 facetNormal = surfaceNormal + vec3(sin(vRingFacet * 71.0),
            cos(vRingFacet * 53.0), sin(vRingFacet * 37.0)) * 0.18;
        vRingNormal = normalize(mat3(modelViewMatrix) * facetNormal);
        vRingView = normalize(-mvPosition.xyz);
    }

    mvPosition += vec4(rotateParticle(position, flipRatio) * smoothstep(0.0, 0.2, positionInfo.w), 0.0);
    gl_Position = projectionMatrix * mvPosition;
    worldPosition = cameraMatrix * mvPosition;

    // chunk(shadowmap_vertex);

}
