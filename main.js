// main.js - Underwater Boids Battle Simulation with fixed issues

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.157.0/examples/jsm/postprocessing/ShaderPass.js';

// Constants
const WORLD_SIZE = 800;
const TEAMS = {
    RED: 'red',
    BLUE: 'blue'
};
const TEAM_SIZES = 50;
const BATTLE_DURATION = 90; // seconds
const MUTATION_RATE = 0.15;
const MUTATION_AMOUNT = 0.25;
const BOID_SIZE = 8; // Larger spheres
const COLLISION_DISTANCE = BOID_SIZE * 2.2;
const SPEED_MULTIPLIER = 10; // Warriors are 10x faster
const FLOOR_Y_POSITION = -WORLD_SIZE/2 + 5; // Fixed floor position

// Global variables
let scene, camera, renderer, composer;
let playerControls;
let worldBounds = [];
let boundaryWalls = [];
let boids = [];
let playerBoid;
let isPlayerInvisible = false;
let clock = new THREE.Clock();
let battleTimer = 0;
let generation = 1;
let battleActive = true;
let selectedBoid = null;
let boidInfoPanel;
let geneVisualizationPanel;
let raycaster;
let mousePosition = new THREE.Vector2();
let floorMesh; // Reference to the floor mesh

let debug = {
    showBoidInfo: false,
    showHitboxes: false,
    speedMultiplier: 1.0,
    paused: false,
    showGeneHeatmaps: false,
    showFloor: true // New debug option for floor visibility
};

// Battle history
let battleHistory = {
    generations: [],
    redWins: 0,
    blueWins: 0,
    draws: 0
};

// Movement controls
const keys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false
};

// Gene constraints - higher values for aggression and larger detection radius AND MUCH FASTER
const geneConstraints = {
    separation: { weight: { min: 0.5, max: 8 }, radius: { min: 10, max: 60 } },
    alignment: { weight: { min: 0.5, max: 8 }, radius: { min: 20, max: 120 } },
    cohesion: { weight: { min: 0.5, max: 8 }, radius: { min: 20, max: 120 } },
    charge: { weight: { min: 3.0, max: 20 }, radius: { min: 100, max: 500 } }, // Much larger radius to seek enemies
    flee: { weight: { min: 1.0, max: 15 }, radius: { min: 20, max: 150 } },
    maxSpeed: { min: 20.0, max: 100.0 }, // 10x faster
    maxForce: { min: 0.5, max: 5.0 }, // 10x more force
    health: { min: 50, max: 200 },
    damage: { min: 10, max: 35 }, // Increased damage
    attackCooldown: { min: 0.05, max: 0.4 }, // Faster attacks to match speed
    aggressiveness: { min: 0.6, max: 1.0 }, // More aggressive
    defensiveness: { min: 0.1, max: 0.5 },
    sightRange: { min: 100, max: 400 } // Increased sight range
};

// Simplified underwater shaders
const underwaterUniforms = {
    time: { value: 0 },
    turbidity: { value: 0.2 }, // Reduced
    blueShift: { value: 0.2 }, // Reduced
    resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
};

// Particle systems
let particleSystem = {
    bubbles: null,
    attackParticles: null,
    deathParticles: null,
    dustParticles: null
};

// Sound
let audioListener;
let sounds = {
    ambient: null,
    attack: null,
    death: null
};

// Initialize the application
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a4a6b, 0.001); // Lighter fog
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.set(0, 0, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0a4a6b);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    
    // Setup simplified post-processing
    setupPostProcessing();
    
    // Setup audio
    setupAudio();
    
    // Create skybox
    createSkybox();
    
    // Setup controls after a user interaction
    setupInitialControls();
    
    // Add underwater lighting
    setupLighting();
    
    // Create floor (always visible now)
    createFloor();
    
    // Create world boundaries
    createWorldBoundaries();
    
    // Create particle systems
    setupParticleSystems();
    
    // Set up boid info display
    setupBoidInfoPanel();
    
    // Set up gene visualization panel
    setupGeneVisualizationPanel();
    
    // Setup raycaster for boid selection
    raycaster = new THREE.Raycaster();
    
    // Initialize boids
    initializeBoids();
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onMouseClick);
    document.addEventListener('mousemove', onMouseMove);
    
    // Add debug controls
    setupDebugControls();
    
    // Start animation loop
    animate();
}

function setupInitialControls() {
    const startButton = document.createElement('button');
    startButton.textContent = 'Click to Start';
    startButton.style.position = 'absolute';
    startButton.style.top = '50%';
    startButton.style.left = '50%';
    startButton.style.transform = 'translate(-50%, -50%)';
    startButton.style.padding = '20px 40px';
    startButton.style.fontSize = '24px';
    startButton.style.backgroundColor = '#2196F3';
    startButton.style.color = 'white';
    startButton.style.border = 'none';
    startButton.style.borderRadius = '5px';
    startButton.style.cursor = 'pointer';
    startButton.style.zIndex = '1000';
    startButton.id = 'start-button';
    
    document.body.appendChild(startButton);
    
    startButton.addEventListener('click', function() {
        // Remove the button
        document.body.removeChild(startButton);
        
        // Setup controls after user interaction
        setupPlayerControls();
        
        // Add keyboard controls
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);
        
        // Update controls display
        updateControlsDisplay();
    });
}

function setupPlayerControls() {
    try {
        playerControls = new PointerLockControls(camera, document.body);
        
        // Add safe error handling for pointer lock
        playerControls.addEventListener('lock', function() {
            document.querySelector('.controls-info').style.display = 'none';
        });
        
        playerControls.addEventListener('unlock', function() {
            document.querySelector('.controls-info').style.display = 'block';
        });
        
        // Create controls info display
        const controlsInfo = document.createElement('div');
        controlsInfo.className = 'controls-info';
        controlsInfo.style.position = 'absolute';
        controlsInfo.style.bottom = '10px';
        controlsInfo.style.left = '10px';
        controlsInfo.style.color = 'white';
        controlsInfo.style.background = 'rgba(0,0,0,0.5)';
        controlsInfo.style.padding = '10px';
        controlsInfo.style.borderRadius = '5px';
        controlsInfo.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(controlsInfo);
        
        // Add click handler for the document to lock controls
        document.addEventListener('click', function(event) {
            // Don't try to lock if clicking on UI elements
            if (event.target.closest('#debug-panel') || 
                event.target.closest('#boid-info-panel') || 
                event.target.closest('#gene-visualization-panel')) {
                return;
            }
            
            if (!playerControls.isLocked && !document.getElementById('start-button')) {
                try {
                    playerControls.lock();
                } catch (error) {
                    console.warn("Could not lock pointer: ", error);
                }
            }
        });
        
        scene.add(playerControls.getObject());
    } catch (error) {
        console.error("Error setting up player controls: ", error);
    }
}

function updateControlsDisplay() {
    const controlsInfo = document.querySelector('.controls-info');
    if (!controlsInfo) return;
    
    controlsInfo.innerHTML = `
        <div>WASD - Move</div>
        <div>Mouse - Look</div>
        <div>Space/Q - Rise</div>
        <div>E - Descend</div>
        <div>Shift - Boost Speed</div>
        <div>H - Toggle Invisibility</div>
        <div>R - Reset Position</div>
        <div>M - Toggle Music</div>
        <div>\` - Debug Menu</div>
        <div>Click on Boid - Show Info (when enabled)</div>
    `;
}

function createSkybox() {
    // Load skybox textures
    const loader = new THREE.CubeTextureLoader();
    
    // Use a try-catch to handle missing textures
    try {
        const skyboxTextures = loader.load([
            './assets/px.png',
            './assets/nx.png',
            './assets/py.png',
            './assets/ny.png',
            './assets/pz.png',
            './assets/nz.png'
        ]);
        
        // Set skybox as scene background
        scene.background = skyboxTextures;
    } catch (error) {
        console.error("Error loading skybox textures: ", error);
        
        // Fallback to a color if textures fail to load
        scene.background = new THREE.Color(0x0a4a6b);
    }
}

function setupPostProcessing() {
    // Create a render pass
    const renderPass = new RenderPass(scene, camera);
    
    // Create a bloom pass for underwater glow (reduced intensity)
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.5,  // reduced strength
        0.4,  // reduced radius
        0.4   // reduced threshold
    );
    
    // Simplified underwater shader
    const underwaterShader = {
        uniforms: {
            tDiffuse: { value: null },
            time: underwaterUniforms.time,
            turbidity: underwaterUniforms.turbidity,
            blueShift: underwaterUniforms.blueShift,
            resolution: underwaterUniforms.resolution
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float time;
            uniform float turbidity;
            uniform float blueShift;
            uniform vec2 resolution;
            varying vec2 vUv;
            
            void main() {
                // Simplified water distortion
                vec2 uv = vUv;
                float timeScale = time * 0.1;
                
                // Very subtle distortion
                float distortX = sin(uv.y * 10.0 + timeScale) * 0.0005;
                float distortY = sin(uv.x * 10.0 - timeScale) * 0.0005;
                
                uv.x += distortX * turbidity;
                uv.y += distortY * turbidity;
                
                // Sample the scene with minimal distortion
                vec4 color = texture2D(tDiffuse, uv);
                
                // Apply subtle blue tint
                color.r *= (1.0 - blueShift * 0.5);
                color.g *= (1.0 - blueShift * 0.3);
                color.b = mix(color.b, 1.0, blueShift * 0.2);
                
                gl_FragColor = color;
            }
        `
    };
    
    const underwaterPass = new ShaderPass(underwaterShader);
    
    // Create composer
    composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(underwaterPass);
}

function setupAudio() {
    // Create audio listener
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Create ambient underwater sound
    sounds.ambient = new THREE.Audio(audioListener);
    
    // Create audio loader
    const audioLoader = new THREE.AudioLoader();
    
    // Load underwater ambient sound from local path
    try {
        audioLoader.load(
            './assets/underwater_ambient.mp3',
            (buffer) => {
                sounds.ambient.setBuffer(buffer);
                sounds.ambient.setLoop(true);
                sounds.ambient.setVolume(0.4);
                sounds.ambient.play();
                console.log('Underwater ambient sound loaded and playing');
            },
            (xhr) => {
                console.log(`Sound loading: ${(xhr.loaded / xhr.total * 100)}% loaded`);
            },
            (error) => {
                console.error('Error loading sound file:', error);
            }
        );
    } catch (error) {
        console.error("Error setting up audio: ", error);
    }
}

function setupLighting() {
    // Ambient light (brighter)
    const ambientLight = new THREE.AmbientLight(0x0a4a6b, 0.8);
    scene.add(ambientLight);
    
    // Directional light (sun filtered through water)
    const sunLight = new THREE.DirectionalLight(0x88ccff, 1.0);
    sunLight.position.set(WORLD_SIZE/2, WORLD_SIZE, WORLD_SIZE/3);
    sunLight.castShadow = true;
    
    // Optimize shadow settings
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 100;
    sunLight.shadow.camera.far = 3000;
    sunLight.shadow.camera.left = -WORLD_SIZE;
    sunLight.shadow.camera.right = WORLD_SIZE;
    sunLight.shadow.camera.top = WORLD_SIZE;
    sunLight.shadow.camera.bottom = -WORLD_SIZE;
    
    scene.add(sunLight);
    
    // Add point lights for better illumination
    const blueLight = new THREE.PointLight(0x0077ff, 1, WORLD_SIZE);
    blueLight.position.set(WORLD_SIZE/2, 0, -WORLD_SIZE/2);
    scene.add(blueLight);
    
    const redLight = new THREE.PointLight(0xff7700, 1, WORLD_SIZE);
    redLight.position.set(-WORLD_SIZE/2, 0, WORLD_SIZE/2);
    scene.add(redLight);
}

function createFloor() {
    // Create a simpler, always-visible floor
    const floorGeometry = new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4, 64, 64);
    
    // Create a standard material that's always visible
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x0066aa,
        metalness: 0.3,
        roughness: 0.7,
        side: THREE.DoubleSide
    });
    
    floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = FLOOR_Y_POSITION;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    
    // Add an additional wireframe outline to make the floor more visible
    const wireGeometry = new THREE.PlaneGeometry(WORLD_SIZE * 4, WORLD_SIZE * 4, 64, 64);
    const wireMaterial = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    
    const wireframe = new THREE.Mesh(wireGeometry, wireMaterial);
    wireframe.rotation.x = -Math.PI / 2;
    wireframe.position.y = FLOOR_Y_POSITION + 0.5; // Slightly above the floor
    scene.add(wireframe);
    
    // Store wireframe as part of the floor for visibility toggling
    floorMesh.userData.wireframe = wireframe;
    
    // Add bubbles and particles for atmosphere
    addUnderwaterParticles();
}

function updateFloorVisibility() {
    if (floorMesh) {
        floorMesh.visible = debug.showFloor;
        if (floorMesh.userData.wireframe) {
            floorMesh.userData.wireframe.visible = debug.showFloor;
        }
    }
}

function addUnderwaterParticles() {
    // Create bubble particles
    const bubbleCount = 300;
    const bubblePositions = new Float32Array(bubbleCount * 3);
    const bubbleSizes = new Float32Array(bubbleCount);
    const bubbleSpeeds = new Float32Array(bubbleCount);
    
    for (let i = 0; i < bubbleCount; i++) {
        const i3 = i * 3;
        bubblePositions[i3] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
        bubblePositions[i3 + 1] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
        bubblePositions[i3 + 2] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
        
        bubbleSizes[i] = Math.random() * 3 + 1;
        bubbleSpeeds[i] = Math.random() * 10 + 5;
    }
    
    const bubbleGeometry = new THREE.BufferGeometry();
    bubbleGeometry.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
    bubbleGeometry.setAttribute('size', new THREE.BufferAttribute(bubbleSizes, 1));
    bubbleGeometry.setAttribute('speed', new THREE.BufferAttribute(bubbleSpeeds, 1));
    
    // Load the bubble texture
    const textureLoader = new THREE.TextureLoader();
    let bubbleTexture;
    
    try {
        bubbleTexture = textureLoader.load('./assets/Bubble.png');
    } catch (error) {
        console.error('Error loading bubble texture:', error);
        // Fallback to generated texture
        bubbleTexture = createBubbleTexture();
    }
    
    const bubbleMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 3.0,
        transparent: true,
        opacity: 0.7,
        map: bubbleTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    particleSystem.bubbles = new THREE.Points(bubbleGeometry, bubbleMaterial);
    scene.add(particleSystem.bubbles);
    
    // Create dust particles
    const dustCount = 1000;
    const dustPositions = new Float32Array(dustCount * 3);
    
    for (let i = 0; i < dustCount * 3; i += 3) {
        dustPositions[i] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
        dustPositions[i + 1] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
        dustPositions[i + 2] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
    }
    
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    
    const dustMaterial = new THREE.PointsMaterial({
        color: 0xaaaacc,
        size: 1.0,
        transparent: true,
        opacity: 0.3,
        sizeAttenuation: true
    });
    
    particleSystem.dustParticles = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(particleSystem.dustParticles);
    
    // Animate bubbles
    function animateBubbles() {
        if (!particleSystem.bubbles) return;
        
        const time = clock.getElapsedTime();
        
        const positions = particleSystem.bubbles.geometry.attributes.position.array;
        const speeds = particleSystem.bubbles.geometry.attributes.speed.array;
        
        for (let i = 0; i < bubbleCount; i++) {
            const i3 = i * 3;
            
            // Move bubbles upward
            positions[i3 + 1] += speeds[i] * 0.02;
            
            // Add slight horizontal drift
            positions[i3] += Math.sin(time * 0.1 + i) * 0.1;
            positions[i3 + 2] += Math.cos(time * 0.1 + i) * 0.1;
            
            // Reset if out of bounds
            if (positions[i3 + 1] > WORLD_SIZE) {
                positions[i3 + 1] = -WORLD_SIZE;
                positions[i3] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
                positions[i3 + 2] = THREE.MathUtils.randFloatSpread(WORLD_SIZE * 2);
            }
        }
        
        particleSystem.bubbles.geometry.attributes.position.needsUpdate = true;
    }
    
    // Add to animation loop
    scene.userData.animateBubbles = animateBubbles;
}

function createBubbleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    // Create gradient
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, 'rgba(200, 220, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(200, 220, 255, 0)');
    
    // Draw circle
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(32, 32, 32, 0, Math.PI * 2);
    context.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function createWorldBoundaries() {
    // Create collision boundaries
    const wallThickness = 10;
    const wallMaterial = new THREE.MeshBasicMaterial({
        transparent: true, 
        opacity: 0.0,
        side: THREE.DoubleSide,
        wireframe: false
    });
    
    // Create walls array for collision
    worldBounds = [];
    boundaryWalls = [];
    
    // Create all 6 walls (front, back, left, right, top, bottom)
    const walls = [
        { position: [0, 0, -WORLD_SIZE + wallThickness/2], rotation: [0, 0, 0], normal: [0, 0, 1] },   // Front
        { position: [0, 0, WORLD_SIZE - wallThickness/2], rotation: [0, 0, 0], normal: [0, 0, -1] },  // Back
        { position: [-WORLD_SIZE + wallThickness/2, 0, 0], rotation: [0, Math.PI/2, 0], normal: [1, 0, 0] },  // Left
        { position: [WORLD_SIZE - wallThickness/2, 0, 0], rotation: [0, Math.PI/2, 0], normal: [-1, 0, 0] },  // Right
        { position: [0, WORLD_SIZE - wallThickness/2, 0], rotation: [Math.PI/2, 0, 0], normal: [0, -1, 0] },  // Top
        { position: [0, FLOOR_Y_POSITION, 0], rotation: [Math.PI/2, 0, 0], normal: [0, 1, 0] }   // Bottom (at floor level)
    ];
    
    walls.forEach((wallData, index) => {
        // Collision wall
        const collisionGeometry = new THREE.BoxGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2, wallThickness);
        const collisionWall = new THREE.Mesh(collisionGeometry, wallMaterial.clone());
        collisionWall.position.set(...wallData.position);
        collisionWall.rotation.set(...wallData.rotation);
        collisionWall.userData.isWorldBoundary = true;
        collisionWall.userData.wallIndex = index;
        collisionWall.userData.normal = new THREE.Vector3(...wallData.normal);
        scene.add(collisionWall);
        worldBounds.push(collisionWall);
        
        // Visual wall (becomes visible when approaching) - except for the floor
        if (index !== 5) { // Skip floor - we have a separate mesh for it
            const visualMaterial = new THREE.MeshBasicMaterial({
                color: 0x88ccff,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide
            });
            
            const visualGeometry = new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2);
            const visualWall = new THREE.Mesh(visualGeometry, visualMaterial);
            visualWall.position.copy(collisionWall.position);
            visualWall.rotation.copy(collisionWall.rotation);
            
            // Offset slightly to avoid z-fighting
            const offset = 1;
            const offsetVector = new THREE.Vector3(...wallData.normal).multiplyScalar(-offset);
            visualWall.position.add(offsetVector);
            
            scene.add(visualWall);
            boundaryWalls.push(visualWall);
        } else {
            // Push null for floor index to maintain array correspondence
            boundaryWalls.push(null);
        }
    });
}

function updateBoundaryWallVisibility() {
    if (!camera) return;
    
    const playerPos = camera.position.clone();
    
    boundaryWalls.forEach((wall, index) => {
        if (!wall || !worldBounds[index]) return;
        
        const wallNormal = worldBounds[index].userData.normal;
        const wallPos = worldBounds[index].position.clone();
        
        // Calculate distance from player to wall plane (using dot product with normal)
        const distanceVector = new THREE.Vector3().subVectors(playerPos, wallPos);
        const distance = Math.abs(distanceVector.dot(wallNormal));
        
        // Make walls visible as player approaches
        let opacity = 0;
        if (distance < 100) {
            // Fade in boundary as we get closer
            opacity = 1.0 - (distance / 100);
            opacity = Math.pow(opacity, 2) * 0.3; // Reduce maximum opacity to 30%
        }
        
        wall.material.opacity = opacity;
    });
}

function setupParticleSystems() {
    // Attack particles
    const attackParticleGeometry = new THREE.BufferGeometry();
    const attackParticleCount = 50;
    const attackParticlePositions = new Float32Array(attackParticleCount * 3);
    
    for (let i = 0; i < attackParticleCount * 3; i += 3) {
        attackParticlePositions[i] = 0;
        attackParticlePositions[i + 1] = 0;
        attackParticlePositions[i + 2] = 0;
    }
    
    attackParticleGeometry.setAttribute('position', new THREE.BufferAttribute(attackParticlePositions, 3));
    
    const attackParticleMaterial = new THREE.PointsMaterial({
        color: 0xffffaa,
        size: 3,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    particleSystem.attackParticles = new THREE.Points(attackParticleGeometry, attackParticleMaterial);
    particleSystem.attackParticles.visible = false;
    scene.add(particleSystem.attackParticles);
    
    // Death particles 
    const deathParticleGeometry = new THREE.BufferGeometry();
    const deathParticleCount = 200; // More particles for better effect
    const deathParticlePositions = new Float32Array(deathParticleCount * 3);
    
    for (let i = 0; i < deathParticleCount * 3; i += 3) {
        deathParticlePositions[i] = 0;
        deathParticlePositions[i + 1] = 0;
        deathParticlePositions[i + 2] = 0;
    }
    
    deathParticleGeometry.setAttribute('position', new THREE.BufferAttribute(deathParticlePositions, 3));
    
    const deathParticleMaterial = new THREE.PointsMaterial({
        color: 0xff5555,
        size: 4,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });
    
    particleSystem.deathParticles = new THREE.Points(deathParticleGeometry, deathParticleMaterial);
    particleSystem.deathParticles.visible = false;
    scene.add(particleSystem.deathParticles);
}

function setupBoidInfoPanel() {
    boidInfoPanel = document.createElement('div');
    boidInfoPanel.style.position = 'absolute';
    boidInfoPanel.style.top = '50%';
    boidInfoPanel.style.left = '20px';
    boidInfoPanel.style.transform = 'translateY(-50%)';
    boidInfoPanel.style.padding = '10px';
    boidInfoPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    boidInfoPanel.style.color = 'white';
    boidInfoPanel.style.fontFamily = 'monospace';
    boidInfoPanel.style.fontSize = '12px';
    boidInfoPanel.style.borderRadius = '5px';
    boidInfoPanel.style.display = 'none';
    boidInfoPanel.style.maxHeight = '80vh';
    boidInfoPanel.style.overflowY = 'auto';
    boidInfoPanel.style.zIndex = '1000';
    boidInfoPanel.style.pointerEvents = 'auto';
    boidInfoPanel.id = 'boid-info-panel';
    document.body.appendChild(boidInfoPanel);
}

function updateBoidInfoPanel() {
    if (!selectedBoid || !debug.showBoidInfo) {
        boidInfoPanel.style.display = 'none';
        return;
    }
    
    // Make the panel visible
    boidInfoPanel.style.display = 'block';
    
    // Update content
    const boid = selectedBoid;
    const genes = boid.genes;
    const teamColor = boid.team === TEAMS.RED ? '#ff3333' : '#3333ff';
    
    let html = `
        <h2 style="color: ${teamColor};">Boid Info ${boid.isPlayer ? '(Player)' : ''}</h2>
        <div>Team: <span style="color: ${teamColor};">${boid.team.toUpperCase()}</span></div>
        <div>Health: ${Math.floor(boid.health)}/${Math.floor(boid.maxHealth)}</div>
        <div>Damage: ${Math.floor(boid.damage)}</div>
        <div>Kills: ${boid.kills}</div>
        <div>Attack Cooldown: ${boid.attackCooldown.toFixed(2)}s</div>
        <div>Damage Dealt: ${Math.floor(boid.damageDealt)}</div>
        <div>Damage Taken: ${Math.floor(boid.damageTaken)}</div>
        <h3>Genes</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
            <div>Max Speed:</div><div>${genes.maxSpeed.toFixed(1)}</div>
            <div>Max Force:</div><div>${genes.maxForce.toFixed(2)}</div>
            <div>Aggressiveness:</div><div>${genes.aggressiveness.toFixed(2)}</div>
            <div>Defensiveness:</div><div>${genes.defensiveness.toFixed(2)}</div>
            <div>Sight Range:</div><div>${Math.floor(genes.sightRange)}</div>
            
            <div>Separation Weight:</div><div>${genes.separation.weight.toFixed(2)}</div>
            <div>Separation Radius:</div><div>${Math.floor(genes.separation.radius)}</div>
            
            <div>Alignment Weight:</div><div>${genes.alignment.weight.toFixed(2)}</div>
            <div>Alignment Radius:</div><div>${Math.floor(genes.alignment.radius)}</div>
            
            <div>Cohesion Weight:</div><div>${genes.cohesion.weight.toFixed(2)}</div>
            <div>Cohesion Radius:</div><div>${Math.floor(genes.cohesion.radius)}</div>
            
            <div>Charge Weight:</div><div>${genes.charge.weight.toFixed(2)}</div>
            <div>Charge Radius:</div><div>${Math.floor(genes.charge.radius)}</div>
            
            <div>Flee Weight:</div><div>${genes.flee.weight.toFixed(2)}</div>
            <div>Flee Radius:</div><div>${Math.floor(genes.flee.radius)}</div>
        </div>
        <div style="margin-top: 10px;">
            <button id="show-gene-visualization">Show Gene Heatmaps</button>
        </div>
    `;
    
    boidInfoPanel.innerHTML = html;
    
    // Add event listener for the gene visualization button
    document.getElementById('show-gene-visualization').addEventListener('click', () => {
        debug.showGeneHeatmaps = true;
        updateGeneVisualizationPanel();
    });
}

function setupGeneVisualizationPanel() {
    geneVisualizationPanel = document.createElement('div');
    geneVisualizationPanel.style.position = 'absolute';
    geneVisualizationPanel.style.top = '50%';
    geneVisualizationPanel.style.right = '20px';
    geneVisualizationPanel.style.transform = 'translateY(-50%)';
    geneVisualizationPanel.style.padding = '10px';
    geneVisualizationPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    geneVisualizationPanel.style.color = 'white';
    geneVisualizationPanel.style.fontFamily = 'monospace';
    geneVisualizationPanel.style.fontSize = '12px';
    geneVisualizationPanel.style.borderRadius = '5px';
    geneVisualizationPanel.style.display = 'none';
    geneVisualizationPanel.style.maxHeight = '90vh';
    geneVisualizationPanel.style.maxWidth = '600px';
    geneVisualizationPanel.style.overflowY = 'auto';
    geneVisualizationPanel.style.zIndex = '1000';
    geneVisualizationPanel.style.pointerEvents = 'auto';
    geneVisualizationPanel.id = 'gene-visualization-panel';
    document.body.appendChild(geneVisualizationPanel);
}

function updateGeneVisualizationPanel() {
    if (!debug.showGeneHeatmaps || !selectedBoid) {
        geneVisualizationPanel.style.display = 'none';
        return;
    }
    
    // Make the panel visible
    geneVisualizationPanel.style.display = 'block';
    
    // Create gene heatmaps
    const boid = selectedBoid;
    const team = boid.team;
    const teamBoids = boids.filter(b => b.team === team && !b.isDead && !b.isPlayer);
    
    let html = `
        <h2>Gene Distribution Heatmaps</h2>
        <div>${team.toUpperCase()} Team - ${teamBoids.length} Boids</div>
        <div>Selected Boid's value shown in green</div>
        <button id="close-gene-heatmaps" style="margin-top: 10px;">Close Heatmaps</button>
        <div style="margin-top: 10px;">
    `;
    
    // Gene keys to display
    const geneKeys = [
        { name: 'Max Speed', path: 'maxSpeed' },
        { name: 'Max Force', path: 'maxForce' },
        { name: 'Health', path: 'health' },
        { name: 'Damage', path: 'damage' },
        { name: 'Aggressiveness', path: 'aggressiveness' },
        { name: 'Defensiveness', path: 'defensiveness' },
        { name: 'Separation Weight', path: 'separation.weight' },
        { name: 'Alignment Weight', path: 'alignment.weight' },
        { name: 'Cohesion Weight', path: 'cohesion.weight' },
        { name: 'Charge Weight', path: 'charge.weight' },
        { name: 'Charge Radius', path: 'charge.radius' }
    ];
    
    // Generate heatmaps for each gene
    for (const gene of geneKeys) {
        // Get gene values from all team boids
        const values = teamBoids.map(b => getNestedProperty(b.genes, gene.path));
        const selectedValue = getNestedProperty(boid.genes, gene.path);
        
        // Get min/max constraints for this gene
        const constraints = getGeneConstraints(gene.path);
        
        // Create heatmap
        html += createGeneHeatmap(gene.name, values, selectedValue, constraints, team);
    }
    
    html += `</div>`;
    geneVisualizationPanel.innerHTML = html;
    
    // Add event listener for close button
    document.getElementById('close-gene-heatmaps').addEventListener('click', () => {
        debug.showGeneHeatmaps = false;
        geneVisualizationPanel.style.display = 'none';
    });
}

function getNestedProperty(obj, path) {
    return path.split('.').reduce((curr, key) => curr[key], obj);
}

function getGeneConstraints(path) {
    if (path.includes('.')) {
        const [parent, child] = path.split('.');
        return geneConstraints[parent][child];
    } else {
        return geneConstraints[path];
    }
}

function createGeneHeatmap(name, values, selectedValue, constraints, team) {
    const min = constraints.min;
    const max = constraints.max;
    const bins = 20; // Number of bins in the histogram
    const binSize = (max - min) / bins;
    
    // Count values in each bin
    const histogram = new Array(bins).fill(0);
    values.forEach(value => {
        const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
        histogram[binIndex]++;
    });
    
    // Find the bin where the selected value falls
    const selectedBin = Math.min(Math.floor((selectedValue - min) / binSize), bins - 1);
    
    // Find the max count for scaling
    const maxCount = Math.max(...histogram);
    
    // Normalize for display (max height 100px)
    const normalizedHistogram = histogram.map(count => (count / maxCount) * 100);
    
    // Generate the heatmap HTML
    let html = `
        <div style="margin-bottom: 15px;">
            <div style="margin-bottom: 5px; font-weight: bold;">${name}</div>
            <div style="display: flex; height: 100px; align-items: flex-end; margin-bottom: 5px; border-left: 1px solid #666; border-bottom: 1px solid #666;">
    `;
    
    // Create the bars
    for (let i = 0; i < bins; i++) {
        const height = normalizedHistogram[i];
        const color = i === selectedBin ? '#00ff00' : team === TEAMS.RED ? '#ff6666' : '#6666ff';
        
        html += `<div style="width: ${100/bins}%; height: ${height}%; background-color: ${color}; margin-right: 1px;"></div>`;
    }
    
    html += `</div>`;
    
    // Add scale labels
    html += `
            <div style="display: flex; justify-content: space-between; font-size: 10px;">
                <span>${min.toFixed(1)}</span>
                <span>${((min + max) / 2).toFixed(1)}</span>
                <span>${max.toFixed(1)}</span>
            </div>
            <div style="font-size: 10px; text-align: center;">Current: ${selectedValue.toFixed(2)}</div>
        </div>
    `;
    
    return html;
}

function setupDebugControls() {
    // Create a simple debug panel
    const debugPanel = document.createElement('div');
    debugPanel.style.position = 'absolute';
    debugPanel.style.top = '10px';
    debugPanel.style.right = '10px';
    debugPanel.style.padding = '10px';
    debugPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    debugPanel.style.color = 'white';
    debugPanel.style.fontFamily = 'monospace';
    debugPanel.style.fontSize = '12px';
    debugPanel.style.borderRadius = '5px';
    debugPanel.style.display = 'none'; // Hidden by default
    debugPanel.style.zIndex = '1000';
    debugPanel.style.pointerEvents = 'auto';
    debugPanel.id = 'debug-panel';
    
    debugPanel.innerHTML = `
        <h3>Debug Controls</h3>
        <div>
            <label>
                <input type="checkbox" id="debug-boid-info"> Show Boid Info (click boids)
            </label>
        </div>
        <div>
            <label>
                <input type="checkbox" id="debug-gene-heatmaps"> Show Gene Heatmaps
            </label>
        </div>
        <div>
            <label>
                <input type="checkbox" id="debug-hitboxes"> Show Hitboxes
            </label>
        </div>
        <div>
            <label>
                <input type="checkbox" id="debug-show-floor" checked> Show Floor
            </label>
        </div>
        <div>
            <label>
                Speed: <input type="range" id="debug-speed" min="0.1" max="5" step="0.1" value="1">
                <span id="debug-speed-value">1.0</span>x
            </label>
        </div>
        <div>
            <label>
                <input type="checkbox" id="debug-pause"> Pause Simulation
            </label>
        </div>
        <div>
            <button id="debug-new-generation">New Generation</button>
        </div>
        <div>
            <button id="debug-reset">Reset Simulation</button>
        </div>
    `;
    
    document.body.appendChild(debugPanel);
    
    // Debug toggle
    document.addEventListener('keydown', function(e) {
        if (e.key === '`') { // Backtick key
            debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
        }
    });
    
    // Setup debug panel event handlers after it's added to DOM
    setTimeout(() => {
        // Debug controls event listeners
        document.getElementById('debug-boid-info').addEventListener('change', function(e) {
            debug.showBoidInfo = e.target.checked;
            if (!debug.showBoidInfo) {
                boidInfoPanel.style.display = 'none';
                geneVisualizationPanel.style.display = 'none';
                debug.showGeneHeatmaps = false;
                document.getElementById('debug-gene-heatmaps').checked = false;
            }
        });
        
        document.getElementById('debug-gene-heatmaps').addEventListener('change', function(e) {
            debug.showGeneHeatmaps = e.target.checked;
            if (debug.showGeneHeatmaps) {
                if (!debug.showBoidInfo) {
                    debug.showBoidInfo = true;
                    document.getElementById('debug-boid-info').checked = true;
                }
                if (selectedBoid) {
                    updateGeneVisualizationPanel();
                }
            } else {
                geneVisualizationPanel.style.display = 'none';
            }
        });
        
        document.getElementById('debug-hitboxes').addEventListener('change', function(e) {
            debug.showHitboxes = e.target.checked;
            updateHitboxVisibility();
        });
        
        document.getElementById('debug-show-floor').addEventListener('change', function(e) {
            debug.showFloor = e.target.checked;
            updateFloorVisibility();
        });
        
        document.getElementById('debug-speed').addEventListener('input', function(e) {
            debug.speedMultiplier = parseFloat(e.target.value);
            document.getElementById('debug-speed-value').textContent = debug.speedMultiplier.toFixed(1);
        });
        
        document.getElementById('debug-pause').addEventListener('change', function(e) {
            debug.paused = e.target.checked;
        });
        
        document.getElementById('debug-new-generation').addEventListener('click', function() {
            endBattle();
        });
        
        document.getElementById('debug-reset').addEventListener('click', function() {
            resetSimulation();
        });
    }, 100);
}

function updateHitboxVisibility() {
    for (const boid of boids) {
        if (boid.hitbox) {
            boid.hitbox.visible = debug.showHitboxes && !(boid.isPlayer && isPlayerInvisible);
        }
    }
    
    for (const wall of worldBounds) {
        wall.material.wireframe = debug.showHitboxes;
        wall.material.opacity = debug.showHitboxes ? 0.3 : 0;
    }
}

function onMouseMove(event) {
    // Update normalized mouse coordinates
    mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
    mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function onMouseClick(event) {
    // Don't process clicks on UI elements
    if (event.target.closest('#debug-panel') || 
        event.target.closest('#boid-info-panel') || 
        event.target.closest('#gene-visualization-panel') ||
        event.target.closest('#start-button')) {
        return;
    }
    
    // Process boid selection only if show boid info is enabled
    if (debug.showBoidInfo && playerControls && playerControls.isLocked) {
        // Create raycaster from camera pointing forward
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        
        // Get all meshes from non-dead boids
        const boidMeshes = boids.filter(b => !b.isDead).map(b => b.mesh);
        
        // Check for intersections
        const intersects = raycaster.intersectObjects(boidMeshes);
        
        if (intersects.length > 0) {
            // Find the boid corresponding to the clicked mesh
            const clickedBoid = boids.find(b => b.mesh === intersects[0].object);
            if (clickedBoid) {
                selectedBoid = clickedBoid;
                updateBoidInfoPanel();
                if (debug.showGeneHeatmaps) {
                    updateGeneVisualizationPanel();
                }
            }
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    
    // Update resolution uniform for underwater shader
    underwaterUniforms.resolution.value.set(window.innerWidth, window.innerHeight);
}

class Boid {
    constructor(team, genes, isPlayer = false) {
        this.team = team;
        this.genes = genes || createRandomGenes();
        this.isPlayer = isPlayer;
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.acceleration = new THREE.Vector3();
        this.health = this.genes.health;
        this.maxHealth = this.genes.health;
        this.damage = this.genes.damage;
        this.isDead = false;
        this.lastAttackTime = 0;
        this.attackCooldown = this.genes.attackCooldown;
        this.kills = 0;
        this.damageTaken = 0;
        this.damageDealt = 0;
        this.fitnessScore = 0;
        
        // Create mesh as a sphere
        this.createBoidMesh();
        
        // Add hitbox
        const hitboxGeometry = new THREE.SphereGeometry(COLLISION_DISTANCE/2, 16, 16);
        const hitboxMaterial = new THREE.MeshBasicMaterial({
            color: this.team === TEAMS.RED ? 0xff0000 : 0x0000ff,
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });
        
        this.hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
        this.hitbox.visible = debug.showHitboxes;
        scene.add(this.hitbox);
        
        // Add health bar
        this.createHealthBar();
        
        // Initialize starting position
        this.initializePosition();
    }

    createBoidMesh() {
        // Create a sphere for the boid
        const sphereGeometry = new THREE.SphereGeometry(BOID_SIZE, 24, 24);
        
        // Set material based on team
        const sphereMaterial = new THREE.MeshStandardMaterial({
            color: this.team === TEAMS.RED ? 0xff3333 : 0x3333ff,
            metalness: 0.7,
            roughness: 0.2,
            emissive: this.team === TEAMS.RED ? 0x330000 : 0x000033,
            emissiveIntensity: 0.5
        });
        
        this.mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        
        // Make player boid distinct
        if (this.isPlayer) {
            sphereMaterial.emissiveIntensity = 0.8;
            this.mesh.scale.set(1.5, 1.5, 1.5);
        }
        
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.boid = this;
        scene.add(this.mesh);
    }
    
    createHealthBar() {
        // Health bar container
        const healthBarWidth = 12;
        const healthBarHeight = 1.5;
        
        const healthBarGeometry = new THREE.PlaneGeometry(healthBarWidth, healthBarHeight);
        const healthBarMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide
        });
        
        this.healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        this.healthBar.position.y = BOID_SIZE * 2;
        scene.add(this.healthBar);
        
        // Health bar background
        const healthBarBgGeometry = new THREE.PlaneGeometry(healthBarWidth, healthBarHeight);
        const healthBarBgMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide
        });
        
        this.healthBarBg = new THREE.Mesh(healthBarBgGeometry, healthBarBgMaterial);
        this.healthBarBg.position.y = BOID_SIZE * 2;
        scene.add(this.healthBarBg);
    }
    
    updateHealthBar() {
        if (this.isDead) {
            this.healthBar.visible = false;
            this.healthBarBg.visible = false;
            return;
        }
        
        // Position above boid
        this.healthBarBg.position.copy(this.position);
        this.healthBarBg.position.y += BOID_SIZE * 2;
        this.healthBarBg.lookAt(camera.position);
        
        this.healthBar.position.copy(this.position);
        this.healthBar.position.y += BOID_SIZE * 2;
        this.healthBar.lookAt(camera.position);
        
        // Scale health bar based on current health
        const healthPercent = this.health / this.maxHealth;
        this.healthBar.scale.x = healthPercent;
        
        // Position health bar to align left
        const offset = (1 - healthPercent) * 6;
        this.healthBar.position.x = this.healthBarBg.position.x - offset;
        
        // Update color based on health
        if (healthPercent > 0.6) {
            this.healthBar.material.color.set(0x00ff00);
        } else if (healthPercent > 0.3) {
            this.healthBar.material.color.set(0xffff00);
        } else {
            this.healthBar.material.color.set(0xff0000);
        }
    }
    
    initializePosition() {
        const offset = WORLD_SIZE * 0.4;
        
        if (this.team === TEAMS.RED) {
            this.position.set(
                THREE.MathUtils.randFloat(-offset, offset),
                THREE.MathUtils.randFloat(-offset/2, offset/2),
                -WORLD_SIZE * 0.6
            );
        } else {
            this.position.set(
                THREE.MathUtils.randFloat(-offset, offset),
                THREE.MathUtils.randFloat(-offset/2, offset/2),
                WORLD_SIZE * 0.6
            );
        }
        
        // Ensure boid starts above the floor
        if (this.position.y < FLOOR_Y_POSITION + BOID_SIZE) {
            this.position.y = FLOOR_Y_POSITION + BOID_SIZE + 10; // Add some extra margin
        }
        
        // Random initial velocity towards the center
        this.velocity.set(
            THREE.MathUtils.randFloat(-1, 1),
            THREE.MathUtils.randFloat(-1, 1),
            this.team === TEAMS.RED ? THREE.MathUtils.randFloat(0, 1) : THREE.MathUtils.randFloat(-1, 0)
        );
        this.velocity.normalize().multiplyScalar(this.genes.maxSpeed * 0.5);
        
        // Update mesh position
        this.updateMesh();
    }
    
    applyForce(force) {
        this.acceleration.add(force);
    }
    
    seek(target) {
        const desired = new THREE.Vector3().subVectors(target, this.position);
        desired.normalize();
        desired.multiplyScalar(this.genes.maxSpeed);
        
        const steer = new THREE.Vector3().subVectors(desired, this.velocity);
        steer.clampLength(0, this.genes.maxForce);
        
        return steer;
    }
    
    separate(boids) {
        const desiredSeparation = this.genes.separation.radius;
        const steer = new THREE.Vector3();
        let count = 0;
        
        for (const other of boids) {
            if (other === this || other.isDead) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist > 0 && dist < desiredSeparation) {
                const diff = new THREE.Vector3().subVectors(this.position, other.position);
                diff.normalize();
                diff.divideScalar(dist); // Weight by distance
                steer.add(diff);
                count++;
            }
        }
        
        if (count > 0) {
            steer.divideScalar(count);
            
            if (steer.length() > 0) {
                steer.normalize();
                steer.multiplyScalar(this.genes.maxSpeed);
                steer.sub(this.velocity);
                steer.clampLength(0, this.genes.maxForce);
            }
        }
        
        return steer.multiplyScalar(this.genes.separation.weight);
    }
    
    align(boids) {
        const neighborDist = this.genes.alignment.radius;
        const sum = new THREE.Vector3();
        let count = 0;
        
        for (const other of boids) {
            if (other === this || other.isDead || other.team !== this.team) continue;
            if (isPlayerInvisible && other.isPlayer) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist > 0 && dist < neighborDist) {
                sum.add(other.velocity);
                count++;
            }
        }
        
        if (count > 0) {
            sum.divideScalar(count);
            sum.normalize();
            sum.multiplyScalar(this.genes.maxSpeed);
            
            const steer = new THREE.Vector3().subVectors(sum, this.velocity);
            steer.clampLength(0, this.genes.maxForce);
            return steer.multiplyScalar(this.genes.alignment.weight);
        }
        
        return new THREE.Vector3();
    }
    
    cohesion(boids) {
        const neighborDist = this.genes.cohesion.radius;
        const sum = new THREE.Vector3();
        let count = 0;
        
        for (const other of boids) {
            if (other === this || other.isDead || other.team !== this.team) continue;
            if (isPlayerInvisible && other.isPlayer) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist > 0 && dist < neighborDist) {
                sum.add(other.position);
                count++;
            }
        }
        
        if (count > 0) {
            sum.divideScalar(count);
            return this.seek(sum).multiplyScalar(this.genes.cohesion.weight);
        }
        
        return new THREE.Vector3();
    }
    
    charge(boids) {
        const chargeDist = this.genes.charge.radius;
        const enemies = [];
        
        // Only charge if health is above threshold for aggression
        if (this.health < this.maxHealth * this.genes.defensiveness) {
            return new THREE.Vector3();
        }
        
        for (const other of boids) {
            if (other === this || other.isDead || other.team === this.team) continue;
            if (isPlayerInvisible && (other.isPlayer || this.isPlayer)) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist < chargeDist) {
                enemies.push({boid: other, distance: dist});
            }
        }
        
        if (enemies.length > 0) {
            // Sort by distance, closest first
            enemies.sort((a, b) => a.distance - b.distance);
            
            // Charge towards the closest enemy
            const target = enemies[0].boid.position;
            const chargeForce = this.seek(target);
            
            // Apply aggressiveness as a multiplier
            return chargeForce.multiplyScalar(this.genes.charge.weight * this.genes.aggressiveness);
        }
        
        return new THREE.Vector3();
    }
    
    flee(boids) {
        const fleeDist = this.genes.flee.radius;
        const fleeThreshold = this.maxHealth * this.genes.defensiveness;
        
        if (this.health > fleeThreshold) {
            return new THREE.Vector3();
        }
        
        const steer = new THREE.Vector3();
        let count = 0;
        
        for (const other of boids) {
            if (other === this || other.isDead || other.team === this.team) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist < fleeDist) {
                const diff = new THREE.Vector3().subVectors(this.position, other.position);
                diff.normalize();
                diff.divideScalar(dist); // Weight by distance
                steer.add(diff);
                count++;
            }
        }
        
        if (count > 0) {
            steer.divideScalar(count);
            
            if (steer.length() > 0) {
                steer.normalize();
                steer.multiplyScalar(this.genes.maxSpeed);
                steer.sub(this.velocity);
                steer.clampLength(0, this.genes.maxForce);
            }
            
            return steer.multiplyScalar(this.genes.flee.weight);
        }
        
        return new THREE.Vector3();
    }
    
    avoidBoundaries() {
        const margin = 50;
        const force = new THREE.Vector3();
        const boundary = WORLD_SIZE - margin;
        
        // X boundaries
        if (this.position.x < -boundary) {
            force.x = this.genes.maxForce * 2 * (1 + Math.abs(this.position.x + boundary) / margin);
        } else if (this.position.x > boundary) {
            force.x = -this.genes.maxForce * 2 * (1 + Math.abs(this.position.x - boundary) / margin);
        }
        
        // Y boundaries - strengthen floor avoidance
        if (this.position.y < FLOOR_Y_POSITION + BOID_SIZE + margin) {
            // Stronger upward force when close to floor
            const floorDistance = this.position.y - (FLOOR_Y_POSITION + BOID_SIZE);
            force.y = this.genes.maxForce * 3 * (1 + Math.abs(floorDistance) / margin);
        } else if (this.position.y > boundary) {
            force.y = -this.genes.maxForce * 2 * (1 + Math.abs(this.position.y - boundary) / margin);
        }
        
        // Z boundaries
        if (this.position.z < -boundary) {
            force.z = this.genes.maxForce * 2 * (1 + Math.abs(this.position.z + boundary) / margin);
        } else if (this.position.z > boundary) {
            force.z = -this.genes.maxForce * 2 * (1 + Math.abs(this.position.z - boundary) / margin);
        }
        
        return force;
    }
    
    handleCollisions(boids) {
        // Collision response with other boids and damage handling
        for (const other of boids) {
            if (other === this || other.isDead) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist < COLLISION_DISTANCE) {
                // Apply collision force
                const collisionForce = new THREE.Vector3()
                    .subVectors(this.position, other.position)
                    .normalize()
                    .multiplyScalar(this.genes.maxForce * 5);
                
                this.applyForce(collisionForce);
                
                // Deal damage if it's an enemy
                if (other.team !== this.team) {
                    // Apply damage on collision
                    const now = clock.getElapsedTime();
                    
                    // Only deal damage if not on cooldown
                    if (now - this.lastAttackTime >= this.attackCooldown) {
                        const collisionDamage = this.damage * 0.5; // Reduced collision damage
                        const damageDealt = other.takeDamage(collisionDamage, this);
                        this.damageDealt += damageDealt;
                        this.lastAttackTime = now;
                    }
                }
            }
        }
    }
    
    attack(boids) {
        const attackRange = BOID_SIZE * 3;
        const now = clock.getElapsedTime();
        
        // Check if attack is on cooldown
        if (now - this.lastAttackTime < this.attackCooldown) {
            return;
        }
        
        for (const other of boids) {
            if (other === this || other.isDead || other.team === this.team) continue;
            if (isPlayerInvisible && (other.isPlayer || this.isPlayer)) continue;
            
            const dist = this.position.distanceTo(other.position);
            
            if (dist < attackRange) {
                // Attack the enemy
                const damageDealt = other.takeDamage(this.damage, this);
                this.damageDealt += damageDealt;
                this.lastAttackTime = now;
                
                // Create a visual effect for the attack
                this.createAttackEffect(other.position);
                
                break; // Only attack one enemy at a time
            }
        }
    }
    
    createAttackEffect(targetPos) {
        // Create impact particles
        const particleCount = 20;
        const positions = particleSystem.attackParticles.geometry.attributes.position.array;
        
        particleSystem.attackParticles.material.color.set(
            this.team === TEAMS.RED ? 0xff5500 : 0x00aaff
        );
        
        particleSystem.attackParticles.visible = true;
        particleSystem.attackParticles.position.copy(targetPos);
        
        for (let i = 0; i < particleCount * 3; i += 3) {
            // Random position within sphere
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = Math.random() * 5;
            
            positions[i] = Math.sin(phi) * Math.cos(theta) * r;
            positions[i + 1] = Math.sin(phi) * Math.sin(theta) * r;
            positions[i + 2] = Math.cos(phi) * r;
        }
        
        particleSystem.attackParticles.geometry.attributes.position.needsUpdate = true;
        
        // Add line between attacker and target
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            this.position,
            targetPos
        ]);
        
        const lineMaterial = new THREE.LineBasicMaterial({
            color: this.team === TEAMS.RED ? 0xff5500 : 0x00aaff,
            linewidth: 2,
            transparent: true,
            opacity: 0.8
        });
        
        const line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(line);
        
        // Fade out effect
        const startTime = clock.getElapsedTime();
        const duration = 0.5;
        
        function animateAttackEffect() {
            const elapsed = clock.getElapsedTime() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1) {
                scene.remove(line);
                particleSystem.attackParticles.visible = false;
                return;
            }
            
            line.material.opacity = 0.8 * (1 - progress);
            
            requestAnimationFrame(animateAttackEffect);
        }
        
        animateAttackEffect();
    }
    
    takeDamage(amount, attacker = null) {
        const actualDamage = Math.min(this.health, amount);
        this.health -= actualDamage;
        this.damageTaken += actualDamage;
        
        // Update mesh color based on health
        const healthPercent = this.health / this.maxHealth;
        const baseColor = this.team === TEAMS.RED ? new THREE.Color(1, 0, 0) : new THREE.Color(0, 0, 1);
        const damageColor = new THREE.Color(1, 1, 1);
        
        this.mesh.material.color.copy(baseColor).lerp(damageColor, 1 - healthPercent);
        
        // Animation on hit - quick flash
        this.mesh.material.emissiveIntensity = 0.8;
        setTimeout(() => {
            if (!this.isDead) {
                this.mesh.material.emissiveIntensity = this.isPlayer ? 0.8 : 0.5;
            }
        }, 100);
        
        // Check if boid died
        if (this.health <= 0 && !this.isDead) {
            this.die();
            
            // Record kill for attacker
            if (attacker) {
                attacker.kills++;
            }
        }
        
        return actualDamage;
    }
    
    die() {
        this.isDead = true;
        this.mesh.visible = false;
        this.hitbox.visible = false;
        this.healthBar.visible = false;
        this.healthBarBg.visible = false;
        
        // Create realistic explosion effect
        this.createRealisticExplosion();
    }
    
    createRealisticExplosion() {
        const position = this.position.clone();
        const teamColor = this.team === TEAMS.RED ? 
            new THREE.Color(0xff3333) : new THREE.Color(0x3333ff);
        
        // 1. Core explosion flash
        this.createExplosionCore(position, teamColor);
        
        // 2. Particle burst
        this.createParticleBurst(position, teamColor);
        
        // 3. Shockwave
        this.createShockwave(position, teamColor);
        
        // 4. Light flash
        this.createExplosionLight(position, teamColor);
        
        // 5. Bubbles
        this.createExplosionBubbles(position);
    }
    
    createExplosionCore(position, color) {
        // Create the explosion core (bright sphere that expands and fades)
        const coreGeometry = new THREE.SphereGeometry(BOID_SIZE * 0.8, 32, 32);
        const coreMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending
        });
        
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.position.copy(position);
        scene.add(core);
        
        // Animate the core explosion
        const startTime = clock.getElapsedTime();
        const duration = 0.8;
        
        function animateCore() {
            const elapsed = clock.getElapsedTime() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1) {
                scene.remove(core);
                core.geometry.dispose();
                core.material.dispose();
                return;
            }
            
            // Expand and then fade
            const scaleFactor = 1 + progress * 4; // Expand to 5x size
            core.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            // Start fading halfway through
            if (progress > 0.3) {
                core.material.opacity = 1.0 - ((progress - 0.3) / 0.7);
            }
            
            // Shift color towards white at peak
            if (progress < 0.3) {
                const whiteAmount = progress / 0.3;
                core.material.color.lerp(new THREE.Color(1, 1, 1), whiteAmount);
            } else {
                // Then back to team color
                const colorAmount = (progress - 0.3) / 0.7;
                core.material.color.lerp(color, colorAmount);
            }
            
            requestAnimationFrame(animateCore);
        }
        
        animateCore();
    }
    
    createParticleBurst(position, color) {
        // Create particles that burst outward
        particleSystem.deathParticles.visible = true;
        particleSystem.deathParticles.position.copy(position);
        particleSystem.deathParticles.material.color.copy(color);
        
        const particleCount = 200;
        const positions = particleSystem.deathParticles.geometry.attributes.position.array;
        
        // Initialize particles in a small sphere
        for (let i = 0; i < particleCount * 3; i += 3) {
            // Random direction
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = Math.random() * 2;
            
            positions[i] = Math.sin(phi) * Math.cos(theta) * r;
            positions[i + 1] = Math.sin(phi) * Math.sin(theta) * r;
            positions[i + 2] = Math.cos(phi) * r;
        }
        
        particleSystem.deathParticles.geometry.attributes.position.needsUpdate = true;
        
        // Prepare particle velocities
        const velocities = [];
        for (let i = 0; i < particleCount; i++) {
            const speed = 10 + Math.random() * 40; // Faster explosion
            const i3 = i * 3;
            const direction = new THREE.Vector3(
                positions[i3], 
                positions[i3 + 1], 
                positions[i3 + 2]
            ).normalize();
            
            velocities.push({
                x: direction.x * speed,
                y: direction.y * speed,
                z: direction.z * speed
            });
        }
        
        // Animate particles
        const startTime = clock.getElapsedTime();
        const duration = 1.0;
        
        function animateParticles() {
            const elapsed = clock.getElapsedTime() - startTime;
            if (elapsed >= duration) {
                particleSystem.deathParticles.visible = false;
                return;
            }
            
            const progress = elapsed / duration;
            const positions = particleSystem.deathParticles.geometry.attributes.position.array;
            
            // Update particle positions
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                const vel = velocities[i];
                
                // Movement with water resistance
                const slowdown = Math.max(0, 1 - progress * 2); // Rapid slowdown
                positions[i3] += vel.x * 0.016 * slowdown;
                positions[i3 + 1] += vel.y * 0.016 * slowdown;
                positions[i3 + 2] += vel.z * 0.016 * slowdown;
                
                // Add buoyancy
                positions[i3 + 1] += 0.05;
            }
            
            // Fade out
            particleSystem.deathParticles.material.opacity = 0.8 * (1 - progress);
            particleSystem.deathParticles.geometry.attributes.position.needsUpdate = true;
            
            requestAnimationFrame(animateParticles);
        }
        
        animateParticles();
    }
    
    createShockwave(position, color) {
        // Create expanding ring shockwave
        const ringGeometry = new THREE.RingGeometry(0.1, 1, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.position.copy(position);
        
        // Random orientation for 3D effect
        ring.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        scene.add(ring);
        
        // Animate the shockwave
        const startTime = clock.getElapsedTime();
        const duration = 0.6;
        
        function animateShockwave() {
            const elapsed = clock.getElapsedTime() - startTime;
            const progress = elapsed / duration;
            
            if (progress >= 1) {
                scene.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
                return;
            }
            
            // Rapid expansion with easing
            const easing = 1 - Math.pow(1 - progress, 3); // Cubic ease out
            const scale = 1 + easing * 20; // Expand to 20x size
            ring.scale.set(scale, scale, scale);
            
            // Fade out
            ring.material.opacity = 0.7 * (1 - easing);
            
            requestAnimationFrame(animateShockwave);
        }
        
        animateShockwave();
    }
    
    createExplosionLight(position, color) {
        // Add a point light for flash
        const light = new THREE.PointLight(color, 3, 100);
        light.position.copy(position);
        scene.add(light);
        
        // Animate the light
        const startTime = clock.getElapsedTime();
        const duration = 0.5;
        
        function animateLight() {
            const elapsed = clock.getElapsedTime() - startTime;
            if (elapsed >= duration) {
                scene.remove(light);
                return;
            }
            
            const progress = elapsed / duration;
            
            // Quick peak then fade
            let intensity;
            if (progress < 0.2) {
                intensity = progress * 5; // Fast ramp up
            } else {
                intensity = 1 - ((progress - 0.2) / 0.8); // Slower fade
            }
            
            light.intensity = intensity * 3;
            
            requestAnimationFrame(animateLight);
        }
        
        animateLight();
    }
    
    createExplosionBubbles(position) {
        const bubbleCount = 20;
        const bubbles = [];
        
        // Create bubbles
        for (let i = 0; i < bubbleCount; i++) {
            const size = 0.5 + Math.random() * 2;
            const bubbleGeometry = new THREE.SphereGeometry(size, 16, 16);
            const bubbleMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.6,
                blending: THREE.AdditiveBlending
            });
            
            const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
            bubble.position.copy(position);
            
            // Add random offset
            bubble.position.x += (Math.random() - 0.5) * 2;
            bubble.position.y += (Math.random() - 0.5) * 2;
            bubble.position.z += (Math.random() - 0.5) * 2;
            
            // Add bubble properties
            bubble.userData.speed = 2 + Math.random() * 5;
            bubble.userData.wobbleSpeed = 0.5 + Math.random() * 2;
            bubble.userData.wobbleAmount = 0.1 + Math.random() * 0.2;
            bubble.userData.delay = Math.random() * 0.3;
            
            scene.add(bubble);
            bubbles.push(bubble);
        }
        
        // Animate bubbles
        const startTime = clock.getElapsedTime();
        const duration = 2.0;
        
        function animateBubbles() {
            const elapsed = clock.getElapsedTime() - startTime;
            if (elapsed >= duration) {
                bubbles.forEach(bubble => {
                    scene.remove(bubble);
                    bubble.geometry.dispose();
                    bubble.material.dispose();
                });
                return;
            }
            
            bubbles.forEach(bubble => {
                if (elapsed < bubble.userData.delay) return;
                
                const bubbleElapsed = elapsed - bubble.userData.delay;
                const wobbleX = Math.sin(bubbleElapsed * bubble.userData.wobbleSpeed) * bubble.userData.wobbleAmount;
                const wobbleZ = Math.cos(bubbleElapsed * bubble.userData.wobbleSpeed) * bubble.userData.wobbleAmount;
                
                // Rise with wobble
                bubble.position.y += bubble.userData.speed * 0.016;
                bubble.position.x += wobbleX;
                bubble.position.z += wobbleZ;
                
                // Fade out at the end
                if (bubbleElapsed > duration - 0.5) {
                    bubble.material.opacity = 0.6 * (1 - (bubbleElapsed - (duration - 0.5)) * 2);
                }
            });
            
            requestAnimationFrame(animateBubbles);
        }
        
        animateBubbles();
    }
    
    flock(boids) {
        if (this.isDead) return;
        
        // Apply flocking behaviors
        const sep = this.separate(boids);
        const ali = this.align(boids);
        const coh = this.cohesion(boids);
        const cha = this.charge(boids);
        const fle = this.flee(boids);
        const bnd = this.avoidBoundaries();
        
        // Apply all forces
        this.applyForce(sep);
        this.applyForce(ali);
        this.applyForce(coh);
        this.applyForce(cha);
        this.applyForce(fle);
        this.applyForce(bnd);
        
        // Handle collisions with damage
        this.handleCollisions(boids);
        
        // Attack nearby enemies
        this.attack(boids);
    }
    
    update(delta) {
        if (this.isDead) return;
        
        // Apply speed multiplier from debug controls
        const adjustedDelta = delta * debug.speedMultiplier;
        
        // Update physics with SPEED_MULTIPLIER for 10x faster movement
        this.velocity.add(this.acceleration.clone().multiplyScalar(adjustedDelta));
        this.velocity.clampLength(0, this.genes.maxSpeed * SPEED_MULTIPLIER);
        
        // Move boid
        this.position.add(this.velocity.clone().multiplyScalar(adjustedDelta));
        
        // Enforce floor boundary - hard limit to prevent going below the floor
        if (this.position.y < FLOOR_Y_POSITION + BOID_SIZE) {
            this.position.y = FLOOR_Y_POSITION + BOID_SIZE;
            this.velocity.y = Math.abs(this.velocity.y) * 0.5; // Bounce slightly
        }
        
        this.acceleration.multiplyScalar(0);
        
        // Update mesh and hitbox
        this.updateMesh();
        
        // Update health bar
        this.updateHealthBar();
    }
    
    updateMesh() {
        this.mesh.position.copy(this.position);
        this.hitbox.position.copy(this.position);
        
        // Add gentle rotation for spherical boids
        if (this.velocity.length() > 0.1) {
            // Rotate based on movement direction
            const axis = new THREE.Vector3(
                this.velocity.y,
                -this.velocity.x,
                this.velocity.z
            ).normalize();
            
            const angle = 0.05 * this.velocity.length() / this.genes.maxSpeed;
            this.mesh.rotateOnAxis(axis, angle);
        }
    }
    
    calculateFitness() {
        // Calculate fitness based on performance
        let fitness = 0;
        
        // Survival bonus
        if (!this.isDead) {
            fitness += 100;
        }
        
        // Kill score
        fitness += this.kills * 50;
        
        // Damage dealt
        fitness += this.damageDealt * 0.5;
        
        // Damage taken (negative impact, but not too severe)
        fitness -= this.damageTaken * 0.2;
        
        this.fitnessScore = Math.max(1, fitness);
        return this.fitnessScore;
    }
    
    destroy() {
        scene.remove(this.mesh);
        scene.remove(this.hitbox);
        scene.remove(this.healthBar);
        scene.remove(this.healthBarBg);
        
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.hitbox.geometry.dispose();
        this.hitbox.material.dispose();
        this.healthBar.geometry.dispose();
        this.healthBar.material.dispose();
        this.healthBarBg.geometry.dispose();
        this.healthBarBg.material.dispose();
    }
}

function createRandomGenes() {
    return {
        separation: {
            weight: THREE.MathUtils.lerp(
                geneConstraints.separation.weight.min,
                geneConstraints.separation.weight.max,
                Math.random()
            ),
            radius: THREE.MathUtils.lerp(
                geneConstraints.separation.radius.min,
                geneConstraints.separation.radius.max,
                Math.random()
            )
        },
        alignment: {
            weight: THREE.MathUtils.lerp(
                geneConstraints.alignment.weight.min,
                geneConstraints.alignment.weight.max,
                Math.random()
            ),
            radius: THREE.MathUtils.lerp(
                geneConstraints.alignment.radius.min,
                geneConstraints.alignment.radius.max,
                Math.random()
            )
        },
        cohesion: {
            weight: THREE.MathUtils.lerp(
                geneConstraints.cohesion.weight.min,
                geneConstraints.cohesion.weight.max,
                Math.random()
            ),
            radius: THREE.MathUtils.lerp(
                geneConstraints.cohesion.radius.min,
                geneConstraints.cohesion.radius.max,
                Math.random()
            )
        },
        charge: {
            weight: THREE.MathUtils.lerp(
                geneConstraints.charge.weight.min,
                geneConstraints.charge.weight.max,
                Math.random()
            ),
            radius: THREE.MathUtils.lerp(
                geneConstraints.charge.radius.min,
                geneConstraints.charge.radius.max,
                Math.random()
            )
        },
        flee: {
            weight: THREE.MathUtils.lerp(
                geneConstraints.flee.weight.min,
                geneConstraints.flee.weight.max,
                Math.random()
            ),
            radius: THREE.MathUtils.lerp(
                geneConstraints.flee.radius.min,
                geneConstraints.flee.radius.max,
                Math.random()
            )
        },
        maxSpeed: THREE.MathUtils.lerp(
            geneConstraints.maxSpeed.min,
            geneConstraints.maxSpeed.max,
            Math.random()
        ),
        maxForce: THREE.MathUtils.lerp(
            geneConstraints.maxForce.min,
            geneConstraints.maxForce.max,
            Math.random()
        ),
        health: THREE.MathUtils.lerp(
            geneConstraints.health.min,
            geneConstraints.health.max,
            Math.random()
        ),
        damage: THREE.MathUtils.lerp(
            geneConstraints.damage.min,
            geneConstraints.damage.max,
            Math.random()
        ),
        attackCooldown: THREE.MathUtils.lerp(
            geneConstraints.attackCooldown.min,
            geneConstraints.attackCooldown.max,
            Math.random()
        ),
        aggressiveness: THREE.MathUtils.lerp(
            geneConstraints.aggressiveness.min,
            geneConstraints.aggressiveness.max,
            Math.random()
        ),
        defensiveness: THREE.MathUtils.lerp(
            geneConstraints.defensiveness.min,
            geneConstraints.defensiveness.max,
            Math.random()
        ),
        sightRange: THREE.MathUtils.lerp(
            geneConstraints.sightRange.min,
            geneConstraints.sightRange.max,
            Math.random()
        )
    };
}

function mutateGenes(genes) {
    const mutated = JSON.parse(JSON.stringify(genes)); // Deep clone
    
    // Helper function to mutate a value
    function mutateValue(value, min, max) {
        if (Math.random() < MUTATION_RATE) {
            // Apply mutation
            const change = (Math.random() * 2 - 1) * MUTATION_AMOUNT;
            let newValue = value * (1 + change);
            // Clamp to valid range
            return THREE.MathUtils.clamp(newValue, min, max);
        }
        return value;
    }
    
    // Mutate each gene
    mutated.separation.weight = mutateValue(
        mutated.separation.weight,
        geneConstraints.separation.weight.min,
        geneConstraints.separation.weight.max
    );
    
    mutated.separation.radius = mutateValue(
        mutated.separation.radius,
        geneConstraints.separation.radius.min,
        geneConstraints.separation.radius.max
    );
    
    mutated.alignment.weight = mutateValue(
        mutated.alignment.weight,
        geneConstraints.alignment.weight.min,
        geneConstraints.alignment.weight.max
    );
    
    mutated.alignment.radius = mutateValue(
        mutated.alignment.radius,
        geneConstraints.alignment.radius.min,
        geneConstraints.alignment.radius.max
    );
    
    mutated.cohesion.weight = mutateValue(
        mutated.cohesion.weight,
        geneConstraints.cohesion.weight.min,
        geneConstraints.cohesion.weight.max
    );
    
    mutated.cohesion.radius = mutateValue(
        mutated.cohesion.radius,
        geneConstraints.cohesion.radius.min,
        geneConstraints.cohesion.radius.max
    );
    
    mutated.charge.weight = mutateValue(
        mutated.charge.weight,
        geneConstraints.charge.weight.min,
        geneConstraints.charge.weight.max
    );
    
    mutated.charge.radius = mutateValue(
        mutated.charge.radius,
        geneConstraints.charge.radius.min,
        geneConstraints.charge.radius.max
    );
    
    mutated.flee.weight = mutateValue(
        mutated.flee.weight,
        geneConstraints.flee.weight.min,
        geneConstraints.flee.weight.max
    );
    
    mutated.flee.radius = mutateValue(
        mutated.flee.radius,
        geneConstraints.flee.radius.min,
        geneConstraints.flee.radius.max
    );
    
    mutated.maxSpeed = mutateValue(
        mutated.maxSpeed,
        geneConstraints.maxSpeed.min,
        geneConstraints.maxSpeed.max
    );
    
    mutated.maxForce = mutateValue(
        mutated.maxForce,
        geneConstraints.maxForce.min,
        geneConstraints.maxForce.max
    );
    
    mutated.health = mutateValue(
        mutated.health,
        geneConstraints.health.min,
        geneConstraints.health.max
    );
    
    mutated.damage = mutateValue(
        mutated.damage,
        geneConstraints.damage.min,
        geneConstraints.damage.max
    );
    
    mutated.attackCooldown = mutateValue(
        mutated.attackCooldown,
        geneConstraints.attackCooldown.min,
        geneConstraints.attackCooldown.max
    );
    
    mutated.aggressiveness = mutateValue(
        mutated.aggressiveness,
        geneConstraints.aggressiveness.min,
        geneConstraints.aggressiveness.max
    );
    
    mutated.defensiveness = mutateValue(
        mutated.defensiveness,
        geneConstraints.defensiveness.min,
        geneConstraints.defensiveness.max
    );
    
    mutated.sightRange = mutateValue(
        mutated.sightRange,
        geneConstraints.sightRange.min,
        geneConstraints.sightRange.max
    );
    
    return mutated;
}

function initializeBoids() {
    // Create red team
    for (let i = 0; i < TEAM_SIZES; i++) {
        const boid = new Boid(TEAMS.RED);
        boids.push(boid);
    }
    
    // Create blue team
    for (let i = 0; i < TEAM_SIZES; i++) {
        const boid = new Boid(TEAMS.BLUE);
        boids.push(boid);
    }
    
    // Create player boid (blue team)
    playerBoid = new Boid(TEAMS.BLUE, null, true);
    boids.push(playerBoid);
    
    // Position player camera
    resetPlayerCamera();
}

function resetPlayerCamera() {
    // Reset player position to blue team starting area
    playerBoid.position.set(0, 0, WORLD_SIZE * 0.6);
    playerBoid.velocity.set(0, 0, -1);
    playerBoid.acceleration.set(0, 0, 0);
    
    // Ensure player is above the floor
    if (playerBoid.position.y < FLOOR_Y_POSITION + BOID_SIZE * 2) {
        playerBoid.position.y = FLOOR_Y_POSITION + BOID_SIZE * 2;
    }
    
    playerBoid.updateMesh();
    
    // Position camera at player
    camera.position.copy(playerBoid.position);
    if (playerControls) {
        playerControls.getObject().position.copy(playerBoid.position);
    }
}

function updateBoids(delta) {
    if (debug.paused) return;
    
    // Apply flocking behaviors
    for (const boid of boids) {
        if (!boid.isPlayer && !boid.isDead) {
            boid.flock(boids);
        }
    }
    
    // Update positions
    for (const boid of boids) {
        if (!boid.isPlayer) {
            boid.update(delta);
        } else {
            // Player boid follows the camera
            if (playerControls) {
                boid.position.copy(playerControls.getObject().position);
                boid.updateMesh();
                
                // Player can attack too
                boid.attack(boids);
            }
        }
    }
}

function updateBattle(delta) {
    if (!battleActive || debug.paused) return;
    
    battleTimer += delta;
    document.getElementById('battle-time').textContent = Math.floor(battleTimer);
    
    // Count living boids in each team
    const redCount = boids.filter(b => b.team === TEAMS.RED && !b.isDead).length;
    const blueCount = boids.filter(b => b.team === TEAMS.BLUE && !b.isDead && !b.isPlayer).length;
    
    document.getElementById('red-count').textContent = redCount;
    document.getElementById('blue-count').textContent = blueCount;
    
    // Check if battle should end
    if (battleTimer >= BATTLE_DURATION || redCount === 0 || blueCount === 0) {
        endBattle();
    }
}

function endBattle() {
    battleActive = false;
    
    // Determine winners and survivors
    const redSurvivors = boids.filter(b => b.team === TEAMS.RED && !b.isDead);
    const blueSurvivors = boids.filter(b => b.team === TEAMS.BLUE && !b.isDead && !b.isPlayer);
    
    // Calculate fitness scores for all boids
    for (const boid of boids) {
        if (!boid.isPlayer) {
            boid.calculateFitness();
        }
    }
    
    // Record battle results
    const battleResult = {
        generation: generation,
        redSurvivors: redSurvivors.length,
        blueSurvivors: blueSurvivors.length,
        duration: battleTimer,
        redTopFitness: redSurvivors.length > 0 ? Math.max(...redSurvivors.map(b => b.fitnessScore)) : 0,
        blueTopFitness: blueSurvivors.length > 0 ? Math.max(...blueSurvivors.map(b => b.fitnessScore)) : 0
    };
    
    battleHistory.generations.push(battleResult);
    
    // Determine winner
    if (redSurvivors.length > blueSurvivors.length) {
        battleHistory.redWins++;
    } else if (blueSurvivors.length > redSurvivors.length) {
        battleHistory.blueWins++;
    } else {
        battleHistory.draws++;
    }
    
    console.log(`Battle ended. Generation ${generation} - Red survivors: ${redSurvivors.length}, Blue survivors: ${blueSurvivors.length}`);
    
    // Start new generation after a short delay
    setTimeout(() => {
        startNewGeneration(redSurvivors, blueSurvivors);
    }, 3000);
}

function startNewGeneration(redSurvivors, blueSurvivors) {
    generation++;
    document.getElementById('generation').textContent = generation;
    
    // Clean up old boids
    for (const boid of boids) {
        if (!boid.isPlayer) {
            boid.destroy();
        }
    }
    
    // Create new boids with evolved genes
    boids = [];
    
    // Add player boid back
    boids.push(playerBoid);
    
    // Reset player
    playerBoid.health = playerBoid.maxHealth;
    playerBoid.isDead = false;
    playerBoid.kills = 0;
    playerBoid.damageDealt = 0;
    playerBoid.damageTaken = 0;
    playerBoid.mesh.visible = !isPlayerInvisible;
    playerBoid.hitbox.visible = debug.showHitboxes && !isPlayerInvisible;
    playerBoid.healthBar.visible = true;
    playerBoid.healthBarBg.visible = true;
    playerBoid.mesh.material.color.set(0x3333ff);
    resetPlayerCamera();
    
    // Reproduce red team
    createNewTeam(TEAMS.RED, redSurvivors);
    
    // Reproduce blue team
    createNewTeam(TEAMS.BLUE, blueSurvivors);
    
    // Reset battle timer
    battleTimer = 0;
    battleActive = true;
    
    // Reset selected boid
    selectedBoid = null;
    boidInfoPanel.style.display = 'none';
    geneVisualizationPanel.style.display = 'none';
}

function createNewTeam(team, survivors) {
    // If no survivors, create new random boids
    if (survivors.length === 0) {
        for (let i = 0; i < TEAM_SIZES; i++) {
            const boid = new Boid(team);
            boids.push(boid);
        }
        return;
    }
    
    // Calculate total fitness to use for weighted selection
    let totalFitness = survivors.reduce((sum, boid) => sum + boid.fitnessScore, 0);
    
    // Create new team through selection and mutation
    for (let i = 0; i < TEAM_SIZES; i++) {
        // Select parent based on fitness (higher fitness = higher chance)
        const parent = selectParentByFitness(survivors, totalFitness);
        
        // Create a new boid with mutated genes
        const mutatedGenes = mutateGenes(parent.genes);
        const boid = new Boid(team, mutatedGenes);
        
        boids.push(boid);
    }
}

function selectParentByFitness(survivors, totalFitness) {
    // Roulette wheel selection
    let rand = Math.random() * totalFitness;
    let runningSum = 0;
    
    for (const survivor of survivors) {
        runningSum += survivor.fitnessScore;
        if (runningSum >= rand) {
            return survivor;
        }
    }
    
    // Fallback
    return survivors[survivors.length - 1];
}

function resetSimulation() {
    // Stop ambient sound
    if (sounds.ambient && sounds.ambient.isPlaying) {
        sounds.ambient.stop();
    }
    
    // Clean up all boids
    for (const boid of boids) {
        boid.destroy();
    }
    
    // Reset global variables
    boids = [];
    generation = 1;
    battleTimer = 0;
    battleActive = true;
    selectedBoid = null;
    
    battleHistory = {
        generations: [],
        redWins: 0,
        blueWins: 0,
        draws: 0
    };
    
    // Update UI
    document.getElementById('generation').textContent = generation;
    document.getElementById('battle-time').textContent = '0';
    
    // Initialize new boids
    initializeBoids();
    
    // Restart sound
    if (sounds.ambient) {
        sounds.ambient.play();
    }
    
    // Hide info panels
    boidInfoPanel.style.display = 'none';
    geneVisualizationPanel.style.display = 'none';
}

function updatePlayerMovement(delta) {
    if (!playerControls || !playerControls.isLocked) return;
    
    const speed = (keys.boost ? 120 : 60) * delta * SPEED_MULTIPLIER * 0.5; // Player speed also increased but not as much as boids
    const playerDirection = new THREE.Vector3();
    const playerObject = playerControls.getObject();
    
    // Calculate movement direction
    if (keys.forward) {
        playerDirection.z = -1;
    }
    if (keys.backward) {
        playerDirection.z = 1;
    }
    if (keys.left) {
        playerDirection.x = -1;
    }
    if (keys.right) {
        playerDirection.x = 1;
    }
    if (keys.up) {
        playerDirection.y = 1;
    }
    if (keys.down) {
        playerDirection.y = -1;
    }
    
    // Normalize and apply direction
    if (playerDirection.length() > 0) {
        playerDirection.normalize();
        
        // Move in camera direction for forward/backward/left/right
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        
        const horizontalMovement = new THREE.Vector3();
        
        if (keys.forward || keys.backward) {
            // Forward/backward follows camera direction
            horizontalMovement.add(
                cameraDirection.clone().multiplyScalar(keys.forward ? 1 : -1)
            );
        }
        
        if (keys.left || keys.right) {
            // Left/right is perpendicular to camera direction
            const rightVector = new THREE.Vector3().crossVectors(
                cameraDirection,
                new THREE.Vector3(0, 1, 0)
            ).normalize();
            
            horizontalMovement.add(
                rightVector.clone().multiplyScalar(keys.right ? 1 : -1)
            );
        }
        
        // Normalize horizontal movement
        if (horizontalMovement.length() > 0) {
            horizontalMovement.normalize();
        }
        
        // Apply horizontal movement
        playerObject.position.add(
            horizontalMovement.multiplyScalar(speed)
        );
        
        // Apply vertical movement directly
        if (keys.up || keys.down) {
            playerObject.position.y += (keys.up ? 1 : -1) * speed;
        }
        
        // Check world boundaries
        const margin = 5;
        playerObject.position.x = THREE.MathUtils.clamp(
            playerObject.position.x,
            -WORLD_SIZE + margin,
            WORLD_SIZE - margin
        );
        
        // Enforce floor boundary for player
        if (playerObject.position.y < FLOOR_Y_POSITION + BOID_SIZE * 2) {
            playerObject.position.y = FLOOR_Y_POSITION + BOID_SIZE * 2;
        } else {
            playerObject.position.y = THREE.MathUtils.clamp(
                playerObject.position.y,
                -WORLD_SIZE + margin,
                WORLD_SIZE - margin
            );
        }
        
        playerObject.position.z = THREE.MathUtils.clamp(
            playerObject.position.z,
            -WORLD_SIZE + margin,
            WORLD_SIZE - margin
        );
    }
    
    // Update boundary visibility based on player position
    updateBoundaryWallVisibility();
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
            keys.forward = true;
            break;
        case 'KeyS':
            keys.backward = true;
            break;
        case 'KeyA':
            keys.left = true;
            break;
        case 'KeyD':
            keys.right = true;
            break;
        case 'Space':
        case 'KeyQ':
            keys.up = true;
            break;
        case 'KeyE':
            keys.down = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keys.boost = true;
            break;
        case 'KeyH':
            // Toggle invisibility
            isPlayerInvisible = !isPlayerInvisible;
            playerBoid.mesh.visible = !isPlayerInvisible;
            playerBoid.hitbox.visible = debug.showHitboxes && !isPlayerInvisible;
            document.getElementById('invisibility-status').textContent = 
                `Visibility: ${isPlayerInvisible ? 'OFF' : 'ON'}`;
            break;
        case 'KeyR':
            // Reset camera
            resetPlayerCamera();
            break;
        case 'KeyM':
            // Toggle sound
            if (sounds.ambient) {
                if (sounds.ambient.isPlaying) {
                    sounds.ambient.pause();
                } else {
                    sounds.ambient.play();
                }
            }
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
            keys.forward = false;
            break;
        case 'KeyS':
            keys.backward = false;
            break;
        case 'KeyA':
            keys.left = false;
            break;
        case 'KeyD':
            keys.right = false;
            break;
        case 'Space':
        case 'KeyQ':
            keys.up = false;
            break;
        case 'KeyE':
            keys.down = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keys.boost = false;
            break;
    }
}

function updateUnderwaterEffects(delta) {
    // Update time for all underwater shaders and effects
    const time = clock.getElapsedTime();
    underwaterUniforms.time.value = time;
    
    // Update all shaders that use time
    scene.traverse(object => {
        if (object.material && object.material.uniforms && object.material.uniforms.time) {
            object.material.uniforms.time.value = time;
        }
    });
    
    // Update bubble animations
    if (scene.userData.animateBubbles) {
        scene.userData.animateBubbles();
    }
    
    // Make dust particles drift
    if (particleSystem.dustParticles) {
        const positions = particleSystem.dustParticles.geometry.attributes.position.array;
        const count = positions.length / 3;
        
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            
            // Gentle drift
            positions[i3] += (Math.sin(time * 0.1 + i) * 0.03);
            positions[i3 + 1] += (Math.cos(time * 0.1 + i) * 0.01);
            positions[i3 + 2] += (Math.sin(time * 0.07 + i) * 0.03);
            
            // Keep within bounds
            if (Math.abs(positions[i3]) > WORLD_SIZE) positions[i3] *= 0.98;
            if (Math.abs(positions[i3 + 1]) > WORLD_SIZE) positions[i3 + 1] *= 0.98;
            if (Math.abs(positions[i3 + 2]) > WORLD_SIZE) positions[i3 + 2] *= 0.98;
        }
        
        particleSystem.dustParticles.geometry.attributes.position.needsUpdate = true;
    }
    
    // Update boid info panel if enabled
    if (debug.showBoidInfo && selectedBoid) {
        updateBoidInfoPanel();
        
        if (debug.showGeneHeatmaps) {
            updateGeneVisualizationPanel();
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    
    // Update underwater effects
    updateUnderwaterEffects(delta);
    
    // Update player movement
    updatePlayerMovement(delta);
    
    // Update boids
    updateBoids(delta);
    
    // Update battle state
    updateBattle(delta);
    
    // Render scene with post-processing
    composer.render();
}

// Start the application
init();