import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Activity, ShieldAlert, RefreshCw, Layers, Eye, Upload, Clock } from 'lucide-react';
import { useMachine } from '../context/MachineContext';

export default function ThreeDigitalTwin({ selectedMachine, currentTelemetry }) {
  const containerRef = useRef(null);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [activeHotspot, setActiveHotspot] = useState(null);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [explodedView, setExplodedView] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cadModel, setCadModel] = useState(null);
  const fileInputRef = useRef(null);

  const parseAndSetModel = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const contents = e.target.result;
      const loader = new GLTFLoader();
      loader.parse(contents, '', (gltf) => {
        setCadModel(gltf.scene);
      }, (err) => {
        console.error('Failed to parse GLTF model:', err);
        alert('Failed to parse model file. Please ensure it is a valid GLTF/GLB asset.');
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCadUpload = (event) => {
    const file = event.target.files[0];
    if (file) parseAndSetModel(file);
  };

  const handleCadDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && (file.name.endsWith('.gltf') || file.name.endsWith('.glb'))) {
      parseAndSetModel(file);
    }
  };

  const { history, isSimulatingSafeState } = useMachine();
  const isSimulatingSafeStateRef = useRef(isSimulatingSafeState);
  const simProgressRef = useRef(0);

  useEffect(() => {
    isSimulatingSafeStateRef.current = isSimulatingSafeState;
    if (!isSimulatingSafeState) {
      simProgressRef.current = 0;
    }
  }, [isSimulatingSafeState]);

  const [playbackIndex, setPlaybackIndex] = useState(null);

  const animationsRef = useRef({
    spinners: [],
    sliders: [],
    hotspots: {},
    particles: [],
    flowLines: [],
    explodeOffset: 0,
    glowRings: [],
    sparks: [],
    ambientParticles: [],
    heatmapMeshes: {},
  });

  // Store latest telemetry in a ref so the animation loop always reads fresh data
  const telemetryRef = useRef(currentTelemetry);
  useEffect(() => {
    if (playbackIndex !== null && history[playbackIndex]) {
      telemetryRef.current = history[playbackIndex];
    } else {
      telemetryRef.current = currentTelemetry;
    }
  }, [currentTelemetry, playbackIndex, history]);

  const autoRotateRef = useRef(autoRotate);
  useEffect(() => { autoRotateRef.current = autoRotate; }, [autoRotate]);

  const explodedRef = useRef(explodedView);
  useEffect(() => { explodedRef.current = explodedView; }, [explodedView]);

  const activeHotspotRef = useRef(activeHotspot);
  useEffect(() => { activeHotspotRef.current = activeHotspot; }, [activeHotspot]);

  const selectedMachineId = selectedMachine?.machine_id;
  const machineType = selectedMachine?.machine_type || 'air_compressor';

  const [hudSensorData, setHudSensorData] = useState(null);

  useEffect(() => {
    if (!activeHotspot || !selectedMachine || !currentTelemetry) {
      setHudSensorData(null);
      return;
    }
    const sensorConfig = selectedMachine.sensors.find(s => s.sensor_id === activeHotspot);
    const analysis = currentTelemetry?.analysis;
    const telemetryVal = currentTelemetry?.sensors?.[activeHotspot]?.value;
    const sensorHealth = analysis?.sensor_health?.[activeHotspot];
    if (sensorConfig) {
      setHudSensorData({
        id: activeHotspot,
        name: sensorConfig.type.replace(/_/g, ' ').toUpperCase(),
        value: telemetryVal !== undefined ? telemetryVal.toFixed(2) : 'N/A',
        unit: sensorConfig.unit,
        health: sensorHealth !== undefined ? Math.round(sensorHealth.health) : 100,
        range: sensorConfig.normal_range,
        warning: sensorConfig.warning_threshold,
        critical: sensorConfig.critical_threshold,
      });
    }
  }, [activeHotspot, currentTelemetry, selectedMachine]);

  // Main Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040814); // Deep space background
    scene.fog = new THREE.FogExp2(0x040814, 0.035);
    sceneRef.current = scene;

    // Camera — closer and at a dramatic oblique angle
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(4.2, 3.2, 5.8);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (mountRef.current) {
      mountRef.current.innerHTML = '';
      mountRef.current.appendChild(renderer.domElement);
    }

    // === LIGHTING ===
    const hemiLight = new THREE.HemisphereLight(0x0e172a, 0x020617, 0.95);
    scene.add(hemiLight);

    // Primary key light — bright white from upper-right
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(6, 10, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Fill light from the left — warm cyan
    const fillLight = new THREE.DirectionalLight(0x22d3ee, 2.2);
    fillLight.position.set(-5, 6, 3);
    scene.add(fillLight);

    // Rim/Back light from behind — gives depth
    const rimLight = new THREE.DirectionalLight(0x818cf8, 1.8);
    rimLight.position.set(-2, 4, -6);
    scene.add(rimLight);

    // Central point light inside the machine for inner glow
    const coreGlow = new THREE.PointLight(0x06b6d4, 4.5, 10);
    coreGlow.position.set(0, 1, 0);
    scene.add(coreGlow);

    // Bottom bounce light
    const bounceLight = new THREE.PointLight(0x0891b2, 2.0, 12);
    bounceLight.position.set(0, -1, 0);
    scene.add(bounceLight);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.15;
    controls.minDistance = 3;
    controls.maxDistance = 16;
    controls.target.set(0, 0.4, 0);

    // === GROUND PLATFORM (moves with base during explode) ===
    const isCNC = machineType === 'cnc_machine';
    const platformY = isCNC ? -1.94 : -2.25;
    const ringY = isCNC ? -1.89 : -2.2;
    const gridY = isCNC ? -1.99 : -2.3;
    const platformExplodeY = isCNC ? -1.2 : -0.5;

    const platformGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.08, 64);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x0c1222,
      metalness: 0.9,
      roughness: 0.4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.08,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = platformY;
    platform.receiveShadow = true;
    platform.userData = { explodeDir: new THREE.Vector3(0, platformExplodeY, 0) };
    scene.add(platform);

    // Platform ring glow
    const ringGeo = new THREE.TorusGeometry(3.5, 0.03, 8, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.6 });
    const platformRing = new THREE.Mesh(ringGeo, ringMat);
    platformRing.rotation.x = -Math.PI / 2;
    platformRing.position.y = ringY;
    platformRing.userData = { explodeDir: new THREE.Vector3(0, platformExplodeY, 0) };
    scene.add(platformRing);

    // Inner ring
    const innerRingGeo = new THREE.TorusGeometry(2.5, 0.02, 8, 48);
    const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x0891b2, transparent: true, opacity: 0.3 });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = ringY;
    innerRing.userData = { explodeDir: new THREE.Vector3(0, platformExplodeY, 0) };
    scene.add(innerRing);

    // Small grid under platform
    const gridHelper = new THREE.GridHelper(14, 28, 0x0e2236, 0x081420);
    gridHelper.position.y = gridY;
    gridHelper.userData = { explodeDir: new THREE.Vector3(0, platformExplodeY, 0) };
    scene.add(gridHelper);

    // === CUSTOM SHADERS ===
    const createHeatMaterial = (baseColorHex) => {
      return new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          heatLevel: { value: 0.0 },
          baseColor: { value: new THREE.Color(baseColorHex) }
        },
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float heatLevel;
          uniform vec3 baseColor;
          varying vec2 vUv;
          varying vec3 vNormal;
          
          void main() {
            float n = sin(vUv.x * 12.0 + time * 3.0) * cos(vUv.y * 12.0 + time * 2.0) * 0.5 + 0.5;
            vec3 normalColor = baseColor;
            vec3 warningColor = vec3(0.96, 0.62, 0.08); // Orange
            vec3 criticalColor = vec3(0.93, 0.15, 0.15); // Red
            
            vec3 hotColor = mix(warningColor, criticalColor, smoothstep(0.5, 1.0, heatLevel));
            vec3 blendedColor = mix(normalColor, hotColor, heatLevel * (0.8 + n * 0.2));
            
            float pulse = sin(time * 6.0) * 0.1 + 0.9;
            float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
            rim = pow(rim, 2.5) * heatLevel * pulse;
            
            gl_FragColor = vec4(blendedColor + criticalColor * rim * 1.2, 1.0);
          }
        `
      });
    };

    // === MATERIALS — Industrial Painted Metals ===
    const materials = {
      flowPipe: new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          flowSpeed: { value: 2.0 },
          color: { value: new THREE.Color(0x06b6d4) }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float time;
          uniform float flowSpeed;
          uniform vec3 color;
          varying vec2 vUv;
          void main() {
            float pulse = sin(vUv.y * 25.0 - time * flowSpeed * 8.0);
            pulse = smoothstep(0.3, 0.7, pulse);
            float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
            edge = pow(edge, 2.0);
            vec3 finalColor = mix(color * 0.2, color * 2.0, pulse * edge);
            gl_FragColor = vec4(finalColor, 0.25 + pulse * edge * 0.55);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }),
      // Motor body — dark charcoal cast iron
      bodyMetal: new THREE.MeshStandardMaterial({
        color: 0x2d3436,
        metalness: 0.35,
        roughness: 0.65,
      }),
      accentCyan: new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        metalness: 0.4,
        roughness: 0.3,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.4,
      }),
      // Pressure tank — industrial blue paint
      chassis: new THREE.MeshStandardMaterial({
        color: 0x2d4a7a,
        metalness: 0.2,
        roughness: 0.45,
      }),
      glass: new THREE.MeshPhysicalMaterial({
        color: 0xb0b0b0,
        transparent: true,
        opacity: 0.12,
        roughness: 0.1,
        metalness: 0.1,
        transmission: 0.75,
        ior: 1.4,
      }),
      // Chrome/galvanized steel pipes
      pipe: new THREE.MeshStandardMaterial({
        color: 0xc8ccd0,
        metalness: 0.85,
        roughness: 0.18,
      }),
      // Copper discharge line
      copperPipe: new THREE.MeshStandardMaterial({
        color: 0xb87333,
        metalness: 0.75,
        roughness: 0.3,
      }),
      // Pulley belt — black rubber
      rubberBelt: new THREE.MeshStandardMaterial({
        color: 0x18181b,
        metalness: 0.05,
        roughness: 0.85,
      }),
      // Brass valves and fittings
      brassValves: new THREE.MeshStandardMaterial({
        color: 0xc9a227,
        metalness: 0.8,
        roughness: 0.28,
      }),
      hotMetal: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        metalness: 0.7,
        roughness: 0.3,
        emissive: 0xb45309,
        emissiveIntensity: 0.2,
      }),
      // Cast iron — pump head, motor fins
      castIron: new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        metalness: 0.4,
        roughness: 0.7,
      }),
      // Skid base — structural steel
      structuralSteel: new THREE.MeshStandardMaterial({
        color: 0x555f66,
        metalness: 0.5,
        roughness: 0.55,
      }),
      // Safety labels / nameplate
      labelWhite: new THREE.MeshStandardMaterial({
        color: 0xe8e8e8,
        metalness: 0.0,
        roughness: 0.9,
      }),
      // Rubber isolation pad
      rubberPad: new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.0,
        roughness: 0.95,
      }),
    };

    // === HELPER: Create mesh with subtle technical edges ===
    const createMesh = (geometry, material, edgeColor = 0x374151) => {
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (wireframeMode) {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.1;
      }

      const edges = new THREE.EdgesGeometry(geometry);
      const lineMat = new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: wireframeMode ? 0.9 : 0.06,
      });
      const lines = new THREE.LineSegments(edges, lineMat);
      mesh.add(lines);
      return mesh;
    };

    // Machine group
    const machineGroup = new THREE.Group();
    scene.add(machineGroup);

    animationsRef.current = {
      spinners: [], sliders: [], hotspots: {}, particles: [], flowLines: [], explodeOffset: 0, glowRings: [], sparks: [], ambientParticles: [], heatmapMeshes: {},
    };

    // === HELPER: Hotspot ===
    const addHotspot = (sensorId, x, y, z) => {
      const geo = new THREE.SphereGeometry(0.18, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.userData = { sensorId, originalPos: new THREE.Vector3(x, y, z) };
      machineGroup.add(mesh);
      animationsRef.current.hotspots[sensorId] = mesh;

      // Outer pulsing ring
      const rGeo = new THREE.RingGeometry(0.25, 0.3, 24);
      const rMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.userData = { isRing: true };
      mesh.add(ring);

      // Label line going up
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.5, 0),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.4 });
      const line = new THREE.Line(lineGeo, lineMat);
      mesh.add(line);
    };

    // ============================================================
    // BUILD AIR COMPRESSOR OR LOAD CUSTOM CAD MODEL
    // ============================================================
    if (cadModel) {
      const box = new THREE.Box3().setFromObject(cadModel);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 2.8 / (maxDim || 1.0);
      cadModel.scale.setScalar(scale);
      
      const center = box.getCenter(new THREE.Vector3());
      cadModel.position.set(-center.x * scale, -center.y * scale + 0.4, -center.z * scale);
      
      machineGroup.add(cadModel);
      
      cadModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          const name = child.name.toLowerCase();
          let matchedKey = null;
          
          if (name.includes('motor')) matchedKey = 'motor';
          else if (name.includes('pump') && name.includes('cap')) matchedKey = 'pumpCap';
          else if (name.includes('pump')) matchedKey = 'pump';
          else if (name.includes('drill')) matchedKey = 'drill';
          else if (name.includes('chuck')) matchedKey = 'chuck';
          else if (name.includes('workpiece') || name.includes('block')) matchedKey = 'workpiece';
          
          if (matchedKey) {
            const origColor = child.material.color ? child.material.color.getHex() : 0x8e9aaf;
            child.material = createHeatMaterial(origColor);
            animationsRef.current.heatmapMeshes[matchedKey] = child;
          }
        }
      });
      
      if (machineType === 'air_compressor') {
        addHotspot('temp_01', 0, 1.2, 0);
        addHotspot('vib_01', 0, 1.5, 0.5);
        addHotspot('pres_01', 0.8, 0, 0.8);
      } else {
        addHotspot('spindle_01', 0, 1.2, 0);
        addHotspot('wear_01', 0, 0.5, 0.5);
        addHotspot('cool_01', -0.5, 0.8, 0.5);
      }
    } else {
      if (machineType === 'air_compressor') {

      // ============================================================
      // INDUSTRIAL RECIPROCATING AIR COMPRESSOR
      // ============================================================

      // === SKID BASE FRAME (rectangular channel steel frame) ===
      const skidLongGeo = new THREE.BoxGeometry(4.6, 0.18, 0.3);
      const skidFront = createMesh(skidLongGeo, materials.structuralSteel, 0x3d4450);
      skidFront.position.set(0, -2.0, 1.0);
      skidFront.userData = { name: 'skid_front', explodeDir: new THREE.Vector3(0, -0.5, 0.2) };
      machineGroup.add(skidFront);

      const skidBack = createMesh(skidLongGeo, materials.structuralSteel, 0x3d4450);
      skidBack.position.set(0, -2.0, -1.0);
      skidBack.userData = { name: 'skid_back', explodeDir: new THREE.Vector3(0, -0.5, -0.2) };
      machineGroup.add(skidBack);

      // Cross members
      const skidCrossGeo = new THREE.BoxGeometry(0.22, 0.14, 2.0);
      for (let cx = -1.6; cx <= 1.6; cx += 1.6) {
        const cross = createMesh(skidCrossGeo, materials.structuralSteel, 0x3d4450);
        cross.position.set(cx, -2.0, 0);
        cross.userData = { explodeDir: new THREE.Vector3(cx > 0 ? 0.2 : -0.2, -0.5, 0) };
        machineGroup.add(cross);
      }

      // Rubber vibration isolation pads (under corners)
      const padGeo = new THREE.BoxGeometry(0.5, 0.08, 0.45);
      const padPositions = [[-1.8, -2.13, 1.0], [-1.8, -2.13, -1.0], [1.8, -2.13, 1.0], [1.8, -2.13, -1.0]];
      padPositions.forEach(([px, py, pz]) => {
        const pad = createMesh(padGeo, materials.rubberPad, 0x222222);
        pad.position.set(px, py, pz);
        pad.userData = { explodeDir: new THREE.Vector3(px > 0 ? 0.3 : -0.3, -0.4, pz > 0 ? 0.1 : -0.1) };
        machineGroup.add(pad);
      });

      // === MAIN PRESSURE VESSEL (horizontal cylinder) ===
      const tankGeo = new THREE.CylinderGeometry(1.25, 1.25, 3.8, 32);
      tankGeo.rotateZ(Math.PI / 2);
      const tank = createMesh(tankGeo, materials.chassis, 0x1e3a5f);
      tank.position.set(0, -0.3, 0);
      tank.userData = { name: 'tank', explodeDir: new THREE.Vector3(0, -0.6, 0) };
      machineGroup.add(tank);

      // Hemispherical end caps (dished ends)
      const capGeo = new THREE.SphereGeometry(1.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const capLeft = createMesh(capGeo, materials.chassis, 0x1e3a5f);
      capLeft.rotation.z = Math.PI / 2;
      capLeft.position.set(-1.9, -0.3, 0);
      capLeft.userData = { explodeDir: new THREE.Vector3(-0.5, -0.6, 0) };
      machineGroup.add(capLeft);

      const capRight = createMesh(capGeo, materials.chassis, 0x1e3a5f);
      capRight.rotation.z = -Math.PI / 2;
      capRight.position.set(1.9, -0.3, 0);
      capRight.userData = { explodeDir: new THREE.Vector3(0.5, -0.6, 0) };
      machineGroup.add(capRight);

      // Welded seam bands on tank
      for (let i = -1; i <= 1; i++) {
        const seamGeo = new THREE.TorusGeometry(1.26, 0.025, 6, 32);
        const seam = new THREE.Mesh(seamGeo, new THREE.MeshStandardMaterial({
          color: 0x6b7d8a, metalness: 0.6, roughness: 0.4,
        }));
        seam.rotation.y = Math.PI / 2;
        seam.position.set(i * 1.0, -0.3, 0);
        seam.userData = { explodeDir: new THREE.Vector3(0, -0.6, 0) };
        machineGroup.add(seam);
      }

      // Nameplate (small rectangle on tank side)
      const nameplateGeo = new THREE.BoxGeometry(0.5, 0.3, 0.02);
      const nameplate = createMesh(nameplateGeo, materials.labelWhite, 0x999999);
      nameplate.position.set(0.5, -0.3, 1.26);
      nameplate.userData = { explodeDir: new THREE.Vector3(0, -0.6, 0.2) };
      machineGroup.add(nameplate);

      // Nameplate border detail
      const npBorderGeo = new THREE.BoxGeometry(0.54, 0.34, 0.015);
      const npBorder = new THREE.Mesh(npBorderGeo, materials.brassValves.clone());
      npBorder.position.set(0.5, -0.3, 1.255);
      npBorder.userData = { explodeDir: new THREE.Vector3(0, -0.6, 0.2) };
      machineGroup.add(npBorder);

      // === TANK SUPPORT SADDLES (cradle brackets) ===
      const saddleGeo = new THREE.BoxGeometry(0.35, 1.2, 1.4);
      const saddleLeft = createMesh(saddleGeo, materials.structuralSteel, 0x3d4450);
      saddleLeft.position.set(-1.3, -1.3, 0);
      saddleLeft.userData = { name: 'saddle_l', explodeDir: new THREE.Vector3(-0.3, -0.5, 0) };
      machineGroup.add(saddleLeft);

      const saddleRight = createMesh(saddleGeo, materials.structuralSteel, 0x3d4450);
      saddleRight.position.set(1.3, -1.3, 0);
      saddleRight.userData = { name: 'saddle_r', explodeDir: new THREE.Vector3(0.3, -0.5, 0) };
      machineGroup.add(saddleRight);

      // Saddle top curved plates (hugging the tank)
      for (const sx of [-1.3, 1.3]) {
        const curveGeo = new THREE.CylinderGeometry(1.28, 1.28, 0.12, 32, 1, false, -Math.PI * 0.35, Math.PI * 0.7);
        curveGeo.rotateZ(Math.PI / 2);
        const curvePlate = new THREE.Mesh(curveGeo, materials.structuralSteel.clone());
        curvePlate.position.set(sx, -0.65, 0);
        curvePlate.userData = { explodeDir: new THREE.Vector3(sx > 0 ? 0.3 : -0.3, -0.5, 0) };
        machineGroup.add(curvePlate);
      }

      // === DRAIN VALVE (bottom of tank center) ===
      const drainBodyGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8);
      const drainBody = createMesh(drainBodyGeo, materials.brassValves, 0x8a7020);
      drainBody.position.set(0, -1.7, 0);
      drainBody.userData = { name: 'drain_valve', explodeDir: new THREE.Vector3(0, -0.8, 0) };
      machineGroup.add(drainBody);

      const drainHandleGeo = new THREE.BoxGeometry(0.18, 0.04, 0.04);
      const drainHandle = createMesh(drainHandleGeo, materials.brassValves, 0x8a7020);
      drainHandle.position.set(0, -1.88, 0);
      drainHandle.userData = { explodeDir: new THREE.Vector3(0, -0.8, 0) };
      machineGroup.add(drainHandle);

      // === ELECTRIC MOTOR (cylindrical TEFC motor with cooling fins) ===
      const motorBodyGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.6, 24);
      motorBodyGeo.rotateZ(Math.PI / 2);
      const motor = createMesh(motorBodyGeo, createHeatMaterial(0x2d3436), 0x3d4450);
      motor.position.set(-0.6, 1.4, 0);
      motor.userData = { name: 'motor', explodeDir: new THREE.Vector3(-0.3, 1.2, 0) };
      machineGroup.add(motor);
      animationsRef.current.heatmapMeshes.motor = motor;

      // Motor cooling fins (vertical ribs along the body)
      for (let f = 0; f < 10; f++) {
        const finGeo = new THREE.BoxGeometry(0.12, 1.32, 0.035);
        finGeo.rotateZ(Math.PI / 2);
        const fin = new THREE.Mesh(finGeo, new THREE.MeshStandardMaterial({
          color: 0x363d42, metalness: 0.35, roughness: 0.7,
        }));
        const angle = (f / 10) * Math.PI * 2;
        fin.position.set(
          -0.6 + 0, // centered on motor
          1.4 + Math.sin(angle) * 0.67,
          Math.cos(angle) * 0.67
        );
        fin.rotation.x = angle;
        fin.userData = { explodeDir: new THREE.Vector3(-0.3, 1.2, 0) };
        machineGroup.add(fin);
      }

      // Motor front end bell (drive end)
      const motorFrontBellGeo = new THREE.CylinderGeometry(0.68, 0.62, 0.15, 24);
      motorFrontBellGeo.rotateZ(Math.PI / 2);
      const motorFrontBell = createMesh(motorFrontBellGeo, materials.castIron, 0x3d4450);
      motorFrontBell.position.set(0.22, 1.4, 0);
      motorFrontBell.userData = { explodeDir: new THREE.Vector3(0.1, 1.2, 0) };
      machineGroup.add(motorFrontBell);

      // Motor rear end bell (fan end)
      const motorRearBellGeo = new THREE.CylinderGeometry(0.68, 0.55, 0.15, 24);
      motorRearBellGeo.rotateZ(Math.PI / 2);
      const motorRearBell = createMesh(motorRearBellGeo, materials.castIron, 0x3d4450);
      motorRearBell.position.set(-1.42, 1.4, 0);
      motorRearBell.userData = { explodeDir: new THREE.Vector3(-0.5, 1.2, 0) };
      machineGroup.add(motorRearBell);

      // Motor terminal box (junction box on top)
      const termBoxGeo = new THREE.BoxGeometry(0.28, 0.2, 0.22);
      const termBox = createMesh(termBoxGeo, materials.castIron, 0x3d4450);
      termBox.position.set(-0.3, 2.12, 0);
      termBox.userData = { name: 'terminal_box', explodeDir: new THREE.Vector3(-0.3, 1.5, 0) };
      machineGroup.add(termBox);

      // Terminal box conduit stub
      const conduitGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
      const conduit = createMesh(conduitGeo, materials.pipe, 0x555555);
      conduit.position.set(-0.3, 2.35, 0);
      conduit.userData = { explodeDir: new THREE.Vector3(-0.3, 1.5, 0) };
      machineGroup.add(conduit);

      // Motor mounting feet (2 small L-brackets)
      const motorFootGeo = new THREE.BoxGeometry(0.3, 0.1, 0.2);
      for (const mfz of [-0.55, 0.55]) {
        const mFoot = createMesh(motorFootGeo, materials.castIron, 0x3d4450);
        mFoot.position.set(-0.6, 0.72, mfz);
        mFoot.userData = { explodeDir: new THREE.Vector3(-0.3, 0.8, mfz > 0 ? 0.2 : -0.2) };
        machineGroup.add(mFoot);
      }

      // Motor shaft stub (visible between motor and pump)
      const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 12);
      shaftGeo.rotateZ(Math.PI / 2);
      const shaft = createMesh(shaftGeo, materials.pipe, 0x555555);
      shaft.position.set(0.45, 1.4, 0);
      shaft.userData = { explodeDir: new THREE.Vector3(0.2, 1.2, 0) };
      machineGroup.add(shaft);

      // === TWO-STAGE COMPRESSOR PUMP HEAD ===
      // Stage 1 (larger low-pressure cylinder)
      const stage1Geo = new THREE.CylinderGeometry(0.5, 0.55, 1.1, 16);
      const pump = createMesh(stage1Geo, createHeatMaterial(0x4a4a4a), 0x555555);
      pump.position.set(1.0, 1.5, -0.3);
      pump.userData = { name: 'pump', explodeDir: new THREE.Vector3(0.4, 1.2, -0.2) };
      machineGroup.add(pump);
      animationsRef.current.heatmapMeshes.pump = pump;

      // Stage 1 cooling fins
      for (let cf = 0; cf < 6; cf++) {
        const finRingGeo = new THREE.TorusGeometry(0.56, 0.025, 6, 24);
        const finRing = new THREE.Mesh(finRingGeo, new THREE.MeshStandardMaterial({
          color: 0x555555, metalness: 0.4, roughness: 0.65,
        }));
        finRing.rotation.x = Math.PI / 2;
        finRing.position.set(1.0, 1.15 + cf * 0.14, -0.3);
        finRing.userData = { explodeDir: new THREE.Vector3(0.4, 1.2, -0.2) };
        machineGroup.add(finRing);
      }

      // Stage 2 (smaller high-pressure cylinder on top)
      const stage2Geo = new THREE.CylinderGeometry(0.32, 0.38, 0.8, 16);
      const pumpCap = createMesh(stage2Geo, createHeatMaterial(0x4a4a4a), 0x555555);
      pumpCap.position.set(1.0, 1.5, 0.4);
      pumpCap.userData = { name: 'pump_stage2', explodeDir: new THREE.Vector3(0.4, 1.5, 0.3) };
      machineGroup.add(pumpCap);
      animationsRef.current.heatmapMeshes.pumpCap = pumpCap;

      // Stage 2 cooling fins
      for (let cf2 = 0; cf2 < 4; cf2++) {
        const fin2Geo = new THREE.TorusGeometry(0.4, 0.02, 6, 20);
        const fin2 = new THREE.Mesh(fin2Geo, new THREE.MeshStandardMaterial({
          color: 0x555555, metalness: 0.4, roughness: 0.65,
        }));
        fin2.rotation.x = Math.PI / 2;
        fin2.position.set(1.0, 1.25 + cf2 * 0.14, 0.4);
        fin2.userData = { explodeDir: new THREE.Vector3(0.4, 1.5, 0.3) };
        machineGroup.add(fin2);
      }

      // Pump head cap/valve plate (top of stage 1)
      const valvePlateGeo = new THREE.CylinderGeometry(0.48, 0.52, 0.1, 16);
      const valvePlate = createMesh(valvePlateGeo, materials.castIron, 0x555555);
      valvePlate.position.set(1.0, 2.1, -0.3);
      valvePlate.userData = { explodeDir: new THREE.Vector3(0.4, 1.5, -0.2) };
      machineGroup.add(valvePlate);

      // Intercooler pipe connecting stage 1 to stage 2
      const interPipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12);
      interPipeGeo.rotateX(Math.PI / 2);
      const interPipe = createMesh(interPipeGeo, materials.copperPipe, 0x7a5520);
      interPipe.position.set(1.0, 2.0, 0.05);
      interPipe.userData = { explodeDir: new THREE.Vector3(0.4, 1.5, 0) };
      machineGroup.add(interPipe);

      // === INTAKE AIR FILTER (cylindrical canister) ===
      const filterBodyGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.5, 16);
      const filter = createMesh(filterBodyGeo, materials.castIron, 0x555555);
      filter.position.set(1.5, 1.9, -0.3);
      filter.rotation.z = Math.PI / 6;
      filter.userData = { name: 'intake_filter', explodeDir: new THREE.Vector3(0.6, 1.3, -0.2) };
      machineGroup.add(filter);

      // Filter cap
      const filterCapGeo = new THREE.CylinderGeometry(0.2, 0.28, 0.08, 16);
      const filterCap = createMesh(filterCapGeo, materials.bodyMetal, 0x333333);
      filterCap.position.set(1.62, 2.0, -0.18);
      filterCap.rotation.z = Math.PI / 6;
      filterCap.userData = { explodeDir: new THREE.Vector3(0.6, 1.3, -0.2) };
      machineGroup.add(filterCap);

      // === CHECK VALVE (between pump discharge and tank) ===
      const checkValveGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.25, 12);
      const checkValve = createMesh(checkValveGeo, materials.brassValves, 0x8a7020);
      checkValve.position.set(0.4, 0.7, 0);
      checkValve.userData = { name: 'check_valve', explodeDir: new THREE.Vector3(0.2, 0.6, 0) };
      machineGroup.add(checkValve);

      // Check valve hex body detail
      const checkHexGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 6);
      const checkHex = createMesh(checkHexGeo, materials.brassValves, 0x8a7020);
      checkHex.position.set(0.4, 0.7, 0);
      checkHex.userData = { explodeDir: new THREE.Vector3(0.2, 0.6, 0) };
      machineGroup.add(checkHex);

      // === DISCHARGE PIPING (pump to check valve to tank) ===
      // Vertical pipe from pump head down
      const dischargePipe1Geo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 12);
      const dischargePipe1 = createMesh(dischargePipe1Geo, materials.pipe, 0x666666);
      dischargePipe1.position.set(1.0, 0.6, -0.3);
      dischargePipe1.userData = { explodeDir: new THREE.Vector3(0.4, 0.5, -0.2) };
      machineGroup.add(dischargePipe1);

      // Horizontal pipe from pump to check valve
      const dischargePipe2Geo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 12);
      dischargePipe2Geo.rotateZ(Math.PI / 2);
      const dischargePipe2 = createMesh(dischargePipe2Geo, materials.pipe, 0x666666);
      dischargePipe2.position.set(0.7, 0.7, 0);
      dischargePipe2.userData = { explodeDir: new THREE.Vector3(0.3, 0.6, 0) };
      machineGroup.add(dischargePipe2);

      // Aftercooler coil section (copper tubing between pump and tank)
      for (let c = 0; c < 4; c++) {
        const coilGeo = new THREE.TorusGeometry(0.12, 0.03, 8, 20);
        const coil = createMesh(coilGeo, materials.copperPipe, 0x7a5520);
        coil.rotation.x = Math.PI / 2;
        coil.position.set(0.6, 0.35 + c * 0.1, 0);
        coil.userData = { explodeDir: new THREE.Vector3(0.3, 0.4, 0) };
        machineGroup.add(coil);
      }

      // Pipe into tank top (from check valve down into vessel)
      const tankInletGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12);
      const tankInlet = createMesh(tankInletGeo, materials.pipe, 0x666666);
      tankInlet.position.set(0.4, 0.5, 0);
      tankInlet.userData = { explodeDir: new THREE.Vector3(0.2, 0.4, 0) };
      machineGroup.add(tankInlet);

      // Flow shader pipe (animated compressed air flow visualization)
      const flowPipeGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.4, 12);
      flowPipeGeo.rotateZ(Math.PI / 2);
      const flowPipe = createMesh(flowPipeGeo, materials.flowPipe, 0x06b6d4);
      flowPipe.position.set(0.15, 1.4, 0);
      flowPipe.userData = { explodeDir: new THREE.Vector3(0, 1.0, 0) };
      machineGroup.add(flowPipe);

      // === SAFETY / PRV VALVE (on tank top) ===
      // PRV body (mushroom-shaped pressure relief valve)
      const prvBaseGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12);
      const prvBase = createMesh(prvBaseGeo, materials.brassValves, 0x8a7020);
      prvBase.position.set(-0.5, 1.05, 0);
      prvBase.userData = { name: 'prv_valve', explodeDir: new THREE.Vector3(-0.2, 0.8, 0) };
      machineGroup.add(prvBase);

      // PRV cap (mushroom top)
      const prvCapGeo = new THREE.CylinderGeometry(0.04, 0.12, 0.12, 12);
      const prvCap = createMesh(prvCapGeo, materials.brassValves, 0x8a7020);
      prvCap.position.set(-0.5, 1.2, 0);
      prvCap.userData = { explodeDir: new THREE.Vector3(-0.2, 0.9, 0) };
      machineGroup.add(prvCap);

      // PRV ring handle
      const prvRingGeo = new THREE.TorusGeometry(0.06, 0.015, 6, 12);
      const prvRing = new THREE.Mesh(prvRingGeo, materials.brassValves.clone());
      prvRing.position.set(-0.5, 1.3, 0);
      prvRing.userData = { explodeDir: new THREE.Vector3(-0.2, 1.0, 0) };
      machineGroup.add(prvRing);

      // === PRESSURE SWITCH (mounted on manifold) ===
      const pSwitchGeo = new THREE.BoxGeometry(0.22, 0.18, 0.16);
      const pSwitch = createMesh(pSwitchGeo, materials.bodyMetal, 0x333333);
      pSwitch.position.set(-0.1, 1.15, 0.4);
      pSwitch.userData = { name: 'pressure_switch', explodeDir: new THREE.Vector3(-0.1, 0.9, 0.3) };
      machineGroup.add(pSwitch);

      // Pressure switch conduit
      const pSwitchPipeGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.25, 8);
      const pSwitchPipe = createMesh(pSwitchPipeGeo, materials.pipe, 0x555555);
      pSwitchPipe.position.set(-0.1, 1.0, 0.4);
      pSwitchPipe.userData = { explodeDir: new THREE.Vector3(-0.1, 0.8, 0.3) };
      machineGroup.add(pSwitchPipe);

      // === COOLING FAN / FLYWHEEL (motor fan end) ===
      const fanBackGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.06, 24);
      fanBackGeo.rotateX(Math.PI / 2);
      const fanBack = createMesh(fanBackGeo, materials.castIron, 0x3d4450);
      fanBack.position.set(-0.6, 1.4, 0.75);
      fanBack.userData = { explodeDir: new THREE.Vector3(-0.3, 1.2, 0.8) };
      machineGroup.add(fanBack);

      // Fan hub
      const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12);
      hubGeo.rotateX(Math.PI / 2);
      const hub = new THREE.Mesh(hubGeo, materials.castIron.clone());
      hub.position.set(-0.6, 1.4, 0.82);
      hub.userData = { explodeDir: new THREE.Vector3(-0.3, 1.2, 1.0) };
      machineGroup.add(hub);

      // Blades Group (spinning fan)
      const bladesGroup = new THREE.Group();
      bladesGroup.position.set(-0.6, 1.4, 0.82);
      bladesGroup.userData = { isFan: true, explodeDir: new THREE.Vector3(-0.3, 1.2, 1.0) };
      const bladeGeo = new THREE.BoxGeometry(0.08, 0.55, 0.015);
      for (let i = 0; i < 8; i++) {
        const blade = new THREE.Mesh(bladeGeo, materials.castIron.clone());
        blade.rotation.z = (Math.PI / 4) * i;
        bladesGroup.add(blade);
      }
      machineGroup.add(bladesGroup);
      animationsRef.current.spinners.push({ obj: bladesGroup, axis: 'z' });

      // === PUMP FLYWHEEL/PULLEY ===
      const pumpPulleyGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.08, 24);
      pumpPulleyGeo.rotateX(Math.PI / 2);
      const pumpPulley = createMesh(pumpPulleyGeo, materials.castIron, 0x3d4450);
      pumpPulley.position.set(1.0, 1.4, 0.75);
      pumpPulley.userData = { isPumpPulley: true, explodeDir: new THREE.Vector3(0.4, 1.2, 0.8) };
      machineGroup.add(pumpPulley);
      animationsRef.current.spinners.push({ obj: pumpPulley, axis: 'z' });

      // Pulley V-groove detail
      const grooveGeo = new THREE.TorusGeometry(0.58, 0.02, 6, 24);
      const groove = new THREE.Mesh(grooveGeo, new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.5, roughness: 0.5 }));
      groove.position.set(1.0, 1.4, 0.75);
      groove.userData = { explodeDir: new THREE.Vector3(0.4, 1.2, 0.8) };
      machineGroup.add(groove);

      // === V-BELT DRIVE ===
      const beltPoints = [];
      const numPoints = 32;
      const rMotor = 0.12;
      const rPump = 0.58;
      const xMotor = -0.6;
      const xPump = 1.0;
      const yMotor = 1.4;
      const yPump = 1.4;
      const zBelt = 0.75;
      for (let i = 0; i <= numPoints; i++) {
        const theta = (i / numPoints) * Math.PI * 2;
        let px, py;
        if (theta < Math.PI) {
          px = xPump + Math.sin(theta) * rPump;
          py = yPump + Math.cos(theta) * rPump;
        } else {
          px = xMotor + Math.sin(theta) * rMotor;
          py = yMotor + Math.cos(theta) * rMotor;
        }
        beltPoints.push(new THREE.Vector3(px, py, zBelt));
      }
      const beltCurve = new THREE.CatmullRomCurve3(beltPoints);
      const beltGeo = new THREE.TubeGeometry(beltCurve, 64, 0.035, 8, true);
      const beltMesh = createMesh(beltGeo, materials.rubberBelt, 0x18181b);
      beltMesh.userData = { explodeDir: new THREE.Vector3(0.15, 1.2, 0.9) };
      machineGroup.add(beltMesh);

      // === BELT GUARD (semi-transparent safety cover) ===
      const guardGeo = new THREE.BoxGeometry(2.2, 1.4, 0.08);
      const guardMat = new THREE.MeshPhysicalMaterial({
        color: 0x888888,
        transparent: true,
        opacity: 0.08,
        roughness: 0.3,
        metalness: 0.2,
        side: THREE.DoubleSide,
      });
      const beltGuard = new THREE.Mesh(guardGeo, guardMat);
      beltGuard.position.set(0.2, 1.4, 0.95);
      beltGuard.userData = { name: 'belt_guard', explodeDir: new THREE.Vector3(0.1, 1.2, 1.2) };
      machineGroup.add(beltGuard);

      // Guard frame edges (wire perimeter)
      const guardEdge = new THREE.EdgesGeometry(guardGeo);
      const guardEdgeMat = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.4 });
      const guardEdgeLines = new THREE.LineSegments(guardEdge, guardEdgeMat);
      beltGuard.add(guardEdgeLines);

      // Guard mesh pattern (diagonal wire mesh lines)
      for (let mg = -4; mg <= 4; mg++) {
        const meshLineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-1.0 + mg * 0.15, -0.65, 0.01),
          new THREE.Vector3(-1.0 + mg * 0.15 + 0.6, 0.65, 0.01),
        ]);
        const meshLine = new THREE.Line(meshLineGeo, new THREE.LineBasicMaterial({
          color: 0x666666, transparent: true, opacity: 0.15,
        }));
        beltGuard.add(meshLine);
      }

      // === PRESSURE GAUGE (with needle) ===
      const gaugeBaseGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.06, 16);
      gaugeBaseGeo.rotateX(Math.PI / 2);
      const gaugeBase = new THREE.Mesh(gaugeBaseGeo, materials.brassValves.clone());
      gaugeBase.position.set(1.2, 0.3, 1.26);
      gaugeBase.userData = { explodeDir: new THREE.Vector3(0.2, 0.1, 0.4) };
      machineGroup.add(gaugeBase);

      const gaugeFaceGeo = new THREE.CircleGeometry(0.15, 16);
      const gaugeFace = new THREE.Mesh(gaugeFaceGeo, new THREE.MeshBasicMaterial({
        color: 0xf5f5f0,
      }));
      gaugeFace.position.set(1.2, 0.3, 1.29);
      gaugeFace.userData = { explodeDir: new THREE.Vector3(0.2, 0.1, 0.4) };
      machineGroup.add(gaugeFace);

      // Gauge bezel ring
      const bezelGeo = new THREE.TorusGeometry(0.17, 0.02, 8, 24);
      const bezel = new THREE.Mesh(bezelGeo, new THREE.MeshStandardMaterial({
        color: 0x888888, metalness: 0.8, roughness: 0.2,
      }));
      bezel.position.set(1.2, 0.3, 1.28);
      bezel.userData = { explodeDir: new THREE.Vector3(0.2, 0.1, 0.4) };
      machineGroup.add(bezel);

      // Gauge needle
      const needleGeo = new THREE.BoxGeometry(0.015, 0.12, 0.01);
      const needle = new THREE.Mesh(needleGeo, new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      needle.position.set(1.2, 0.3, 1.30);
      needle.userData = { isNeedle: true, explodeDir: new THREE.Vector3(0.2, 0.1, 0.4) };
      machineGroup.add(needle);

      // Gauge fitting pipe
      const fittingGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 8);
      fittingGeo.rotateX(Math.PI / 2);
      const fitting = createMesh(fittingGeo, materials.brassValves, 0x8a7020);
      fitting.position.set(1.2, 0.3, 1.13);
      fitting.userData = { explodeDir: new THREE.Vector3(0.2, 0.1, 0.4) };
      machineGroup.add(fitting);

      // === OUTLET COUPLER (quick-connect on tank side) ===
      const outletGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 12);
      outletGeo.rotateX(Math.PI / 2);
      const outlet = createMesh(outletGeo, materials.brassValves, 0x8a7020);
      outlet.position.set(-1.0, 0.3, 1.35);
      outlet.userData = { name: 'outlet', explodeDir: new THREE.Vector3(-0.2, 0.1, 0.4) };
      machineGroup.add(outlet);

      // Outlet ball valve handle
      const outletHandleGeo = new THREE.BoxGeometry(0.15, 0.04, 0.04);
      const outletHandle = new THREE.Mesh(outletHandleGeo, new THREE.MeshStandardMaterial({
        color: 0xef4444, metalness: 0.3, roughness: 0.5,
      }));
      outletHandle.position.set(-1.0, 0.3, 1.48);
      outletHandle.userData = { explodeDir: new THREE.Vector3(-0.2, 0.1, 0.4) };
      machineGroup.add(outletHandle);

      // === FLOW PARTICLES (compressed air flow line visualization) ===
      const flowPath = [
        new THREE.Vector3(1.0, 1.4, 0),
        new THREE.Vector3(0.15, 1.4, 0),
        new THREE.Vector3(-0.6, 1.4, 0),
      ];
      animationsRef.current.flowLines.push(flowPath);
      const pGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const pMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7 });
      for (let k = 0; k < 6; k++) {
        const p = new THREE.Mesh(pGeo, pMat.clone());
        p.userData = { progress: k / 6 };
        scene.add(p);
        animationsRef.current.particles.push(p);
      }

      // === SENSOR HOTSPOTS ===
      addHotspot('temp_01', -0.6, 2.2, 0.3);    // Motor temperature
      addHotspot('vib_01', 1.0, 2.2, -0.1);      // Pump vibration
      addHotspot('pres_01', 1.2, 0.5, 1.35);     // Pressure gauge area
      addHotspot('rpm_01', -1.5, 1.4, 0.85);     // Fan/RPM area
      addHotspot('pwr_01', -0.3, 2.5, 0.0);      // Power/terminal box

    } else if (machineType === 'cnc_machine') {
      // ============================================================
      // INDUSTRIAL CNC VERTICAL MILLING MACHINE
      // ============================================================

      // --- Heavy Base Cabinet (cast iron) ---
      const baseGeo = new THREE.BoxGeometry(4.0, 1.4, 3.0);
      const base = createMesh(baseGeo, materials.chassis, 0x1e3a5f);
      base.position.set(0, -1.1, 0);
      base.userData = { name: 'base', explodeDir: new THREE.Vector3(0, -1.0, 0) };
      machineGroup.add(base);

      // Base front access door
      const panelGeo = new THREE.BoxGeometry(1.8, 0.9, 0.04);
      const panel = createMesh(panelGeo, materials.structuralSteel, 0x3d4450);
      panel.position.set(0, -1.0, 1.53);
      panel.userData = { explodeDir: new THREE.Vector3(0, -1.0, 0.5) };
      machineGroup.add(panel);

      // Door handle
      const doorHandleGeo = new THREE.BoxGeometry(0.3, 0.05, 0.04);
      const doorHandle = new THREE.Mesh(doorHandleGeo, materials.pipe.clone());
      doorHandle.position.set(0.6, -0.7, 1.56);
      machineGroup.add(doorHandle);

      // Cabinet ventilation louvers
      for (let side = -1; side <= 1; side += 2) {
        for (let row = 0; row < 5; row++) {
          const louverGeo = new THREE.BoxGeometry(0.04, 0.06, 1.8);
          const louver = new THREE.Mesh(louverGeo, new THREE.MeshStandardMaterial({
            color: 0x1a2a3a, metalness: 0.3, roughness: 0.6,
          }));
          louver.position.set(2.02 * side, -0.85 + row * 0.18, 0);
          louver.userData = { explodeDir: new THREE.Vector3(side * 0.5, -0.3, 0) };
          machineGroup.add(louver);
        }
      }

      // Leveling feet
      const footGeo = new THREE.CylinderGeometry(0.15, 0.18, 0.1, 12);
      [[-1.7, -1.85, 1.2], [-1.7, -1.85, -1.2], [1.7, -1.85, 1.2], [1.7, -1.85, -1.2]].forEach(([fx, fy, fz]) => {
        const foot = createMesh(footGeo, materials.castIron, 0x3d4450);
        foot.position.set(fx, fy, fz);
        foot.userData = { explodeDir: new THREE.Vector3(fx > 0 ? 0.2 : -0.2, -1.2, fz > 0 ? 0.1 : -0.1) };
        machineGroup.add(foot);
      });

      // Chip tray
      const chipTrayGeo = new THREE.BoxGeometry(2.6, 0.08, 2.0);
      const chipTray = createMesh(chipTrayGeo, materials.structuralSteel, 0x3d4450);
      chipTray.position.set(0.2, -0.38, 0);
      chipTray.userData = { name: 'chip_tray', explodeDir: new THREE.Vector3(0, -0.4, 0.5) };
      machineGroup.add(chipTray);

      // --- Gantry Column (cast iron) ---
      const frameGeo = new THREE.BoxGeometry(0.8, 3.0, 2.8);
      const frame = createMesh(frameGeo, materials.castIron, 0x3d4450);
      frame.position.set(-1.6, 0.6, 0);
      frame.userData = { name: 'frame', explodeDir: new THREE.Vector3(-1.2, 0, 0) };
      machineGroup.add(frame);

      // Column reinforcement ribs
      for (let ribY = -0.5; ribY <= 1.5; ribY += 0.5) {
        const cRibGeo = new THREE.BoxGeometry(0.15, 0.06, 2.6);
        const cRib = new THREE.Mesh(cRibGeo, new THREE.MeshStandardMaterial({ color: 0x3d3d3d, metalness: 0.4, roughness: 0.7 }));
        cRib.position.set(-1.18, ribY, 0);
        machineGroup.add(cRib);
      }

      // --- Linear Guide Rails (rectangular profile) ---
      const railGeo = new THREE.BoxGeometry(3.0, 0.08, 0.12);
      const rail1 = createMesh(railGeo, materials.pipe, 0x555555);
      rail1.position.set(0.1, 1.7, 0.35);
      rail1.userData = { explodeDir: new THREE.Vector3(0, 1.0, 0.2) };
      machineGroup.add(rail1);

      const rail2 = createMesh(railGeo, materials.pipe, 0x555555);
      rail2.position.set(0.1, 1.2, 0.35);
      rail2.userData = { explodeDir: new THREE.Vector3(0, 1.0, 0.2) };
      machineGroup.add(rail2);

      // Ball screw
      const ballScrewGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.8, 12);
      ballScrewGeo.rotateZ(Math.PI / 2);
      const ballScrew = createMesh(ballScrewGeo, materials.pipe, 0x555555);
      ballScrew.position.set(0.1, 1.45, 0.2);
      machineGroup.add(ballScrew);

      // Way covers (accordion bellows)
      for (const wcSide of [-1, 1]) {
        const wcGeo = new THREE.BoxGeometry(0.8, 0.5, 0.06);
        const wayCover = new THREE.Mesh(wcGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.9 }));
        wayCover.position.set(0.2 + wcSide * 1.2, 1.45, 0.42);
        wayCover.userData = { explodeDir: new THREE.Vector3(wcSide * 0.5, 0.6, 0.5) };
        machineGroup.add(wayCover);
        for (let fold = -3; fold <= 3; fold++) {
          const fGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.38, fold * 0.06, 0.031), new THREE.Vector3(0.38, fold * 0.06, 0.031)
          ]);
          wayCover.add(new THREE.Line(fGeo, new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.4 })));
        }
      }

      // Rail support brackets
      const railBracketGeo = new THREE.BoxGeometry(0.2, 0.8, 0.3);
      const bracketLeft = createMesh(railBracketGeo, materials.castIron, 0x3d4450);
      bracketLeft.position.set(-1.3, 1.45, 0.35);
      bracketLeft.userData = { explodeDir: new THREE.Vector3(-0.3, 0.5, 0) };
      machineGroup.add(bracketLeft);
      const bracketRight = createMesh(railBracketGeo, materials.castIron, 0x3d4450);
      bracketRight.position.set(1.5, 1.45, 0.35);
      bracketRight.userData = { explodeDir: new THREE.Vector3(0.3, 0.5, 0) };
      machineGroup.add(bracketRight);

      // --- Sliding Carriage / Headstock ---
      const carriageGeo = new THREE.BoxGeometry(0.9, 1.1, 0.8);
      const carriage = createMesh(carriageGeo, materials.castIron, 0x3d4450);
      carriage.position.set(0.2, 1.45, 0.5);
      carriage.userData = { name: 'carriage', explodeDir: new THREE.Vector3(0, 0.6, 1.0) };
      machineGroup.add(carriage);
      animationsRef.current.sliders.push({ obj: carriage, axis: 'x', amp: 1.0, baseVal: 0.2 });

      // Bearing blocks
      const blockGeo = new THREE.BoxGeometry(0.3, 0.2, 0.15);
      const blockTop = createMesh(blockGeo, materials.structuralSteel, 0x3d4450);
      blockTop.position.set(0, 0.25, -0.15);
      carriage.add(blockTop);
      const blockBottom = createMesh(blockGeo, materials.structuralSteel, 0x3d4450);
      blockBottom.position.set(0, -0.25, -0.15);
      carriage.add(blockBottom);

      // Spindle Motor Housing
      const spindleGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.1, 16);
      const spindle = createMesh(spindleGeo, materials.bodyMetal, 0x3d4450);
      spindle.position.set(0, -0.3, 0.4);
      carriage.add(spindle);

      // Spindle cooling fins
      for (let r = 0; r < 5; r++) {
        const ribGeo = new THREE.TorusGeometry(0.31, 0.015, 6, 24);
        const rib = new THREE.Mesh(ribGeo, new THREE.MeshStandardMaterial({ color: 0x3d3d3d, metalness: 0.4, roughness: 0.65 }));
        rib.rotation.x = Math.PI / 2;
        rib.position.set(0, 0.1 - r * 0.2, 0.4);
        carriage.add(rib);
      }

      // Tool holder (spins)
      const toolHolderGroup = new THREE.Group();
      toolHolderGroup.position.set(0, -0.75, 0.4);
      toolHolderGroup.userData = { isToolHolder: true };
      
      const chuckGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12);
      const chuck = createMesh(chuckGeo, createHeatMaterial(0x8a7020), 0x6b5520);
      toolHolderGroup.add(chuck);
      animationsRef.current.heatmapMeshes.chuck = chuck;

      // Collet nut
      const colletNutGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 6);
      toolHolderGroup.add(new THREE.Mesh(colletNutGeo, materials.brassValves.clone()));

      const drillGeo = new THREE.CylinderGeometry(0.04, 0.015, 0.4, 12);
      const drill = createMesh(drillGeo, createHeatMaterial(0xc8ccd0), 0x555555);
      drill.position.set(0, -0.31, 0);
      toolHolderGroup.add(drill);
      animationsRef.current.heatmapMeshes.drill = drill;

      carriage.add(toolHolderGroup);
      animationsRef.current.spinners.push({ obj: toolHolderGroup, axis: 'y' });

      // Coolant nozzle
      const nozzleGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.35, 8);
      nozzleGeo.rotateX(Math.PI / 5);
      const nozzle = new THREE.Mesh(nozzleGeo, materials.copperPipe.clone());
      nozzle.position.set(0.3, -0.5, 0.45);
      carriage.add(nozzle);

      // --- Work Bed & Vice ---
      const bedGeo = new THREE.BoxGeometry(2.2, 0.12, 1.8);
      const bed = createMesh(bedGeo, materials.bodyMetal, 0x0891b2);
      bed.position.set(0.2, -0.25, 0);
      bed.userData = { name: 'bed', explodeDir: new THREE.Vector3(0, -0.3, 0) };
      machineGroup.add(bed);

      // T-slot grooves on bed
      for (let t = -2; t <= 2; t++) {
        const slotGeo = new THREE.BoxGeometry(2.0, 0.02, 0.06);
        const slot = new THREE.Mesh(slotGeo, new THREE.MeshBasicMaterial({
          color: 0x06b6d4, transparent: true, opacity: 0.3,
        }));
        slot.position.set(0.2, -0.18, t * 0.35);
        machineGroup.add(slot);
      }

      // Vice mounted on the workbed
      const viceBaseGeo = new THREE.BoxGeometry(1.0, 0.18, 1.2);
      const viceBase = createMesh(viceBaseGeo, materials.chassis, 0x0891b2);
      viceBase.position.set(0.2, -0.1, 0);
      viceBase.userData = { name: 'vice', explodeDir: new THREE.Vector3(0, -0.35, 0) };
      machineGroup.add(viceBase);

      const jawGeo = new THREE.BoxGeometry(0.15, 0.25, 1.0);
      const jawLeft = createMesh(jawGeo, materials.bodyMetal, 0x0891b2);
      jawLeft.position.set(-0.25, 0.05, 0);
      viceBase.add(jawLeft);

      const jawRight = createMesh(jawGeo, materials.bodyMetal, 0x0891b2);
      jawRight.position.set(0.25, 0.05, 0);
      viceBase.add(jawRight);

      // Workpiece block (held by the vice jaws)
      const workpieceGeo = new THREE.BoxGeometry(0.32, 0.22, 0.7);
      const workpiece = createMesh(workpieceGeo, createHeatMaterial(0xe2e8f0), 0x94a3b8);
      workpiece.position.set(0, 0.06, 0);
      viceBase.add(workpiece);
      animationsRef.current.heatmapMeshes.workpiece = workpiece;

      // --- Glass Enclosure (Translucent outer shroud) ---
      const encGeo = new THREE.BoxGeometry(4.1, 3.2, 3.1);
      const enc = createMesh(encGeo, materials.glass, 0x22d3ee);
      enc.position.set(0, 0, 0);
      enc.userData = { name: 'enclosure', explodeDir: new THREE.Vector3(0, 0, 1.5) };
      machineGroup.add(enc);

      // --- Control Panel ---
      const ctrlGeo = new THREE.BoxGeometry(0.6, 0.8, 0.1);
      const ctrl = createMesh(ctrlGeo, materials.chassis, 0x06b6d4);
      ctrl.position.set(1.5, 0.5, 1.55);
      ctrl.userData = { explodeDir: new THREE.Vector3(0.5, 0, 1.0) };
      machineGroup.add(ctrl);

      // Screen on control panel
      const screenGeo = new THREE.PlaneGeometry(0.4, 0.35);
      const screen = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({
        color: 0x06b6d4, transparent: true, opacity: 0.5,
      }));
      screen.position.set(1.5, 0.55, 1.61);
      machineGroup.add(screen);

      // --- Industrial Status Tower Stack Light ---
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
      const pole = createMesh(poleGeo, materials.pipe, 0x94a3b8);
      pole.position.set(-1.6, 2.3, -1.0);
      pole.userData = { explodeDir: new THREE.Vector3(-0.5, 0.5, -0.5) };
      machineGroup.add(pole);

      const redLightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12);
      const redLightMat = new THREE.MeshStandardMaterial({ color: 0x450a0a, roughness: 0.2 });
      const redLight = new THREE.Mesh(redLightGeo, redLightMat);
      redLight.position.set(-1.6, 2.75, -1.0);
      redLight.userData = { isStackLight: true, state: 'critical', explodeDir: new THREE.Vector3(-0.5, 0.5, -0.5) };
      machineGroup.add(redLight);

      const amberLightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12);
      const amberLightMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.2 });
      const amberLight = new THREE.Mesh(amberLightGeo, amberLightMat);
      amberLight.position.set(-1.6, 2.6, -1.0);
      amberLight.userData = { isStackLight: true, state: 'warning', explodeDir: new THREE.Vector3(-0.5, 0.5, -0.5) };
      machineGroup.add(amberLight);

      const greenLightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.15, 12);
      const greenLightMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.2 });
      const greenLight = new THREE.Mesh(greenLightGeo, greenLightMat);
      greenLight.position.set(-1.6, 2.45, -1.0);
      greenLight.userData = { isStackLight: true, state: 'normal', explodeDir: new THREE.Vector3(-0.5, 0.5, -0.5) };
      machineGroup.add(greenLight);

      // --- Sparks Particle Pool (CNC Cutting) ---
      const sparksPool = [];
      const sparkGeo = new THREE.SphereGeometry(0.02, 4, 4);
      const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true });
      for (let s = 0; s < 25; s++) {
        const spark = new THREE.Mesh(sparkGeo, sparkMat.clone());
        spark.visible = false;
        spark.userData = {
          velocity: new THREE.Vector3(),
          life: 0,
          maxLife: 0,
        };
        scene.add(spark);
        sparksPool.push(spark);
      }
      animationsRef.current.sparks = sparksPool;

      // Hotspots
      addHotspot('spindle_01', 0.2, 0.7, 1.2);
      addHotspot('feed_01', -0.4, 1.5, 1.2);
      addHotspot('wear_01', 0.2, -0.05, 0.9);
      addHotspot('cool_01', 0.55, 0.8, 1.0);
      addHotspot('vib_cnc_01', -1.5, 1.9, 0.8);
    }
    }

    // === AMBIENT FLOATING DUST PARTICLES ===
    const ambientParticles = [];
    const ambGeo = new THREE.SphereGeometry(0.012, 4, 4);
    const ambMat = new THREE.MeshBasicMaterial({
      color: 0x0891b2,
      transparent: true,
      opacity: 0.2,
    });
    const numAmb = 45;
    for (let a = 0; a < numAmb; a++) {
      const mesh = new THREE.Mesh(ambGeo, ambMat.clone());
      mesh.position.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 6 + 1,
        (Math.random() - 0.5) * 10
      );
      mesh.userData = {
        speedY: 0.002 + Math.random() * 0.004,
        speedX: (Math.random() - 0.5) * 0.003,
        speedZ: (Math.random() - 0.5) * 0.003,
      };
      scene.add(mesh);
      ambientParticles.push(mesh);
    }
    animationsRef.current.ambientParticles = ambientParticles;

    // === CLICK HANDLER ===
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onCanvasClick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(machineGroup.children, true);

      const hotspotHit = intersects.find(i => {
        let p = i.object;
        while (p) { if (p.userData?.sensorId) return true; p = p.parent; }
        return false;
      });

      if (hotspotHit) {
        let obj = hotspotHit.object;
        while (obj && !obj.userData?.sensorId) obj = obj.parent;
        if (obj) setActiveHotspot(obj.userData.sensorId);
      } else {
        if (intersects.length === 0) setActiveHotspot(null);
      }
    };
    renderer.domElement.addEventListener('click', onCanvasClick);

    // === ANIMATION LOOP ===
    let animFrameId;
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const tele = telemetryRef.current;

      const p = simProgressRef.current;
      if (isSimulatingSafeStateRef.current) {
        simProgressRef.current = Math.min(simProgressRef.current + 0.005, 1.0);
      }

      let rpm = tele?.sensors?.rpm_01?.value || 1800;
      let spindleSpd = tele?.sensors?.spindle_01?.value || 10000;
      let feedRate = tele?.sensors?.feed_01?.value || 350;

      if (isSimulatingSafeStateRef.current) {
        rpm = THREE.MathUtils.lerp(rpm, 0, p);
        spindleSpd = THREE.MathUtils.lerp(spindleSpd, 0, p);
        feedRate = THREE.MathUtils.lerp(feedRate, 0, p);
      }

      // Auto-rotate
      if (autoRotateRef.current && !activeHotspotRef.current) {
        machineGroup.rotation.y = t * 0.15;
      }

      // Platform ring rotation
      platformRing.rotation.z = t * 0.1;
      innerRing.rotation.z = -t * 0.15;

      // Core glow pulsation
      coreGlow.intensity = 3.5 + Math.sin(t * 3) * 1.5;

      // Spinners (blades, pulley, drill chuck)
      animationsRef.current.spinners.forEach(s => {
        let speed = 0.03;
        if (machineType === 'air_compressor') {
          speed = (rpm / 1800) * 0.06;
        } else {
          speed = (spindleSpd / 10000) * 0.12;
        }
        let spinSpeed = Math.max(speed, 0.005);
        if (isSimulatingSafeStateRef.current) {
          spinSpeed *= (1.0 - p);
        }
        s.obj.rotation[s.axis] += spinSpeed;
      });

      // Sliders (carriage X movement)
      let carriageMesh = null;
      animationsRef.current.sliders.forEach(s => {
        if (s.obj.userData?.name === 'carriage') carriageMesh = s.obj;
        let cycle = (feedRate / 500) * 0.012;
        if (isSimulatingSafeStateRef.current) {
          cycle *= (1.0 - p);
        }
        const offset = Math.sin(t * cycle * 100) * s.amp;
        s.obj.position[s.axis] = s.baseVal + offset;
      });

      // Flow particles (air compressor flow line)
      if (machineType === 'air_compressor' && animationsRef.current.flowLines.length > 0) {
        const path = animationsRef.current.flowLines[0];
        animationsRef.current.particles.forEach(p => {
          let prog = p.userData.progress + 0.012;
          if (prog > 1.0) prog = 0;
          p.userData.progress = prog;
          p.visible = true;
          if (prog < 0.5) {
            p.position.lerpVectors(path[0], path[1], prog * 2);
          } else {
            p.position.lerpVectors(path[1], path[2], (prog - 0.5) * 2);
          }
          p.position.applyMatrix4(machineGroup.matrixWorld);
        });
      } else {
        animationsRef.current.particles.forEach(p => p.visible = false);
      }

      // Animate pressure gauge needle (air compressor)
      if (machineType === 'air_compressor') {
        let pres = tele?.sensors?.pres_01?.value || 85;
        if (isSimulatingSafeStateRef.current) {
          pres = THREE.MathUtils.lerp(pres, 0, p);
        }
        const needleMesh = machineGroup.children.find(c => c.userData?.isNeedle);
        if (needleMesh) {
          const angle = -Math.PI / 4 + (pres / 120) * (Math.PI * 1.5);
          needleMesh.rotation.z = -angle;
        }
      }

      // Update stack lights and cutting sparks for CNC Mill
      if (machineType === 'cnc_machine') {
        let alertLvl = tele?.analysis?.alert_level || 'normal';
        if (isSimulatingSafeStateRef.current && p > 0.5) {
          alertLvl = 'normal';
        }
        
        // 1. Stack Lights
        machineGroup.children.forEach(child => {
          if (child.userData?.isStackLight) {
            const state = child.userData.state;
            const mat = child.material;
            
            if (state === 'critical') {
              if (alertLvl === 'critical' || alertLvl === 'failure') {
                mat.color.setHex(0xef4444);
                mat.emissive.setHex(0xef4444);
                mat.emissiveIntensity = 1.6 + Math.sin(t * 8) * 0.6; // blinking red
              } else {
                mat.color.setHex(0x450a0a);
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 0;
              }
            } else if (state === 'warning') {
              if (alertLvl === 'warning') {
                mat.color.setHex(0xf59e0b);
                mat.emissive.setHex(0xf59e0b);
                mat.emissiveIntensity = 1.2 + Math.sin(t * 5) * 0.3; // blinking amber
              } else {
                mat.color.setHex(0x451a03);
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 0;
              }
            } else if (state === 'normal') {
              if (alertLvl === 'normal' || !alertLvl) {
                mat.color.setHex(0x10b981);
                mat.emissive.setHex(0x10b981);
                mat.emissiveIntensity = 0.8;
              } else {
                mat.color.setHex(0x064e3b);
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 0;
              }
            }
          }
        });

        // 2. Cutting Sparks Emitter at moving tool tip
        const isRunning = spindleSpd > 1000;
        const toolTipWorld = new THREE.Vector3();
        let drillObj = null;
        
        if (carriageMesh) {
          carriageMesh.traverse(child => {
            if (child.userData?.isToolHolder) drillObj = child;
          });
        }
        
        if (drillObj) {
          if (isSimulatingSafeStateRef.current) {
            drillObj.position.y = THREE.MathUtils.lerp(-0.75, -0.20, p);
          } else {
            drillObj.position.y = -0.75;
          }
          toolTipWorld.setFromMatrixPosition(drillObj.matrixWorld);
          toolTipWorld.y -= 0.45; // Shift to drill bit tip
        } else if (carriageMesh) {
          toolTipWorld.set(carriageMesh.position.x, carriageMesh.position.y - 1.26, carriageMesh.position.z + 0.4);
          toolTipWorld.applyMatrix4(machineGroup.matrixWorld);
        }

        const sparks = animationsRef.current.sparks || [];
        sparks.forEach(spark => {
          if (spark.visible) {
            spark.position.add(spark.userData.velocity);
            spark.userData.velocity.y -= 0.003; // gravity
            spark.userData.life += 1;
            spark.material.opacity = 1.0 - (spark.userData.life / spark.userData.maxLife);
            if (spark.userData.life >= spark.userData.maxLife) {
              spark.visible = false;
            }
          } else if (isRunning && Math.random() < (feedRate / 500) * 0.45) {
            spark.visible = true;
            spark.position.copy(toolTipWorld);
            spark.position.x += (Math.random() - 0.5) * 0.05;
            spark.position.y += (Math.random() - 0.5) * 0.02;
            spark.position.z += (Math.random() - 0.5) * 0.05;
            
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.02 + Math.random() * 0.03;
            spark.userData.velocity.set(
              Math.cos(angle) * speed,
              0.015 + Math.random() * 0.02, // upward burst
              Math.sin(angle) * speed
            );
            spark.userData.life = 0;
            spark.userData.maxLife = 15 + Math.floor(Math.random() * 15);
            if (alertLvl === 'critical' || alertLvl === 'failure') {
              spark.material.color.setHex(0xff3300);
            } else {
              spark.material.color.setHex(0xffaa00 + Math.floor(Math.random() * 0x005500));
            }
          }
        });
      } else {
        const sparks = animationsRef.current.sparks || [];
        sparks.forEach(s => s.visible = false);
      }

      // Ambient particles slow floating animation
      const ambParticles = animationsRef.current.ambientParticles || [];
      ambParticles.forEach(p => {
        p.position.y += p.userData.speedY;
        p.position.x += p.userData.speedX;
        p.position.z += p.userData.speedZ;
        
        if (p.position.y > 4.5) {
          p.position.y = -2.5;
          p.position.x = (Math.random() - 0.5) * 12;
          p.position.z = (Math.random() - 0.5) * 10;
        }
      });

      // Hotspots scale & color animation
      Object.entries(animationsRef.current.hotspots).forEach(([sid, mesh]) => {
        const scale = 1.0 + Math.sin(t * 5) * 0.2;
        mesh.scale.setScalar(scale);
        mesh.children.forEach(child => {
          if (child.userData.isRing) {
            const rs = 1.0 + (t * 2) % 2.5;
            child.scale.set(rs, rs, 1);
            child.material.opacity = 0.6 * Math.max(0, 1 - (rs - 1) / 2.5);
            child.lookAt(camera.position);
          }
        });

        const analysis = tele?.analysis;
        const sh = analysis?.sensor_health?.[sid];
        const hVal = sh ? sh.health : 100;
        let col = 0x10b981;
        if (hVal < 40) col = 0xef4444;
        else if (hVal < 70) col = 0xf59e0b;
        mesh.material.color.setHex(col);
        mesh.children.forEach(c => {
          if (c.userData.isRing) c.material.color.setHex(col);
        });
      });

      // Explode view transitions
      const targetExp = explodedRef.current ? 1.5 : 0.0;
      animationsRef.current.explodeOffset += (targetExp - animationsRef.current.explodeOffset) * 0.06;
      const curExp = animationsRef.current.explodeOffset;

      machineGroup.children.forEach(child => {
        if (child.userData?.explodeDir) {
          const dir = child.userData.explodeDir;
          if (child.userData.originalPos) {
            child.position.copy(child.userData.originalPos).addScaledVector(dir, curExp);
          } else {
            if (!child.userData.initPos) child.userData.initPos = child.position.clone();
            child.position.copy(child.userData.initPos).addScaledVector(dir, curExp);
          }
        }
      });

      // Also explode the platform elements (scene-level objects)
      [platform, platformRing, innerRing, gridHelper].forEach(obj => {
        if (obj.userData?.explodeDir) {
          const dir = obj.userData.explodeDir;
          if (!obj.userData.initPos) obj.userData.initPos = obj.position.clone();
          obj.position.copy(obj.userData.initPos).addScaledVector(dir, curExp);
        }
      });

      // === DYNAMIC HEATMAP & VIBRATION ANIMATIONS ===
      // Animate custom GLSL flow pipe shader
      if (materials.flowPipe && materials.flowPipe.uniforms) {
        materials.flowPipe.uniforms.time.value = t;
        let flowSpd = 2.0;
        if (machineType === 'air_compressor') {
          flowSpd = (rpm / 1800) * 3.0;
        } else {
          flowSpd = (spindleSpd / 10000) * 3.0;
        }
        materials.flowPipe.uniforms.flowSpeed.value = Math.max(flowSpd, 0.2);
      }

      if (machineType === 'air_compressor') {
        let temp = tele?.sensors?.temp_01?.value ?? 65.0;
        let vib = tele?.sensors?.vib_01?.value ?? 2.5;

        if (isSimulatingSafeStateRef.current) {
          temp = THREE.MathUtils.lerp(temp, 20.0, p);
          vib = THREE.MathUtils.lerp(vib, 0, p);
        }

        // Temperature mapping to Motor & Pump Head (glowing heatmap)
        // Normal range is 55.0 to 75.0, warning at 78.0, critical at 92.0
        // We scale temp from 60.0 to 92.0 for glowing color factor
        const tempMin = 60.0;
        const tempMax = 92.0;
        const heatFactor = Math.min(Math.max((temp - tempMin) / (tempMax - tempMin), 0.0), 1.0);

        const hm = animationsRef.current.heatmapMeshes || {};

        if (hm.motor && hm.motor.material.uniforms) {
          hm.motor.material.uniforms.heatLevel.value = heatFactor;
          hm.motor.material.uniforms.time.value = t;
        }

        if (hm.pump && hm.pump.material.uniforms) {
          hm.pump.material.uniforms.heatLevel.value = heatFactor;
          hm.pump.material.uniforms.time.value = t;
        }

        if (hm.pumpCap && hm.pumpCap.material.uniforms) {
          hm.pumpCap.material.uniforms.heatLevel.value = heatFactor;
          hm.pumpCap.material.uniforms.time.value = t;
        }

        // Structural vibration feedback (shakes the whole machineGroup based on vib_01)
        if (vib > 3.5) {
          const intensity = (vib - 3.5) * 0.012;
          machineGroup.position.set(
            (Math.random() - 0.5) * intensity,
            (Math.random() - 0.5) * intensity,
            (Math.random() - 0.5) * intensity
          );
        } else {
          machineGroup.position.set(0, 0, 0);
        }

      } else if (machineType === 'cnc_machine') {
        let wear = tele?.sensors?.wear_01?.value ?? 40.0;
        let cool = tele?.sensors?.cool_01?.value ?? 22.0;
        let vib = tele?.sensors?.vib_cnc_01?.value ?? 1.5;

        if (isSimulatingSafeStateRef.current) {
          wear = THREE.MathUtils.lerp(wear, 0, p);
          cool = THREE.MathUtils.lerp(cool, 22.0, p);
          vib = THREE.MathUtils.lerp(vib, 0, p);
        }

        // 1. Tool Wear -> Drill Bit Heat
        // Normal range 0 to 80, warning at 120, critical at 200.
        // Scale from 60 to 200 -> 0.0 to 1.0.
        const wearMin = 60.0;
        const wearMax = 200.0;
        const wearFactor = Math.min(Math.max((wear - wearMin) / (wearMax - wearMin), 0.0), 1.0);

        // 2. Coolant Temp -> Workpiece Heat (lack of coolant/pump blockage heats workpiece)
        // Normal range 18.0 to 28.0, warning at 32.0, critical at 40.0.
        // Scale from 22.0 to 40.0 -> 0.0 to 1.0.
        const coolMin = 22.0;
        const coolMax = 40.0;
        const coolFactor = Math.min(Math.max((cool - coolMin) / (coolMax - coolMin), 0.0), 1.0);

        // 3. Spindle Vibration -> Chuck Heat (Spindle Bearing friction)
        // Normal range 0.5 to 2.5, warning at 3.5, critical at 5.5.
        // Scale from 2.0 to 5.5 -> 0.0 to 1.0.
        const vibMin = 2.0;
        const vibMax = 5.5;
        const vibFactor = Math.min(Math.max((vib - vibMin) / (vibMax - vibMin), 0.0), 1.0);

        const hm = animationsRef.current.heatmapMeshes || {};

        if (hm.drill && hm.drill.material.uniforms) {
          hm.drill.material.uniforms.heatLevel.value = wearFactor;
          hm.drill.material.uniforms.time.value = t;
        }

        if (hm.workpiece && hm.workpiece.material.uniforms) {
          hm.workpiece.material.uniforms.heatLevel.value = coolFactor;
          hm.workpiece.material.uniforms.time.value = t;
        }

        if (hm.chuck && hm.chuck.material.uniforms) {
          hm.chuck.material.uniforms.heatLevel.value = vibFactor;
          hm.chuck.material.uniforms.time.value = t;
        }

        // Structural vibration feedback for CNC Mill
        if (vib > 2.5) {
          const intensity = (vib - 2.5) * 0.015;
          machineGroup.position.set(
            (Math.random() - 0.5) * intensity,
            (Math.random() - 0.5) * intensity,
            (Math.random() - 0.5) * intensity
          );
        } else {
          machineGroup.position.set(0, 0, 0);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onCanvasClick);
      cancelAnimationFrame(animFrameId);
      if (mountRef.current) mountRef.current.innerHTML = '';
      
      // Traverse scene and dispose of geometries, materials, and children
      scene.traverse((obj) => {
        if (obj.isMesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        } else if (obj.isLine || obj.isPoints) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
        }
      });
      renderer.dispose();
    };
  }, [machineType, wireframeMode, selectedMachineId]);

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCadDrop}
      className="relative w-full bg-slate-950/60 border border-cyan-500/15 rounded-2xl overflow-hidden card-hover"
      style={{ height: '480px' }}
    >
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleCadUpload} 
        accept=".gltf,.glb" 
        className="hidden" 
      />

      {/* Top Left HUD */}
      <div className="absolute top-4 left-4 pointer-events-none flex flex-col gap-0.5">
        <span className="text-[9px] font-bold text-cyan-500/60 uppercase tracking-[0.25em] font-mono">Cyber Twin Simulator v2.0</span>
        <h3 className="text-sm font-black text-white tracking-wider flex items-center gap-1.5 font-mono">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse-live" />
          {selectedMachine?.display_name || 'Asset Model'}
        </h3>
        <span className="text-[9px] text-slate-400/70 font-mono mt-0.5 bg-slate-900/80 px-2 py-0.5 rounded border border-cyan-500/10 self-start">
          Status: ACTIVE | Ref: {selectedMachineId}
        </span>
      </div>

      {/* Controls HUD (Top Right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1 bg-slate-950/90 border border-cyan-500/20 rounded-xl p-1 z-10 backdrop-blur-md">
        <button onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-lg text-xs transition-all duration-200 flex items-center gap-1 cursor-pointer text-slate-500 hover:text-white border border-transparent"
          title="Upload Custom GLTF/GLB CAD Model">
          <Upload className="w-3.5 h-3.5" />
          <span className="text-[8px] font-bold uppercase tracking-wider font-mono">Upload CAD</span>
        </button>
        <button onClick={() => setAutoRotate(!autoRotate)}
          className={`p-1.5 rounded-lg text-xs transition-all duration-200 flex items-center gap-1 cursor-pointer ${autoRotate ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-white border border-transparent'}`}
          title="Toggle Auto Rotate">
          <RefreshCw className={`w-3.5 h-3.5 ${autoRotate ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
          <span className="text-[8px] font-bold uppercase tracking-wider font-mono">Spin</span>
        </button>
        <button onClick={() => setExplodedView(!explodedView)}
          className={`p-1.5 rounded-lg text-xs transition-all duration-200 flex items-center gap-1 cursor-pointer ${explodedView ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-white border border-transparent'}`}
          title="Explode Schematic View">
          <Layers className="w-3.5 h-3.5" />
          <span className="text-[8px] font-bold uppercase tracking-wider font-mono">Explode</span>
        </button>
        <button onClick={() => setWireframeMode(!wireframeMode)}
          className={`p-1.5 rounded-lg text-xs transition-all duration-200 flex items-center gap-1 cursor-pointer ${wireframeMode ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-white border border-transparent'}`}
          title="Toggle Wireframe X-Ray Mode">
          <Eye className="w-3.5 h-3.5" />
          <span className="text-[8px] font-bold uppercase tracking-wider font-mono">X-Ray</span>
        </button>
        <button onClick={() => {
            if (playbackIndex === null) {
              setPlaybackIndex(history.length - 2);
            } else {
              setPlaybackIndex(null);
            }
          }}
          className={`p-1.5 rounded-lg text-xs transition-all duration-200 flex items-center gap-1 cursor-pointer ${playbackIndex !== null ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-white border border-transparent'}`}
          title="Toggle Timeline Playback">
          <Clock className="w-3.5 h-3.5" />
          <span className="text-[8px] font-bold uppercase tracking-wider font-mono">Playback</span>
        </button>
      </div>

      {/* Sensor HUD Overlay (Bottom Left) */}
      {hudSensorData && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-80 bg-slate-950/95 border border-cyan-500/30 backdrop-blur-xl rounded-xl p-4 shadow-2xl z-20 animate-fade-in">
          <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-white/5">
            <div>
              <div className="text-[9px] text-slate-500 font-mono tracking-wider">SENSOR READOUT</div>
              <h4 className="text-xs font-black text-cyan-300 font-mono tracking-wide">{hudSensorData.name} ({hudSensorData.id})</h4>
            </div>
            <button onClick={() => setActiveHotspot(null)}
              className="text-slate-500 hover:text-white text-xs font-mono px-1.5 py-0.5 rounded hover:bg-white/5 cursor-pointer">×</button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2.5">
            <div className="bg-slate-900/60 p-2 rounded-lg border border-white/5">
              <span className="text-[9px] text-slate-500 block font-mono">LIVE VALUE</span>
              <span className="text-sm font-black text-white font-mono">{hudSensorData.value} {hudSensorData.unit}</span>
            </div>
            <div className="bg-slate-900/60 p-2 rounded-lg border border-white/5">
              <span className="text-[9px] text-slate-500 block font-mono">NODE HEALTH</span>
              <span className={`text-sm font-black font-mono ${hudSensorData.health >= 70 ? 'text-emerald-400' : hudSensorData.health >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {hudSensorData.health}%
              </span>
            </div>
          </div>
          <div className="space-y-1 text-[9px] font-mono text-slate-400">
            <div className="flex justify-between"><span>Calibration:</span><span className="text-slate-300">[{hudSensorData.range[0]} - {hudSensorData.range[1]}] {hudSensorData.unit}</span></div>
            <div className="flex justify-between"><span>Warning:</span><span className="text-amber-400">{hudSensorData.warning} {hudSensorData.unit}</span></div>
            <div className="flex justify-between"><span>Critical:</span><span className="text-red-400">{hudSensorData.critical} {hudSensorData.unit}</span></div>
          </div>
          {hudSensorData.health < 70 && (
            <div className="mt-2.5 bg-red-950/20 border border-red-500/20 rounded-lg p-2 flex items-center gap-2 text-[10px] text-red-300 font-semibold animate-pulse-live">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>Anomaly flagged by ONNX Isolation Forest.</span>
            </div>
          )}
        </div>
      )}

      {/* CAD Model Loaded Status Banner */}
      {cadModel && (
        <div className="absolute bottom-4 left-4 bg-slate-950/95 border border-cyan-500/30 backdrop-blur-xl rounded-xl p-2.5 shadow-2xl z-20 animate-fade-in flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] text-slate-500 font-mono">CAD INTERFACE ACTIVE</span>
            <span className="text-[10px] font-black text-cyan-400 font-mono">Custom CAD Model Loaded</span>
          </div>
          <button 
            onClick={() => setCadModel(null)}
            className="text-[9px] bg-red-950/40 hover:bg-red-500/20 border border-red-500/30 text-red-300 font-black px-2.5 py-1 rounded-md transition-all cursor-pointer font-mono"
          >
            RESET
          </button>
        </div>
      )}

      {/* Time-Travel incident playback scrubber bar */}
      {playbackIndex !== null && history && history.length > 1 && (
        <div className="absolute bottom-4 left-4 right-32 bg-slate-950/90 border border-cyan-500/20 backdrop-blur-xl rounded-xl p-3 z-10 shadow-2xl flex items-center gap-3">
          <button
            onClick={() => {
              if (playbackIndex === null) {
                setPlaybackIndex(history.length - 2); // Start at previous tick
              } else {
                setPlaybackIndex(null); // Return to live
              }
            }}
            className={`px-2.5 py-1 rounded-md text-[9px] font-black font-mono border transition-all cursor-pointer ${
              playbackIndex === null
                ? 'bg-red-950/40 text-red-400 border-red-500/30'
                : 'bg-cyan-950 text-cyan-400 border-cyan-500/40 animate-pulse-live'
            }`}
          >
            {playbackIndex === null ? '● LIVE' : '⏮ PLAYBACK'}
          </button>
          
          <input
            type="range"
            min={0}
            max={history.length - 1}
            value={playbackIndex !== null ? playbackIndex : history.length - 1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (val === history.length - 1) {
                setPlaybackIndex(null); // Snap back to live
              } else {
                setPlaybackIndex(val);
              }
            }}
            className="flex-1 accent-cyan-500 bg-slate-800 h-1 rounded-lg cursor-pointer range-sm"
          />

          <span className="text-[9px] text-slate-400 font-mono select-none">
            {playbackIndex !== null && history[playbackIndex]
              ? new Date(history[playbackIndex].timestamp).toLocaleTimeString()
              : 'Streaming Live'}
          </span>
        </div>
      )}

      {/* Instructions HUD (Bottom Right) */}
      <div className="absolute bottom-4 right-4 pointer-events-none select-none text-[8px] font-mono text-slate-500/70 bg-slate-950/50 border border-white/5 px-2.5 py-1.5 rounded-lg flex flex-col gap-0.5 items-end">
        <span>🖱️ Click & Drag to Orbit</span>
        <span>🔍 Scroll to Zoom</span>
        <span>🟢 Click Hotspot to Inspect</span>
      </div>
    </div>
  );
}
