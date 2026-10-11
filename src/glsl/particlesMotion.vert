uniform sampler2D texturePosition;
uniform sampler2D texturePrevPosition;

uniform mat4 u_prevModelViewMatrix;

varying vec2 v_motion;

void main() {

    vec4 positionInfo = texture2D( texturePosition, position.xy );
    vec4 prevPositionInfo = texture2D( texturePrevPosition, position.xy );


    vec4 mvPosition = modelViewMatrix * vec4( positionInfo.xyz, 1.0 );
    gl_PointSize = 1300.0 / length( mvPosition.xyz ) * smoothstep(0.0, 0.2, positionInfo.w);

    vec4 pos = projectionMatrix * mvPosition;
    vec4 prevPos = projectionMatrix * u_prevModelViewMatrix * vec4(prevPositionInfo.xyz, 1.0);
    // Recover the perspective near plane (currently 10) without another uniform.
    // A close chase can cross a particle between frames: those newly visible heads
    // have no usable screen-space history and must not leave an enormous streak.
    float cameraNear = max(0.001, projectionMatrix[3][2] / (projectionMatrix[2][2] - 1.0));
    float validProjection = step(cameraNear, pos.w) * step(cameraNear, prevPos.w);
    vec2 motion = pos.xy / max(cameraNear, pos.w) - prevPos.xy / max(cameraNear, prevPos.w);
    v_motion = motion * 0.5 * validProjection * step(positionInfo.w, prevPositionInfo.w);

    gl_Position = pos;

}
