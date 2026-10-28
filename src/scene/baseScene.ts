import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface MovementInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
}

const GRAVITY = 20;
const JUMP_SPEED = 7.2;

interface PointOfInterest {
  position: THREE.Vector3;
  radius: number;
  solved: boolean;
}

interface Barrier {
  z: number;
  opened: boolean;
}

export interface BaseSceneOptions {
  background: number;
  fogDensity: number;
  worldBounds: WorldBounds;
  spawn: THREE.Vector3;
  cameraOffset?: THREE.Vector3;
  moveSpeed?: number;
  onNearChange: (index: number | null) => void;
}

function accentColorFor(color: number): number {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + 0.5) % 1, Math.min(1, hsl.s + 0.1), Math.min(0.85, hsl.l + 0.2));
  return c.getHex();
}

function buildSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(220, 16, 10);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x1a2a6a) },
      bottomColor: { value: new THREE.Color(0x2a3d78) },
      offset: { value: 10 },
      exponent: { value: 0.65 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.renderOrder = -1;
  return sky;
}

/**
 * Shared exploration-scene plumbing (character, quarter-view camera follow,
 * movement/bounds, proximity-based interaction points, physical quiz-gated
 * barriers, resize/render/dispose) reused across the whole connected world.
 * Subclasses build their own environment meshes, call registerPOI() for each
 * interactive spot, and addBarrier() for each point progress must be earned
 * past.
 */
export abstract class BaseScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  protected character!: THREE.Group;
  protected bodyMesh!: THREE.Mesh;
  protected capeMesh!: THREE.Mesh;
  protected contactShadow!: THREE.Mesh;
  protected clock = new THREE.Clock();

  private limbs!: {
    leftArm: THREE.Group;
    rightArm: THREE.Group;
    leftLeg: THREE.Group;
    rightLeg: THREE.Group;
  };

  private characterVelocityY = 0;
  private walkTime = 0;
  protected jumpOffset = 0;
  protected jumpVelocity = 0;
  private jumpHeld = false;
  private worldBounds: WorldBounds;
  private cameraOffset: THREE.Vector3;
  private moveSpeed: number;
  private pois: PointOfInterest[] = [];
  private currentNear: number | null = null;
  private onNearChange: (index: number | null) => void;
  private barriers: Barrier[] = [];
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private skyMesh: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, avatarColor: number, options: BaseSceneOptions) {
    this.worldBounds = options.worldBounds;
    this.cameraOffset = options.cameraOffset ?? new THREE.Vector3(0, 10.5, 9.5);
    this.moveSpeed = options.moveSpeed ?? 8.5;
    this.onNearChange = options.onNearChange;

    this.scene.fog = new THREE.FogExp2(options.background, options.fogDensity);

    this.skyMesh = buildSkyDome();
    this.scene.add(this.skyMesh);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 260);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.55,
      0.45,
      0.32,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.buildCharacter(avatarColor, options.spawn);
    this.buildContactShadow();
  }

  /** Updates the sky dome's horizon/zenith colors — call from onFrame() to match the fog per zone. */
  protected setSkyColors(bottom: THREE.Color, top: THREE.Color): void {
    const uniforms = (this.skyMesh.material as THREE.ShaderMaterial).uniforms;
    uniforms.bottomColor.value.copy(bottom);
    uniforms.topColor.value.copy(top);
  }

  private buildCharacter(color: number, spawn: THREE.Vector3): void {
    const accent = accentColorFor(color);
    const group = new THREE.Group();

    const shirtMat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, metalness: 0.05 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accent,
      flatShading: true,
      roughness: 0.4,
      emissive: accent,
      emissiveIntensity: 0.3,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe0c2, flatShading: true, roughness: 0.6 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, roughness: 0.4 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2418, flatShading: true, roughness: 0.65 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x33415c, flatShading: true, roughness: 0.6 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x241a14, flatShading: true, roughness: 0.55 });

    // Torso ("shirt") with a collar accent
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.42, 4, 8), shirtMat);
    torso.position.y = 1.12;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 10), accentMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.38;

    // Shorts bridging torso and legs
    const shorts = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.14, 4, 8), pantsMat);
    shorts.position.y = 0.82;

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 6, 12), accentMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.92;

    // Head + face
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 10), skinMat);
    head.position.y = 1.72;

    const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.1, 1.74, 0.25);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.1;

    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.02), new THREE.MeshStandardMaterial({ color: 0xaa5a4a, roughness: 0.5 }));
    mouth.position.set(0, 1.6, 0.27);

    // Hair: a cap over the top/back of the head plus a short fringe
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
    hairCap.position.y = 1.74;
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), hairMat);
    fringe.position.set(0, 1.78, 0.03);
    fringe.rotation.x = -0.25;

    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.74, 1, 4), accentMat);
    cape.position.set(0, 1.02, -0.26);
    cape.rotation.x = 0.2;

    const armGeo = new THREE.CapsuleGeometry(0.09, 0.4, 4, 6);
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.4, 1.35, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
    leftArmMesh.position.y = -0.24;
    const leftCuff = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.025, 6, 8), accentMat);
    leftCuff.rotation.x = Math.PI / 2;
    leftCuff.position.y = -0.4;
    leftArm.add(leftArmMesh, leftCuff);

    const rightArm = new THREE.Group();
    rightArm.position.set(0.4, 1.35, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
    rightArmMesh.position.y = -0.24;
    const rightCuff = leftCuff.clone();
    rightArm.add(rightArmMesh, rightCuff);

    const legGeo = new THREE.CapsuleGeometry(0.11, 0.4, 4, 6);
    const shoeGeo = new THREE.BoxGeometry(0.16, 0.1, 0.22);
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.15, 0.76, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, pantsMat);
    leftLegMesh.position.y = -0.24;
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.46, 0.04);
    leftLeg.add(leftLegMesh, leftShoe);

    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.15, 0.76, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, pantsMat);
    rightLegMesh.position.y = -0.24;
    const rightShoe = leftShoe.clone();
    rightLeg.add(rightLegMesh, rightShoe);

    group.add(
      torso,
      collar,
      shorts,
      belt,
      head,
      eyeL,
      eyeR,
      mouth,
      hairCap,
      fringe,
      cape,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    );
    group.position.copy(spawn);

    this.bodyMesh = torso;
    this.capeMesh = cape;
    this.limbs = { leftArm, rightArm, leftLeg, rightLeg };
    this.character = group;
    this.scene.add(group);
  }

  private buildContactShadow(): void {
    const geometry = new THREE.CircleGeometry(0.6, 16);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    const shadow = new THREE.Mesh(geometry, material);
    shadow.position.y = 0.02;
    this.contactShadow = shadow;
    this.scene.add(shadow);
  }

  getCharacterPosition(): THREE.Vector3 {
    return this.character.position;
  }

  /** True while the character is airborne and descending — used to detect Mario-style stomps. */
  protected isFallingAirborne(): boolean {
    return this.jumpOffset > 0.12 && this.jumpVelocity < 0;
  }

  /** Gives the character a small upward bounce (e.g. after stomping an obstacle). */
  protected bounceCharacter(velocity: number): void {
    this.jumpVelocity = velocity;
    if (this.jumpOffset <= 0) this.jumpOffset = 0.01;
  }

  /** Nudges the character away from a hazard (e.g. after being hit by an obstacle). */
  protected knockbackCharacter(dirX: number, dirZ: number, distance: number): void {
    const len = Math.hypot(dirX, dirZ) || 1;
    this.character.position.x = THREE.MathUtils.clamp(
      this.character.position.x + (dirX / len) * distance,
      this.worldBounds.minX,
      this.worldBounds.maxX,
    );
    this.character.position.z += (dirZ / len) * distance;
  }

  teleportTo(z: number, x = 0): void {
    this.character.position.set(x, 0, z);
    this.updateCamera(true);
  }

  protected registerPOI(position: THREE.Vector3, radius: number): number {
    this.pois.push({ position, radius, solved: false });
    return this.pois.length - 1;
  }

  protected isPOISolved(index: number): boolean {
    return this.pois[index]?.solved ?? false;
  }

  markPOISolved(index: number): void {
    const poi = this.pois[index];
    if (poi) poi.solved = true;
  }

  /** Registers a point past which the character cannot walk until openBarrier() is called for it. */
  protected addBarrier(z: number): number {
    this.barriers.push({ z, opened: false });
    return this.barriers.length - 1;
  }

  openBarrier(index: number): void {
    const barrier = this.barriers[index];
    if (barrier) barrier.opened = true;
  }

  protected snapCamera(): void {
    this.updateCamera(true);
  }

  private updateCamera(snap: boolean): void {
    const targetPos = this.character.position.clone().add(this.cameraOffset);
    if (snap) {
      this.camera.position.copy(targetPos);
    } else {
      this.camera.position.lerp(targetPos, 0.08);
    }
    const lookTarget = this.character.position.clone().add(new THREE.Vector3(0, 1, 0));
    this.camera.lookAt(lookTarget);
    this.skyMesh.position.copy(this.camera.position);
  }

  /** Subclasses override to animate their own props (floating crystals, lanterns, particles, zone-blended fog). */
  protected onFrame(_delta: number, _elapsed: number): void {}

  update(delta: number, input: MovementInput): void {
    const moveVec = new THREE.Vector3(0, 0, 0);
    if (input.up) moveVec.z -= 1;
    if (input.down) moveVec.z += 1;
    if (input.left) moveVec.x -= 1;
    if (input.right) moveVec.x += 1;

    const isMoving = moveVec.lengthSq() > 0;
    if (isMoving) {
      moveVec.normalize().multiplyScalar(this.moveSpeed * delta);
      const currentZ = this.character.position.z;
      let newX = THREE.MathUtils.clamp(this.character.position.x + moveVec.x, this.worldBounds.minX, this.worldBounds.maxX);
      let newZ = THREE.MathUtils.clamp(currentZ + moveVec.z, this.worldBounds.minZ, this.worldBounds.maxZ);

      for (const barrier of this.barriers) {
        if (!barrier.opened && currentZ >= barrier.z && newZ < barrier.z) {
          newZ = barrier.z;
        }
      }

      this.character.position.x = newX;
      this.character.position.z = newZ;

      const targetAngle = Math.atan2(moveVec.x, moveVec.z);
      this.character.rotation.y = THREE.MathUtils.lerp(this.character.rotation.y, targetAngle, 0.25);

      this.walkTime += delta * 8;
      const swing = Math.sin(this.walkTime) * 0.6;
      this.limbs.leftArm.rotation.x = swing;
      this.limbs.rightArm.rotation.x = -swing;
      this.limbs.leftLeg.rotation.x = -swing;
      this.limbs.rightLeg.rotation.x = swing;
      this.characterVelocityY = Math.abs(Math.sin(this.walkTime)) * 0.07;
    } else {
      this.characterVelocityY = THREE.MathUtils.lerp(this.characterVelocityY, 0, 0.2);
      this.limbs.leftArm.rotation.x = THREE.MathUtils.lerp(this.limbs.leftArm.rotation.x, 0, 0.15);
      this.limbs.rightArm.rotation.x = THREE.MathUtils.lerp(this.limbs.rightArm.rotation.x, 0, 0.15);
      this.limbs.leftLeg.rotation.x = THREE.MathUtils.lerp(this.limbs.leftLeg.rotation.x, 0, 0.15);
      this.limbs.rightLeg.rotation.x = THREE.MathUtils.lerp(this.limbs.rightLeg.rotation.x, 0, 0.15);
    }
    const grounded = this.jumpOffset <= 0.001;
    if (input.jump && !this.jumpHeld && grounded) {
      this.jumpVelocity = JUMP_SPEED;
    }
    this.jumpHeld = input.jump;

    if (!grounded || this.jumpVelocity > 0) {
      this.jumpVelocity -= GRAVITY * delta;
      this.jumpOffset += this.jumpVelocity * delta;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVelocity = 0;
      }
    }

    this.character.position.y = this.characterVelocityY + this.jumpOffset;
    this.contactShadow.position.x = this.character.position.x;
    this.contactShadow.position.z = this.character.position.z;
    this.contactShadow.visible = this.jumpOffset < 0.05;

    const elapsed = this.clock.getElapsedTime();
    this.onFrame(delta, elapsed);

    this.updateNearestPOI();
    this.updateCamera(false);
  }

  private updateNearestPOI(): void {
    let nearest: number | null = null;
    let nearestDist = Infinity;
    this.pois.forEach((poi, index) => {
      if (poi.solved) return;
      const dist = poi.position.distanceTo(this.character.position);
      if (dist < poi.radius && dist < nearestDist) {
        nearest = index;
        nearestDist = dist;
      }
    });
    if (nearest !== this.currentNear) {
      this.currentNear = nearest;
      this.onNearChange(nearest);
    }
  }

  handleResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.setSize(window.innerWidth, window.innerHeight);
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry?.dispose();
        const material = obj.material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material?.dispose();
        }
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
