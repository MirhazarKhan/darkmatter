uniform sampler2D texturePosition;
uniform float possession;
uniform float ringMetallic;
uniform float ringTime;
uniform float awaken;
uniform float titleBrightness;
uniform sampler2D titleTexture;

#pragma glslify: possessionMask = require(./helpers/possessionMask.glsl)
#pragma glslify: ringPosition = require(./helpers/ringPosition.glsl)

varying float vLife;
varying float vPossession;
varying vec3 vRingNormal;
varying vec3 vRingView;
varying float vRingFacet;
varying float vAwakenClan;
varying float vTitleDust;
// chunk(shadowmap_pars_vertex);

void main() {

    vec4 positionInfo = texture2D( texturePosition, position.xy );

    vec4 worldPosition = modelMatrix * vec4( positionInfo.xyz, 1.0 );
    vec4 mvPosition = viewMatrix * worldPosition;

    // chunk(shadowmap_vertex);

    vLife = positionInfo.w;
    vPossession = possessionMask(positionInfo.xyz, position.xy, possession);
    vRingNormal = vec3(0.0, 0.0, 1.0);
    vRingView = vec3(0.0, 0.0, 1.0);
    vRingFacet = 0.0;
    vAwakenClan = fract(sin(dot(position.xy, vec2(127.1, 311.7)) + 4.0 * 74.73) * 43758.5453);
    vTitleDust = 0.0;
    if (titleBrightness > 0.0) vTitleDust = 1.0 - texture2D(titleTexture, position.xy).w;
    if (awaken > 0.0 || titleBrightness > 0.0) {
        vRingFacet = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    if (ringMetallic > 0.0) {
        vec3 surfaceNormal;
        vec3 surfacePosition = ringPosition(position.xy, ringTime, surfaceNormal);
        vRingFacet = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
        vec3 facetNormal = surfaceNormal + vec3(sin(vRingFacet * 71.0),
            cos(vRingFacet * 53.0), sin(vRingFacet * 37.0)) * 0.18;
        vRingNormal = normalize(mat3(modelViewMatrix) * facetNormal);
        vRingView = normalize(-mvPosition.xyz);
    }
    gl_PointSize = 1300.0 / length( mvPosition.xyz ) * smoothstep(0.0, 0.2, positionInfo.w);

    gl_Position = projectionMatrix * mvPosition;

}
