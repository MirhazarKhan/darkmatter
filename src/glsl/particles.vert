uniform sampler2D texturePosition;
uniform float possession;

#pragma glslify: possessionMask = require(./helpers/possessionMask.glsl)

varying float vLife;
varying float vPossession;
// chunk(shadowmap_pars_vertex);

void main() {

    vec4 positionInfo = texture2D( texturePosition, position.xy );

    vec4 worldPosition = modelMatrix * vec4( positionInfo.xyz, 1.0 );
    vec4 mvPosition = viewMatrix * worldPosition;

    // chunk(shadowmap_vertex);

    vLife = positionInfo.w;
    vPossession = possessionMask(positionInfo.xyz, position.xy, possession);
    gl_PointSize = 1300.0 / length( mvPosition.xyz ) * smoothstep(0.0, 0.2, positionInfo.w);

    gl_Position = projectionMatrix * mvPosition;

}
