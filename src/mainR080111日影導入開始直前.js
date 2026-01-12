import './style.css'
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import GUI from 'lil-gui';

/**
 * --- ユーティリティ: JS版 Simplex Noise ---
 */
const permute = (v) => ((v * 34 + 1) * v) % 289;
const snoise = (x, y) => {
    const C = [0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439];
    let i = Math.floor(x + (x + y) * C[1]);
    let j = Math.floor(y + (x + y) * C[1]);
    let x0 = x - i + (i + j) * C[0];
    let y0 = y - j + (i + j) * C[0];
    let i1 = x0 > y0 ? [1, 0] : [0, 1];
    let x1 = x0 - i1[0] + C[0];
    let y1 = y0 - i1[1] + C[0];
    let x2 = x0 - 1.0 + 2.0 * C[0];
    let y2 = y0 - 1.0 + 2.0 * C[0];
    i &= 255; j &= 255;
    let gi0 = permute(i + permute(j)) % 12;
    let gi1 = permute(i + i1[0] + permute(j + i1[1])) % 12;
    let gi2 = permute(i + 1 + permute(j + 1)) % 12;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    let n0 = t0 < 0 ? 0 : Math.pow(t0, 4) * (([1,1,0,-1][gi0&3] || [1,0,-1,0][gi0&3]) * x0 + ([1,0,-1,0][gi0&3] || [0,-1,1,0][gi0&3]) * y0);
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    let n1 = t1 < 0 ? 0 : Math.pow(t1, 4) * (([1,1,0,-1][gi1&3] || [1,0,-1,0][gi1&3]) * x1 + ([1,0,-1,0][gi1&3] || [0,-1,1,0][gi1&3]) * y1);
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    let n2 = t2 < 0 ? 0 : Math.pow(t2, 4) * (([1,1,0,-1][gi2&3] || [1,0,-1,0][gi2&3]) * x2 + ([1,0,-1,0][gi2&3] || [0,-1,1,0][gi2&3]) * y2);
    return 70.0 * (n0 + n1 + n2);
};


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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(20, 30, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);


/**
 * 方角ラベル
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
 * ユーティリティ: 立体フレーム・4mライン生成関数
 */
// 4本の棒でロの字を作る関数 (4mライン用)
const createSquareLoop = (size, thickness, color) => {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ 
        color: color,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0
    });
    
    const geoX = new THREE.BoxGeometry(size + thickness, thickness, thickness);
    const geoZ = new THREE.BoxGeometry(thickness, thickness, size + thickness);
    const offset = size / 2;

    const top = new THREE.Mesh(geoX, mat); top.position.set(0, 0, -offset); group.add(top);
    const btm = new THREE.Mesh(geoX, mat); btm.position.set(0, 0, offset); group.add(btm);
    const left = new THREE.Mesh(geoZ, mat); left.position.set(-offset, 0, 0); group.add(left);
    const right = new THREE.Mesh(geoZ, mat); right.position.set(offset, 0, 0); group.add(right);

    return group;
};


/**
 * Level 45: 建物高さ可変・フレーム追従版
 */

// 1. 建物本体
// 初期高さ1mのBoxを作成し、あとでscale.yで高さを制御する
// 底面がY=0になるようにロジックを組む
const buildingGeometry = new THREE.BoxGeometry(10, 1, 10); 
const buildingMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x0066ff, 
    opacity: 0.5, 
    transparent: true, 
    side: THREE.FrontSide, 
    depthWrite: false 
});
const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
building.castShadow = true;
building.receiveShadow = false; 
scene.add(building);

// 2. 建物のフレーム (パーツごとに管理して太さを維持しながら変形させる)
const frameParts = {
    verticals: [],
    topBeams: [],
    bottomBeams: []
};
const frameGroup = new THREE.Group(); // scene直下に置く
scene.add(frameGroup);

{
    const w = 10, d = 10, thickness = 0.15;
    const mat = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -4.0
    });

    // 縦棒 (高さ1m基準)
    const geoY = new THREE.BoxGeometry(thickness, 1, thickness);
    const x = w / 2;
    const z = d / 2;
    [ [x,z], [-x,z], [x,-z], [-x,-z] ].forEach(pos => {
        const mesh = new THREE.Mesh(geoY, mat);
        // XZ位置は固定
        mesh.userData = { ox: pos[0], oz: pos[1] }; 
        frameParts.verticals.push(mesh);
        frameGroup.add(mesh);
    });

    // 横棒 (X方向)
    const geoX = new THREE.BoxGeometry(w + thickness, thickness, thickness);
    [ [z], [-z] ].forEach(pos => {
        // 上
        const meshT = new THREE.Mesh(geoX, mat);
        meshT.userData = { axis: 'x', oz: pos[0], type: 'top' };
        frameParts.topBeams.push(meshT);
        frameGroup.add(meshT);
        // 下
        const meshB = new THREE.Mesh(geoX, mat);
        meshB.userData = { axis: 'x', oz: pos[0], type: 'bottom' };
        frameParts.bottomBeams.push(meshB);
        frameGroup.add(meshB);
    });

    // 横棒 (Z方向)
    const geoZ = new THREE.BoxGeometry(thickness, thickness, d + thickness);
    [ [x], [-x] ].forEach(pos => {
        // 上
        const meshT = new THREE.Mesh(geoZ, mat);
        meshT.userData = { axis: 'z', ox: pos[0], type: 'top' };
        frameParts.topBeams.push(meshT);
        frameGroup.add(meshT);
        // 下
        const meshB = new THREE.Mesh(geoZ, mat);
        meshB.userData = { axis: 'z', ox: pos[0], type: 'bottom' };
        frameParts.bottomBeams.push(meshB);
        frameGroup.add(meshB);
    });
}


// 3. 接地点マーカー
const markerCount = 80;
const markerGeometry = new THREE.SphereGeometry(0.2, 8, 8);
const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xADFF2F });
const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, markerCount);
scene.add(markers);

const markerOffsets = [];
const halfSize = 5.0;
const step = 0.5;
const sideCount = 10 / step;
for (let i=0; i<sideCount; i++) markerOffsets.push({ x: -halfSize + i*step, z: -halfSize });
for (let i=0; i<sideCount; i++) markerOffsets.push({ x: halfSize, z: -halfSize + i*step });
for (let i=0; i<sideCount; i++) markerOffsets.push({ x: halfSize - i*step, z: halfSize });
for (let i=0; i<sideCount; i++) markerOffsets.push({ x: -halfSize, z: halfSize - i*step });


// 4. 測定ライン (立体のロの字)
// サイズ: 10.2m, 太さ: 0.15m
const measureLineGroup = createSquareLoop(10.2, 0.15, 0x000000);
scene.add(measureLineGroup);


/**
 * シェーダー定義
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
    wireframe: false,
    
    buildingX: 0,
    buildingZ: 0
};


// --- JavaScript版 高さ計算関数 (CPU用) ---
const getElevationJS = (worldX, worldZ) => {
    let totalElevation = 0.0;
    
    const x = worldX;
    const y = -worldZ;
    
    const uBaseDirection = material.uniforms.uBaseDirection.value;
    const uBaseHeightDiff = material.uniforms.uBaseHeightDiff.value;
    const uSlopeDirection = material.uniforms.uSlopeDirection.value;
    const uSlopePos = material.uniforms.uSlopePos.value;
    const uSlopeHeight = material.uniforms.uSlopeHeight.value;
    const uSlopeAngle = material.uniforms.uSlopeAngle.value;
    const uDetailHeight = material.uniforms.uDetailHeight.value;
    const uDetailScale = material.uniforms.uDetailScale.value;

    const c = Math.cos(-uBaseDirection);
    const s = Math.sin(-uBaseDirection);
    const ry = x * s + y * c;
    const gradient = Math.max(0.0, Math.min(1.0, (ry + 50.0) / 100.0));
    totalElevation += gradient * uBaseHeightDiff;

    const sd = uSlopeDirection;
    const slopeNormalX = Math.sin(sd);
    const slopeNormalY = Math.cos(sd);
    const distToLine = (x * slopeNormalX + y * slopeNormalY) - uSlopePos;
    const angleRad = uSlopeAngle * (Math.PI / 180);
    
    let run = 0.0;
    if (angleRad < 1.569) {
         run = Math.abs(uSlopeHeight) / Math.tan(angleRad);
    }
    const halfRun = run * 0.5;
    let slopeFactor = 0.0;

    if (halfRun < 0.0001) {
        slopeFactor = (distToLine > 0.0) ? 1.0 : 0.0;
    } else {
        const t = (distToLine - (-halfRun)) / (halfRun - (-halfRun));
        if (t <= 0.0) slopeFactor = 0.0;
        else if (t >= 1.0) slopeFactor = 1.0;
        else slopeFactor = t * t * (3.0 - 2.0 * t);
    }
    
    totalElevation += (slopeFactor - 0.5) * uSlopeHeight;

    const realFreq = uDetailScale * 0.1;
    const noiseVal = snoise(x * realFreq, y * realFreq);
    totalElevation += noiseVal * uDetailHeight;

    return totalElevation + 1.5;
};

// マーカー更新
const updateMarkers = () => {
    const dummy = new THREE.Object3D();
    let totalElevation = 0.0;

    // 接地点の計算
    for (let i = 0; i < markerCount; i++) {
        const offset = markerOffsets[i];
        const wx = debugObject.buildingX + offset.x;
        const wz = debugObject.buildingZ + offset.z;
        
        const wy = getElevationJS(wx, wz);
        
        totalElevation += wy;
        
        dummy.position.set(wx, wy, wz);
        dummy.updateMatrix();
        markers.setMatrixAt(i, dummy.matrix);
    }
    markers.instanceMatrix.needsUpdate = true;

    // 平均地盤面高さ
    const averageHeight = (totalElevation / markerCount) || 0;

    // --- 建物の更新 (Y=0 から 平均地盤面+20m まで) ---
    const totalH = averageHeight + 20.0;
    
    // 建物本体 (Base Height=1なので scale.y=totalH)
    // 中心位置は totalH/2
    building.position.set(debugObject.buildingX, totalH / 2, debugObject.buildingZ);
    building.scale.y = totalH;

    // --- フレームの更新 (太さを変えずに変形させる) ---
    // 縦棒
    frameParts.verticals.forEach(mesh => {
        mesh.scale.y = totalH; // 長さを合わせる
        mesh.position.set(
            debugObject.buildingX + mesh.userData.ox,
            totalH / 2,
            debugObject.buildingZ + mesh.userData.oz
        );
    });

    // 横棒 (上)
    frameParts.topBeams.forEach(mesh => {
        if (mesh.userData.axis === 'x') {
            mesh.position.set(debugObject.buildingX, totalH, debugObject.buildingZ + mesh.userData.oz);
        } else {
            mesh.position.set(debugObject.buildingX + mesh.userData.ox, totalH, debugObject.buildingZ);
        }
    });

    // 横棒 (下) - Y=0固定
    frameParts.bottomBeams.forEach(mesh => {
        if (mesh.userData.axis === 'x') {
            mesh.position.set(debugObject.buildingX, 0, debugObject.buildingZ + mesh.userData.oz);
        } else {
            mesh.position.set(debugObject.buildingX + mesh.userData.ox, 0, debugObject.buildingZ);
        }
    });


    // --- 測定ライン更新 (平均地盤面 + 4m) ---
    measureLineGroup.position.set(debugObject.buildingX, averageHeight + 4.0, debugObject.buildingZ);
};


const render = () => {
    updateMarkers();
    renderer.render(scene, camera);
};

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


// --- ドラッグ移動ロジック ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); 
const dragOffset = new THREE.Vector3();
let isDragging = false;

window.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 建物本体との交差判定
    const intersects = raycaster.intersectObject(building); 
    if (intersects.length > 0) {
        isDragging = true;
        controls.enabled = false;

        const intersectPoint = intersects[0].point;
        dragPlane.constant = -intersectPoint.y; 

        // クリック位置と建物中心(XZ)のオフセットを計算
        // Yは無視してXZ平面での移動量として扱う
        dragOffset.x = building.position.x - intersectPoint.x;
        dragOffset.z = building.position.z - intersectPoint.z;
        
        document.body.style.cursor = 'move';
    }
});

window.addEventListener('pointermove', (event) => {
    if (!isDragging) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersectPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, intersectPoint)) {
        
        // 新しいXZ座標
        debugObject.buildingX = intersectPoint.x + dragOffset.x;
        debugObject.buildingZ = intersectPoint.z + dragOffset.z;
        
        render();
    }
});

window.addEventListener('pointerup', () => {
    if (isDragging) {
        isDragging = false;
        controls.enabled = true;
        document.body.style.cursor = 'default';
    }
});


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

// 強制レンダリングループ
let frameCount = 0;
const initialRenderLoop = () => {
    if (frameCount < 10) { 
        updateMarkers();
        renderer.render(scene, camera);
        frameCount++;
        requestAnimationFrame(initialRenderLoop);
    }
};
initialRenderLoop();