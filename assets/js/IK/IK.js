var container, stats, controls;
var camera, scene, renderer, light;
var draggableObjects = [];
var IKJoints = [];
var endEffector = null;
var boxGeometry = new THREE.BoxBufferGeometry(100, 100, 100);
var white = new THREE.MeshLambertMaterial({ color: 0x888888 });
init();
animate();
function init() {
  container = document.createElement('div');
  document.body.appendChild(container);
  camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
  camera.position.set(50, 100, 150);
  controls = new THREE.OrbitControls(camera);
  controls.target.set(0, 45, 0);
  controls.update();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);//0xa0a0a0
  scene.fog = new THREE.Fog(0xffffff, 200, 600);//0xa0a0a0
  light = new THREE.HemisphereLight(0xffffff, 0x444444);
  light.position.set(0, 200, 0);
  scene.add(light);
  light = new THREE.DirectionalLight(0xffffff);
  light.position.set(0, 200, 100);
  light.castShadow = true;
  light.shadow.camera.top = 180;
  light.shadow.camera.bottom = - 100;
  light.shadow.camera.left = - 120;
  light.shadow.camera.right = 120;
  scene.add(light);
  //scene.add(new THREE.CameraHelper(light.shadow.camera));
  // ground
  var mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2000, 2000), new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }));
  mesh.rotation.x = - Math.PI / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);
  var grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
  grid.material.opacity = 0.2;
  grid.material.transparent = true;
  scene.add(grid);
  var canvasID = document.getElementById("IK");
  renderer = new THREE.WebGLRenderer({ canvas: canvasID, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  //renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  //container.appendChild(renderer.domElement);
  //window.addEventListener('resize', onWindowResize, false);

  //Assemble the Robot Arm
  //var base = new THREE.Group();
  //scene.add(base);
  var base = addJoint(scene, [0, 0, 0], [0, 1, 0], [0, 0], [0.05, 0.1, 0.05], [0, 5, 0]);
  var firstJoint = addJoint(base, [0, 11.52001, 0], [0, 1, 0], [-180, 180], [0.1, 0.1, 0.1], [0, 2.5, 0]);
  var secondJoint = addJoint(firstJoint, [-6.55, 4.6, 0.0], [1, 0, 0], [-90, 90], [0.1, 0.45, 0.1], [-3.450041, 14.7, 0]);
  var thirdJoint = addJoint(secondJoint, [1.247041, 32.02634, -0.0739485], [1, 0, 0], [-150, 150], [0.05, 0.35, 0.05], [2.8, 15.14, 0]);
  var fourthJoint = addJoint(thirdJoint, [2.984276, 30.01859, 0.0], [1, 0, 0], [-90, 90], [0.05, 0.05, 0.05], [4.8, 0.17, 0]);
  var fifthJoint = addJoint(fourthJoint, [4.333822, 4.200262, 0.0], [0, 1, 0], [-180, 180], [0.1, 0.035, 0.035], [3.156178, 0.3, 0]);
  endEffector = new THREE.Group();
  fifthJoint.add(endEffector);
  endEffector.position.set(8.3, 1.0, 0.0);

  var target = new THREE.Mesh(boxGeometry, new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff }));
  target.position.set(0, 100, 0);
  target.scale.set(0.05, 0.05, 0.05);
  target.transparent = true;
  target.opacity = 0.5;
  target.castShadow = true;
  //target.receiveShadow = true;
  scene.add(target);
  draggableObjects.push(target);

  var dragControls = new THREE.DragControls(draggableObjects, camera, renderer.domElement);
  dragControls.addEventListener('dragstart', function () {
    controls.enabled = false;
  });
  dragControls.addEventListener('dragend', function () {
    controls.enabled = true;
  });
}

function addJoint(base, position, axis, limits, size, graphicsOffset) {
  var joint = new THREE.Group();
  base.add(joint);
  joint.position.set(position[0], position[1], position[2]);
  joint.axis = new THREE.Vector3(axis[0], axis[1], axis[2]);
  joint.minLimit = limits[0] * 0.0174533;
  joint.maxLimit = limits[1] * 0.0174533;
  IKJoints.push(joint);
  var box = new THREE.Mesh(boxGeometry, white);
  joint.add(box);
  box.scale.set(size[0], size[1], size[2]);
  box.position.set(graphicsOffset[0], graphicsOffset[1], graphicsOffset[2]);
  box.castShadow = true;
  //box.receiveShadow = true;
  return joint;
}

//Beautiful CCDIK
function solveIK(targetPosition) {
  var tooltipPosition = new THREE.Vector3();
  for (var i = IKJoints.length - 1; i >= 0; i--) {
    IKJoints[i].updateMatrixWorld();
    endEffector.getWorldPosition(tooltipPosition);

    //Rotate towards the Target
    //(Ideally this could be done entirely in worldspace (instead of local space))
    var toolDirection = IKJoints[i].worldToLocal(tooltipPosition.clone()).normalize();
    var targetDirection = IKJoints[i].worldToLocal(targetPosition.clone()).normalize();
    var fromToQuat = new THREE.Quaternion(0, 0, 0, 1).setFromUnitVectors(toolDirection, targetDirection);
    IKJoints[i].quaternion.multiply(fromToQuat);

    //Find the rotation from here to the parent, and rotate the axis by it...
    //This ensures that you're always rotating with the hinge
    var invRot = IKJoints[i].quaternion.clone().inverse();
    var parentAxis = IKJoints[i].axis.clone().applyQuaternion(invRot);
    fromToQuat.setFromUnitVectors(IKJoints[i].axis, parentAxis);
    IKJoints[i].quaternion.multiply(fromToQuat);

    //Clamp to Joint Limits - Devious and relies on sensical computation of these values...
    //Seems like rotations range from -pi, pi... not the worst... but bad for clamps through there
    var clampedRot = IKJoints[i].rotation.toVector3().clampScalar(IKJoints[i].minLimit, IKJoints[i].maxLimit);
    IKJoints[i].rotation.setFromVector3(clampedRot);

    IKJoints[i].updateMatrixWorld();
  }
}

function animate() {
  solveIK(draggableObjects[0].position);
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}