import * as THREE from "three";
import { BaseScene } from "./baseScene";
import { mulberry32, lowPolyMaterial } from "./sceneUtils";

export interface WorldSceneCallbacks {
  /** Fires with the index of the nearest unsolved point of interest (0..stationCount-1 = villains, stationCount = dragon), or null. */
  onNearChange: (index: number | null) => void;
  /** A spike-roller obstacle was jumped on and defeated — award bonus energy. */
  onObstacleStomped: (id: string) => void;
  /** The player walked into a spike-roller obstacle at ground level — lose a little energy. */
  onObstacleHit: () => void;
}

export interface DragonHp {
  hp: number;
  max: number;
}

// --- World layout: one continuous forest path, decreasing Z as the player advances ---
export const SPAWN_Z = 12;
const STATION_START_Z = -6;
const STATION_SPACING = -7.4;
const DRAGON_BARRIER_Z = -118;
const DRAGON_Z = -138;
export const WORLD_MIN_Z = -158;

const STATION_RADIUS = 3.2;
const DRAGON_RADIUS = 6.5;
const DRAGON_BASE_Y = 2.2;
const DRAGON_MAX_HP = 8;

const OBSTACLE_RADIUS = 0.95;
const OBSTACLE_HIT_COOLDOWN = 0.9;
const OBSTACLE_Z_LIST = [-11, -25, -40, -55, -70, -85, -100];

const WORLD_BOUNDS = { minX: -15, maxX: 15, minZ: WORLD_MIN_Z, maxZ: SPAWN_Z + 2 };

const FOREST_COLOR = new THREE.Color(0x253a52);
const LAIR_COLOR = new THREE.Color(0x3a1414);

interface VillainStation {
  group: THREE.Group;
  type: number;
  offset: number;
  defeated: boolean;
  vanishProgress: number;
}

interface GateVisual {
  barrier: THREE.Mesh;
  opened: boolean;
}

interface Obstacle {
  id: string;
  group: THREE.Group;
  baseX: number;
  z: number;
  phase: number;
  amplitude: number;
  speed: number;
  stomped: boolean;
  vanishProgress: number;
}

interface Projectile {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  duration: number;
}

export class WorldScene extends BaseScene {
  private stations: VillainStation[] = [];
  private stationCount: number;
  private dragonBarrierIdx!: number;
  private dragonGate!: GateVisual;

  private dragonGroup!: THREE.Group;
  private dragonParts!: {
    head: THREE.Group;
    leftWing: THREE.Group;
    rightWing: THREE.Group;
    tail: THREE.Group;
    throat: THREE.Mesh;
    eyeL: THREE.Mesh;
    eyeR: THREE.Mesh;
  };
  private dragonDefeated = false;
  private dragonVanishProgress = 0;
  private dragonAttackTimer = 0;
  private dragonAttackPhase = 0;
  private dragonHp = DRAGON_MAX_HP;
  private dragonHitFlash = 0;

  private obstacles: Obstacle[] = [];
  private obstacleHitCooldown = 0;
  private onObstacleStomped: (id: string) => void;
  private onObstacleHit: () => void;

  private projectiles: Projectile[] = [];

  private ambientParticles!: THREE.Points;
  private emberParticles!: THREE.Points;
  private particleBaseY!: Float32Array;
  private emberBaseY!: Float32Array;

  constructor(canvas: HTMLCanvasElement, avatarColor: number, stationCount: number, callbacks: WorldSceneCallbacks) {
    super(canvas, avatarColor, {
      background: FOREST_COLOR.getHex(),
      fogDensity: 0.022,
      worldBounds: WORLD_BOUNDS,
      spawn: new THREE.Vector3(0, 0, SPAWN_Z),
      cameraOffset: new THREE.Vector3(0, 10.5, 9.5),
      moveSpeed: 9,
      onNearChange: callbacks.onNearChange,
    });
    this.stationCount = stationCount;
    this.onObstacleStomped = callbacks.onObstacleStomped;
    this.onObstacleHit = callbacks.onObstacleHit;

    this.buildLights();
    this.buildGround();
    this.buildTrees();
    this.buildVillainStations();
    this.buildObstacles();
    this.buildDragonLairApproach();
    this.buildDragon();
    this.buildParticles();
    this.snapCamera();
  }

  // ---------------------------------------------------------------------
  private buildLights(): void {
    const ambient = new THREE.AmbientLight(0x9aa6e8, 0.65);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xf3ead0, 0.95);
    sun.position.set(-10, 22, 14);
    this.scene.add(sun);
    const hemi = new THREE.HemisphereLight(0xc3b8ff, 0x3a3060, 0.6);
    this.scene.add(hemi);

    const lairGlow = new THREE.PointLight(0xff6a3a, 1.6, 36);
    lairGlow.position.set(0, 6, DRAGON_Z + 6);
    this.scene.add(lairGlow);
  }

  private buildGround(): void {
    const totalSpan = SPAWN_Z - WORLD_MIN_Z + 20;
    const mid = (SPAWN_Z + WORLD_MIN_Z) / 2;
    const geometry = new THREE.PlaneGeometry(40, totalSpan, 20, 50);
    geometry.rotateX(-Math.PI / 2);
    const rand = mulberry32(42);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.18 + z * 0.12) * 0.35 + (rand() - 0.5) * 0.25);
    }
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, lowPolyMaterial(0x335a5c, { emissive: 0x0d1830, emissiveIntensity: 0.15 }));
    ground.position.set(0, -0.3, mid);
    this.scene.add(ground);

    const pathGeometry = new THREE.PlaneGeometry(5, totalSpan, 1, 26);
    pathGeometry.rotateX(-Math.PI / 2);
    const path = new THREE.Mesh(pathGeometry, lowPolyMaterial(0x5a8ac0, { roughness: 0.7, emissive: 0x16304a, emissiveIntensity: 0.22 }));
    path.position.set(0, -0.15, mid);
    this.scene.add(path);
  }

  private buildTrees(): void {
    const treeRand = mulberry32(7);
    const treeCount = 70;
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 6), lowPolyMaterial(0x5a4668), treeCount);
    const leafMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.1, 2.4, 7),
      lowPolyMaterial(0x3f8a6e, { emissive: 0x114a2c, emissiveIntensity: 0.3 }),
      treeCount,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const side = treeRand() < 0.5 ? -1 : 1;
      const x = side * (4.5 + treeRand() * 13);
      const z = SPAWN_Z - 5 - treeRand() * (SPAWN_Z - WORLD_MIN_Z - 10);
      const scale = 0.7 + treeRand() * 0.9;
      const rotY = treeRand() * Math.PI * 2;

      dummy.position.set(x, 1.1 * scale, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 2.9 * scale, z);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);
    }
    trunkMesh.instanceMatrix.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkMesh, leafMesh);
  }

  // ---------------------------------------------------------------------
  // Mario-style minor villains, one per quiz question
  // ---------------------------------------------------------------------
  private buildVillainStations(): void {
    const rand = mulberry32(17);
    for (let i = 0; i < this.stationCount; i++) {
      const type = i % 3;
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (2.6 + (i % 4) * 0.9 + rand() * 0.6);
      const z = STATION_START_Z + i * STATION_SPACING;

      const group = type === 0 ? this.buildSlime() : type === 1 ? this.buildGoblin() : this.buildBat();
      group.position.set(x, 0, z);
      this.scene.add(group);

      const poiHeight = type === 2 ? 1.8 : 0.6;
      this.registerPOI(new THREE.Vector3(x, poiHeight, z), STATION_RADIUS);
      this.stations.push({ group, type, offset: i * 1.1, defeated: false, vanishProgress: 0 });
    }
  }

  private buildSlime(): THREE.Group {
    const group = new THREE.Group();
    const color = 0x5fd97a;
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.35,
      transparent: true,
      opacity: 0.88,
      emissive: 0x1a5c2a,
      emissiveIntensity: 0.4,
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), bodyMat);
    body.scale.set(1, 0.7, 1);
    body.position.y = 0.36;

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x14241a });
    const eyeGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.15, 0.48, 0.38);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.15;

    group.add(body, eyeL, eyeR);
    return group;
  }

  private buildGoblin(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a6b3a, flatShading: true, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.4, 4, 6), bodyMat);
    body.position.y = 0.56;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), bodyMat);
    head.position.y = 1.0;

    const earGeo = new THREE.ConeGeometry(0.08, 0.3, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.position.set(-0.22, 1.1, 0);
    earL.rotation.z = 0.6;
    const earR = earL.clone();
    earR.position.x = 0.22;
    earR.rotation.z = -0.6;

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1.3 });
    const eyeGeo = new THREE.SphereGeometry(0.055, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 1.02, 0.21);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.1;

    group.add(body, head, earL, earR, eyeL, eyeR);
    return group;
  }

  private buildBat(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a2a5a, flatShading: true, roughness: 0.5, emissive: 0x2a1040, emissiveIntensity: 0.35 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), bodyMat);
    body.position.y = 1.8;

    const wingMat = new THREE.MeshStandardMaterial({ color: 0x381e48, flatShading: true, roughness: 0.6, side: THREE.DoubleSide });
    const wingGeo = new THREE.ConeGeometry(0.55, 0.9, 3);
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.rotation.set(0, 0, Math.PI / 2.2);
    leftWing.scale.set(1, 1, 0.1);
    leftWing.position.set(-0.45, 1.8, 0);
    const rightWing = leftWing.clone();
    rightWing.position.x = 0.45;
    rightWing.rotation.z = -Math.PI / 2.2;

    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2020, emissiveIntensity: 1.4 });
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08, 1.84, 0.24);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.08;

    group.add(body, leftWing, rightWing, eyeL, eyeR);
    return group;
  }

  // ---------------------------------------------------------------------
  // Mario-style "spike roller" obstacles — patrol across the path; must be
  // jumped over (or stomped from above) instead of answering a quiz.
  // ---------------------------------------------------------------------
  private buildObstacles(): void {
    const rand = mulberry32(203);
    OBSTACLE_Z_LIST.forEach((z, i) => {
      const group = this.buildSpikeRoller();
      const baseX = (i % 2 === 0 ? -1 : 1) * 0.6;
      group.position.set(baseX, 0.42, z);
      this.scene.add(group);
      this.obstacles.push({
        id: `spike-${i + 1}`,
        group,
        baseX,
        z,
        phase: rand() * Math.PI * 2,
        amplitude: 2.8 + rand() * 1.2,
        speed: 0.8 + rand() * 0.5,
        stomped: false,
        vanishProgress: 0,
      });
    });
  }

  private buildSpikeRoller(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, flatShading: true, roughness: 0.5, metalness: 0.3 });
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, flatShading: true, emissive: 0x4a0000, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), bodyMat);
    group.add(body);

    const spikeGeo = new THREE.ConeGeometry(0.12, 0.32, 4);
    const directions: [THREE.Vector3, [number, number, number]][] = [
      [new THREE.Vector3(0, 1, 0), [0, 0, 0]],
      [new THREE.Vector3(0, -1, 0), [Math.PI, 0, 0]],
      [new THREE.Vector3(1, 0, 0), [0, 0, -Math.PI / 2]],
      [new THREE.Vector3(-1, 0, 0), [0, 0, Math.PI / 2]],
      [new THREE.Vector3(0, 0, 1), [Math.PI / 2, 0, 0]],
      [new THREE.Vector3(0, 0, -1), [-Math.PI / 2, 0, 0]],
    ];
    for (const [dir, rot] of directions) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.copy(dir.clone().multiplyScalar(0.42));
      spike.rotation.set(rot[0], rot[1], rot[2]);
      group.add(spike);
    }
    return group;
  }

  // ---------------------------------------------------------------------
  // Scorched clearing approach + the dragon's lair barrier
  // ---------------------------------------------------------------------
  private buildDragonLairApproach(): void {
    const rand = mulberry32(61);
    const charredTrunkMat = lowPolyMaterial(0x1a1414);
    const charredLeafMat = lowPolyMaterial(0x4a2418, { emissive: 0x3a1208, emissiveIntensity: 0.35 });
    for (let i = 0; i < 14; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (5 + rand() * 9);
      const z = DRAGON_BARRIER_Z - 4 - rand() * 28;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 2.4, 5), charredTrunkMat);
      trunk.position.y = 1.2;
      trunk.rotation.z = (rand() - 0.5) * 0.3;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 6), charredLeafMat);
      leaves.position.y = 2.6;
      tree.add(trunk, leaves);
      tree.position.set(x, 0, z);
      this.scene.add(tree);
    }

    this.dragonBarrierIdx = this.addBarrier(DRAGON_BARRIER_Z + 2);
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0xff5a2a,
      emissive: 0xff5a2a,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.55,
    });
    const barrier = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.5), barrierMat);
    barrier.position.set(0, 3.2, DRAGON_BARRIER_Z + 0.1);
    this.scene.add(barrier);
    this.dragonGate = { barrier, opened: false };
  }

  private buildDragon(): void {
    const group = new THREE.Group();
    group.position.set(0, DRAGON_BASE_Y, DRAGON_Z);

    const scaleMat = new THREE.MeshStandardMaterial({ color: 0xb3341a, flatShading: true, roughness: 0.5, metalness: 0.1 });
    const bellyMat = new THREE.MeshStandardMaterial({ color: 0xe8b84a, flatShading: true, roughness: 0.45, emissive: 0x6a4a10, emissiveIntensity: 0.2 });
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xe8b84a, flatShading: true, roughness: 0.3, metalness: 0.3 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff8a00, emissiveIntensity: 1.8 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x7a1f0f, flatShading: true, roughness: 0.6, side: THREE.DoubleSide });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 2.4, 4, 8), scaleMat);
    body.rotation.z = Math.PI / 2;

    const belly = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.2, 4, 8), bellyMat);
    belly.rotation.z = Math.PI / 2;
    belly.position.y = -0.55;
    belly.scale.set(1, 0.7, 0.7);

    const headGroup = new THREE.Group();
    headGroup.position.set(2.2, 0.65, 0);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.72, 1.7, 6), scaleMat);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.4;
    const hornGeo = new THREE.ConeGeometry(0.13, 0.65, 4);
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(0.05, 0.48, 0.28);
    hornL.rotation.z = -0.5;
    const hornR = hornL.clone();
    hornR.position.z = -0.28;
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeMat);
    eyeL.position.set(0.72, 0.22, 0.3);
    const eyeR = eyeL.clone();
    eyeR.position.z = -0.3;
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff6a00, emissiveIntensity: 1.3 }));
    throat.position.set(0.95, -0.15, 0);
    headGroup.add(head, hornL, hornR, eyeL, eyeR, throat);

    const wingGeo = new THREE.ConeGeometry(2.6, 3.2, 3);
    const leftWing = new THREE.Group();
    leftWing.position.set(-0.1, 0.5, 0.6);
    const leftWingMesh = new THREE.Mesh(wingGeo, wingMat);
    leftWingMesh.rotation.set(0, 0, Math.PI / 2.1);
    leftWingMesh.scale.set(1, 1, 0.1);
    leftWingMesh.position.z = 1.7;
    leftWing.add(leftWingMesh);

    const rightWing = new THREE.Group();
    rightWing.position.set(-0.1, 0.5, -0.6);
    const rightWingMesh = leftWingMesh.clone();
    rightWingMesh.position.z = -1.7;
    rightWingMesh.rotation.z = -Math.PI / 2.1;
    rightWing.add(rightWingMesh);

    const tail = new THREE.Group();
    tail.position.set(-2.1, 0, 0);
    const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.4, 6), scaleMat);
    tailMesh.rotation.z = Math.PI / 2;
    tailMesh.position.x = -1.05;
    tail.add(tailMesh);

    const legGeo = new THREE.ConeGeometry(0.22, 1.1, 5);
    const legMat = scaleMat;
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(0.5, -1.1, 0.5);
    legL.rotation.x = 0.3;
    const legR = legL.clone();
    legR.position.z = -0.5;
    legR.rotation.x = -0.3;

    group.add(body, belly, headGroup, leftWing, rightWing, tail, legL, legR);
    this.dragonGroup = group;
    this.dragonParts = { head: headGroup, leftWing, rightWing, tail, throat, eyeL, eyeR };
    this.scene.add(group);

    this.registerPOI(new THREE.Vector3(0, 2, DRAGON_Z), DRAGON_RADIUS);
  }

  // ---------------------------------------------------------------------
  private buildParticles(): void {
    const count = 320;
    const positions = new Float32Array(count * 3);
    const baseY = new Float32Array(count);
    const rand = mulberry32(99);
    const spanZ = SPAWN_Z - WORLD_MIN_Z;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 30;
      const y = rand() * 7;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = SPAWN_Z - rand() * spanZ;
      baseY[i] = y;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffe9a8,
      size: 0.13,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ambientParticles = new THREE.Points(geometry, material);
    this.particleBaseY = baseY;
    this.scene.add(this.ambientParticles);

    const emberCount = 100;
    const emberPos = new Float32Array(emberCount * 3);
    const emberBase = new Float32Array(emberCount);
    const emberRand = mulberry32(201);
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3] = (emberRand() - 0.5) * 20;
      const y = emberRand() * 6;
      emberPos[i * 3 + 1] = y;
      emberPos[i * 3 + 2] = DRAGON_Z + (emberRand() - 0.5) * 36;
      emberBase[i] = y;
    }
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
    const emberMat = new THREE.PointsMaterial({
      color: 0xff7a3a,
      size: 0.16,
      transparent: true,
      opacity: 0.85,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.emberParticles = new THREE.Points(emberGeo, emberMat);
    this.emberBaseY = emberBase;
    this.scene.add(this.emberParticles);
  }

  // ---------------------------------------------------------------------
  protected onFrame(delta: number, elapsed: number): void {
    this.updateObstacles(delta, elapsed);
    this.updateProjectiles(delta);

    for (const station of this.stations) {
      if (station.defeated) {
        station.vanishProgress = Math.min(1, station.vanishProgress + delta * 2.2);
        const s = 1 - station.vanishProgress;
        station.group.scale.setScalar(Math.max(s, 0.001));
        station.group.visible = station.vanishProgress < 1;
        continue;
      }
      const bob = Math.sin(elapsed * 2 + station.offset) * (station.type === 2 ? 0.18 : 0.07);
      station.group.position.y = bob < 0 && station.type !== 2 ? 0 : bob;
      station.group.rotation.y = Math.sin(elapsed * 0.8 + station.offset) * 0.4;
      if (station.type === 0) {
        const squish = 1 + Math.sin(elapsed * 3 + station.offset) * 0.08;
        station.group.scale.set(1 / squish, squish, 1 / squish);
      }
    }

    this.updateDragon(delta, elapsed);

    const posAttr = this.ambientParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.particleBaseY.length; i++) {
      posAttr.setY(i, (this.particleBaseY[i] + elapsed * 0.4) % 7);
    }
    posAttr.needsUpdate = true;

    const emberAttr = this.emberParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.emberBaseY.length; i++) {
      emberAttr.setY(i, (this.emberBaseY[i] + elapsed * 0.9) % 6);
    }
    emberAttr.needsUpdate = true;

    this.updateAtmosphere();
  }

  private updateDragon(delta: number, elapsed: number): void {
    const g = this.dragonGroup;
    const p = this.dragonParts;

    if (this.dragonDefeated) {
      this.dragonVanishProgress = Math.min(1, this.dragonVanishProgress + delta * 0.6);
      g.position.y = DRAGON_BASE_Y - this.dragonVanishProgress * 3.5;
      g.scale.setScalar(Math.max(1 - this.dragonVanishProgress, 0.001));
      g.rotation.z = this.dragonVanishProgress * 0.6;
      return;
    }

    const hover = Math.sin(elapsed * 0.8) * 0.3;
    g.position.y = DRAGON_BASE_Y + hover;
    g.rotation.y = Math.sin(elapsed * 0.3) * 0.15;

    if (this.dragonHitFlash > 0) {
      this.dragonHitFlash = Math.max(0, this.dragonHitFlash - delta * 4);
      g.scale.setScalar(1 + this.dragonHitFlash * 0.18);
    } else {
      g.scale.setScalar(1);
    }

    p.leftWing.rotation.z = Math.sin(elapsed * 2.2) * 0.35;
    p.rightWing.rotation.z = -Math.sin(elapsed * 2.2) * 0.35;
    p.tail.rotation.y = Math.sin(elapsed * 1.1) * 0.3;
    p.head.rotation.z = Math.sin(elapsed * 1.6) * 0.06;

    const eyeMat = p.eyeL.material as THREE.MeshStandardMaterial;
    const throatMat = p.throat.material as THREE.MeshStandardMaterial;

    this.dragonAttackTimer += delta;
    if (this.dragonAttackTimer > 4.5) {
      this.dragonAttackPhase = 1;
      this.dragonAttackTimer = 0;
    }
    if (this.dragonAttackPhase > 0) {
      this.dragonAttackPhase += delta * 1.5;
      const pulse = Math.sin(this.dragonAttackPhase * Math.PI);
      throatMat.emissiveIntensity = 1.3 + Math.max(0, pulse) * 2.5;
      eyeMat.emissiveIntensity = 1.8 + Math.max(0, pulse) * 1.5;
      (p.eyeR.material as THREE.MeshStandardMaterial).emissiveIntensity = eyeMat.emissiveIntensity;
      g.position.z = DRAGON_Z + Math.max(0, pulse) * 0.6;
      if (this.dragonAttackPhase > 1) this.dragonAttackPhase = 0;
    } else {
      throatMat.emissiveIntensity = 1.3 + Math.sin(elapsed * 2) * 0.2;
      eyeMat.emissiveIntensity = 1.8;
      (p.eyeR.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.8;
      g.position.z = DRAGON_Z;
    }
  }

  private updateObstacles(delta: number, elapsed: number): void {
    if (this.obstacleHitCooldown > 0) this.obstacleHitCooldown -= delta;
    const charPos = this.getCharacterPosition();

    for (const obstacle of this.obstacles) {
      if (obstacle.stomped) {
        obstacle.vanishProgress = Math.min(1, obstacle.vanishProgress + delta * 3);
        obstacle.group.scale.set(1 + obstacle.vanishProgress * 0.4, Math.max(1 - obstacle.vanishProgress, 0.001), 1 + obstacle.vanishProgress * 0.4);
        obstacle.group.visible = obstacle.vanishProgress < 1;
        continue;
      }

      const x = obstacle.baseX + Math.sin(elapsed * obstacle.speed + obstacle.phase) * obstacle.amplitude;
      obstacle.group.position.x = x;
      obstacle.group.rotation.x += delta * 3.2;
      obstacle.group.rotation.z += delta * 0.6;

      const dx = charPos.x - x;
      const dz = charPos.z - obstacle.z;
      const distXZ = Math.hypot(dx, dz);
      if (distXZ > OBSTACLE_RADIUS) continue;

      const charHeight = charPos.y;
      if (charHeight >= 0.9) continue; // cleanly jumped over

      if (charHeight >= 0.3 && this.isFallingAirborne()) {
        obstacle.stomped = true;
        this.bounceCharacter(4.2);
        this.onObstacleStomped(obstacle.id);
      } else if (this.obstacleHitCooldown <= 0) {
        this.obstacleHitCooldown = OBSTACLE_HIT_COOLDOWN;
        this.knockbackCharacter(dx, dz, 1.6);
        this.onObstacleHit();
      }
    }
  }

  private updateProjectiles(delta: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += delta / p.duration;
      if (p.t >= 1) {
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      p.mesh.position.lerpVectors(p.from, p.to, p.t);
      p.mesh.position.y += Math.sin(p.t * Math.PI) * 0.8;
    }
  }

  private updateAtmosphere(): void {
    const z = this.getCharacterPosition().z;
    const t = THREE.MathUtils.clamp((SPAWN_Z - z) / (SPAWN_Z - DRAGON_BARRIER_Z), 0, 1);
    const color = FOREST_COLOR.clone().lerp(LAIR_COLOR, t);
    (this.scene.fog as THREE.FogExp2).color.copy(color);

    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    const zenith = new THREE.Color().setHSL(hsl.h, Math.max(0, hsl.s - 0.1), Math.min(0.9, hsl.l + 0.35));
    this.setSkyColors(color, zenith);
  }

  // ---------------------------------------------------------------------
  // Public mutators used by main.ts after each quiz is answered correctly
  // ---------------------------------------------------------------------
  markStationSolved(index: number): void {
    const station = this.stations[index];
    if (!station || station.defeated) return;
    station.defeated = true;
    this.markPOISolved(index);

    if (this.stations.every((s) => s.defeated)) {
      this.openDragonBarrier();
    }
  }

  private openDragonBarrier(): void {
    if (this.dragonGate.opened) return;
    this.dragonGate.opened = true;
    const start = performance.now();
    const duration = 1200;
    const barrierIdx = this.dragonBarrierIdx;
    const gate = this.dragonGate;
    const animateOpen = () => {
      const t = Math.min((performance.now() - start) / duration, 1);
      gate.barrier.scale.y = 1 - t;
      (gate.barrier.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - t);
      if (t < 1) {
        requestAnimationFrame(animateOpen);
      } else {
        this.openBarrier(barrierIdx);
      }
    };
    requestAnimationFrame(animateOpen);
  }

  /** Fires one energy blast at the dragon, consuming one point of the player's energy. Returns the fight state. */
  attackDragon(): DragonHp & { justDefeated: boolean } {
    if (this.dragonDefeated) return { hp: 0, max: DRAGON_MAX_HP, justDefeated: false };

    this.spawnProjectile();
    this.dragonHitFlash = 1;
    this.dragonHp = Math.max(0, this.dragonHp - 1);

    const justDefeated = this.dragonHp <= 0;
    if (justDefeated) {
      this.dragonDefeated = true;
      this.markPOISolved(this.stationCount);
    }
    return { hp: this.dragonHp, max: DRAGON_MAX_HP, justDefeated };
  }

  getDragonHp(): DragonHp {
    return { hp: this.dragonHp, max: DRAGON_MAX_HP };
  }

  private spawnProjectile(): void {
    const from = this.getCharacterPosition().clone().add(new THREE.Vector3(0, 1.3, 0));
    const to = this.dragonGroup.position.clone();
    const geometry = new THREE.SphereGeometry(0.14, 8, 8);
    const material = new THREE.MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x3fc8ff, emissiveIntensity: 2.2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, from, to, t: 0, duration: 0.32 });
  }

  /** Replays an already-defeated dragon state on load, instantly (no animation). */
  instantlyDefeatDragon(): void {
    this.dragonDefeated = true;
    this.dragonVanishProgress = 1;
    this.dragonHp = 0;
    this.markPOISolved(this.stationCount);
  }

  /** Replays an already-stomped obstacle state on load, instantly (no animation). */
  markObstacleStomped(id: string): void {
    const obstacle = this.obstacles.find((o) => o.id === id);
    if (!obstacle || obstacle.stomped) return;
    obstacle.stomped = true;
    obstacle.vanishProgress = 1;
    obstacle.group.visible = false;
  }
}
