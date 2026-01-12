import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GUI from 'lil-gui';

/**
 * 基本設定
 */
const scene = new THREE.Scene();
scene.background = new THREE.Color('#333');

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 60, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; 

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(20, 30, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);


/**
 * 方角ラベル (3D空間上のN,S,E,Wは残します)
 */
const createLabel = (text, x, z) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 2, z); 
    sprite.scale.set(5, 5, 1);
    sprite.renderOrder = 999;
    scene.add(sprite);
};
createLabel('N', 0, -60);
createLabel('S', 0, 60);
createLabel('E', 60, 0);
createLabel('W', -60, 0);


/**
 * 斜面ガイド線
 */
const guideGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -100, 0),
    new THREE.Vector3(0, 100, 0)
]);
const guideMaterial = new THREE.LineBasicMaterial({ 
    color: 0xff0000,
    depthTest: false,
    transparent: true,
    opacity: 0.8
});
const guideLine = new THREE.Line(guideGeometry, guideMaterial);
guideLine.position.y = 0.5;
guideLine.rotation.x = -Math.PI / 2;
guideLine.renderOrder = 999;
scene.add(guideLine);


/**
 * Level 26: シンプル・安定版
 */
const vertexShader = `
uniform float uBaseHeightDiff;
uniform float uBaseDirection;

uniform float uSlopePos;       
uniform float uSlopeHeight;
uniform float uSlopeAngle;     
uniform float uSlopeDirection; 

uniform float uDetailHeight;
uniform float uDetailScale;

varying float vElevation;
varying vec3 vNormal;
varying float vIsTopSurface;
varying vec2 vUv;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float getElevation(vec2 pos) {
    float totalElevation = 0.0;
    float c = cos(-uBaseDirection);
    float s = sin(-uBaseDirection);
    vec2 rotatedBase = vec2(pos.x * c - pos.y * s, pos.x * s + pos.y * c);
    float gradient = clamp((rotatedBase.y + 50.0) / 100.0, 0.0, 1.0);
    totalElevation += gradient * uBaseHeightDiff;

    float sd = uSlopeDirection; 
    vec2 slopeNormal = vec2(sin(sd), cos(sd)); 
    float distToLine = dot(pos, slopeNormal) - uSlopePos;

    float angleRad = radians(uSlopeAngle);
    float run = 0.0;
    if (angleRad < 1.569) { 
        run = abs(uSlopeHeight) / tan(angleRad);
    }
    float halfRun = run * 0.5;
    
    float slopeFactor = smoothstep(-halfRun, halfRun, distToLine);
    totalElevation += (slopeFactor - 0.5) * uSlopeHeight;

    float realFreq = uDetailScale * 0.1;
    float noise = snoise(pos * realFreq);
    totalElevation += noise * uDetailHeight;

    return totalElevation;
}

void main() {
    vec3 newPosition = position;
    vUv = uv;
    float isTop = step(0.5, normal.z);
    vIsTopSurface = isTop;

    if (isTop > 0.5) {
        float elevation = getElevation(newPosition.xy);
        newPosition.z += elevation;

        float shift = 0.1;
        float elevationRight = getElevation(newPosition.xy + vec2(shift, 0.0));
        float elevationUp    = getElevation(newPosition.xy + vec2(0.0, shift));
        vec3 tangentX = normalize(vec3(shift, 0.0, elevationRight - elevation));
        vec3 tangentY = normalize(vec3(0.0, shift, elevationUp - elevation));
        vNormal = normalize(cross(tangentX, tangentY));
    } else {
        if (position.z > 0.1) {
             float elevation = getElevation(newPosition.xy);
             newPosition.z += elevation;
        }
        vNormal = normal;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uBaseColor;
uniform vec3 uSideColor;

varying vec3 vNormal;
varying float vIsTopSurface;
varying vec2 vUv;

void main() {
    vec3 lightDirection = normalize(vec3(0.5, 0.5, 1.0));
    float lightness = max(dot(vNormal, lightDirection), 0.0);
    lightness = lightness * 0.5 + 0.5;
    
    vec3 finalColor = mix(uSideColor, uBaseColor, vIsTopSurface);
    
    if (vIsTopSurface > 0.5) {
        vec2 gridUV = vUv * 10.0;
        float lineWidth = 0.02; 
        
        float gridX = step(1.0 - lineWidth, fract(gridUV.x)) + step(fract(gridUV.x), lineWidth);
        float gridY = step(1.0 - lineWidth, fract(gridUV.y)) + step(fract(gridUV.y), lineWidth);
        
        float grid = clamp(gridX + gridY, 0.0, 1.0);
        finalColor = mix(finalColor, vec3(0.5), grid);
    }

    gl_FragColor = vec4(finalColor * lightness, 1.0);
}
`;

const geometry = new THREE.BoxGeometry(100, 100, 3, 256, 256, 1);
const material = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    wireframe: false,
    uniforms: {
        uBaseHeightDiff: { value: 0.0 },
        uBaseDirection:  { value: 0.0 },
        uSlopePos:       { value: 0.0 },
        uSlopeHeight:    { value: 0.0 },
        uSlopeAngle:     { value: 45.0 },
        uSlopeDirection: { value: 0.0 },
        uDetailHeight:   { value: 0.0 },
        uDetailScale:    { value: 0.0 },
        uBaseColor: { value: new THREE.Color('#4ec9b0') },
        uSideColor: { value: new THREE.Color('#8B4513') }
    }
});

const terrainMesh = new THREE.Mesh(geometry, material);
terrainMesh.rotation.x = -Math.PI / 2;
terrainMesh.receiveShadow = true;
scene.add(terrainMesh);


/**
 * UI & Logic (lil-gui)
 */
const gui = new GUI({ title: '地形造成シミュレータ' });
gui.domElement.style.top = '15px';
gui.domElement.style.right = '15px';

const debugObject = {
    baseHeight: 0.0,
    baseDirAngle: 0, 

    slopeWireVisible: true,
    slopeDirection: 0, 
    slopePos: 0.0,
    slopeHeight: 0.0,
    slopeAngle: 45.0,

    detailHeight: 0.0,
    detailScale: 0.5,
    wireframe: false
};

const render = () => {
    renderer.render(scene, camera);
};

// スライダーの目盛り追加関数(addCompassScale)は削除しました

const updateBaseDirection = () => {
    let angle = debugObject.baseDirAngle;
    const snapDist = 5;
    if (Math.abs(angle - 0) < snapDist) angle = 0;
    if (Math.abs(angle - 90) < snapDist) angle = 90;
    if (Math.abs(angle - 180) < snapDist) angle = 180;
    if (Math.abs(angle - 270) < snapDist) angle = 270;
    if (Math.abs(angle - 360) < snapDist) angle = 0; 
    const rad = (angle) * (Math.PI / 180);
    material.uniforms.uBaseDirection.value = rad;
};

const f1 = gui.addFolder('1. 全体の傾斜');
f1.add(debugObject, 'baseHeight').min(0).max(10).step(0.1).name('高低差(m)')
    .onChange(() => { material.uniforms.uBaseHeightDiff.value = debugObject.baseHeight; });

f1.add(debugObject, 'baseDirAngle').min(0).max(360).name('上がる方角')
    .onChange(updateBaseDirection)
    .onFinishChange(updateBaseDirection);


const f2 = gui.addFolder('2. 斜面・崖の生成');
f2.add(debugObject, 'slopeDirection').min(0).max(360).name('崖の向き')
    .onChange((v) => {
        const rad = v * (Math.PI / 180);
        material.uniforms.uSlopeDirection.value = rad;
        updateGuidePosition();
    });

f2.add(debugObject, 'slopePos').min(-70).max(70).step(0.1).name('崖の位置')
    .onChange(() => { 
        material.uniforms.uSlopePos.value = debugObject.slopePos;
        updateGuidePosition();
    });

f2.add(debugObject, 'slopeHeight').min(-3).max(3).step(0.1).name('斜面の高低差')
    .onChange(() => { material.uniforms.uSlopeHeight.value = debugObject.slopeHeight; });

f2.add(debugObject, 'slopeAngle').min(0).max(90).step(1).name('斜面の角度')
    .onChange(() => { material.uniforms.uSlopeAngle.value = debugObject.slopeAngle; });

f2.add(debugObject, 'slopeWireVisible').name('ガイド線表示')
    .onChange((value) => { 
        guideLine.visible = value; 
        render(); 
    });


const f3 = gui.addFolder('3. ランダムな起伏');
f3.add(debugObject, 'detailHeight').min(0).max(1.0).step(0.01).name('起伏の高さ')
    .onChange(() => { material.uniforms.uDetailHeight.value = debugObject.detailHeight; });
f3.add(debugObject, 'detailScale').min(0).max(1.0).step(0.01).name('密度の細かさ')
    .onChange(() => { material.uniforms.uDetailScale.value = debugObject.detailScale; });

gui.add(debugObject, 'wireframe').name('ワイヤーフレーム')
    .onChange((value) => { 
        material.wireframe = value; 
        render(); 
    });

const updateGuidePosition = () => {
    const rad = material.uniforms.uSlopeDirection.value;
    const offset = debugObject.slopePos;
    const nx = Math.sin(rad);
    const ny = Math.cos(rad);
    
    guideLine.position.x = nx * offset;
    guideLine.position.z = -ny * offset;
    guideLine.rotation.z = -rad - (Math.PI / 2);
};


// --- イベントリスナー ---

gui.onChange(() => {
    render();
});

controls.addEventListener('change', render);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    render();
});

// 初期化
updateBaseDirection();
updateGuidePosition();
render();