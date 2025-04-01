/*-------------------------------------------------------------------------
07_LineSegments.js

left mouse button을 click하면 선분을 그리기 시작하고, 
button up을 하지 않은 상태로 마우스를 움직이면 임시 선분을 그리고, 
button up을 하면 최종 선분을 저장하고 임시 선분을 삭제함.

임시 선분의 color는 회색이고, 최종 선분의 color는 빨간색임.

이 과정을 반복하여 여러 개의 선분 (line segment)을 그릴 수 있음. 
---------------------------------------------------------------------------*/
import { resizeAspectRatio, setupText, updateText, Axes } from '/util.js';
import { Shader, readShaderFile } from '/shader.js';

// Global variables
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let isInitialized = false;  // main이 실행되는 순간 true로 change
let shader;
let vao;
let positionBuffer; // 2D position을 위한 VBO (Vertex Buffer Object)
let isDrawing = false; // mouse button을 누르고 있는 동안 true로 change
let startPoint = null;  // mouse button을 누른 위치
let tempEndPoint = null; // mouse를 움직이는 동안의 위치
let lines = []; // 그려진 선분들을 저장하는 array
let axes = new Axes(gl, 0.85); // x, y axes 그려주는 object (see util.js)
let center = null;
let radius = 0;
let vertices = [];
const numSegments = 100;
let drawcircle = false;
let intersections = [];

document.addEventListener('DOMContentLoaded', () => {
    if (isInitialized) { // true인 경우는 main이 이미 실행되었다는 뜻이므로 다시 실행하지 않음
        console.log("Already initialized");
        return;
    }

    main().then(success => { // call main function
        if (!success) {
            console.log('프로그램을 종료합니다.');
            return;
        }
        isInitialized = true;
    }).catch(error => {
        console.error('프로그램 실행 중 오류 발생:', error);
    });
});

function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    canvas.width = 700;
    canvas.height = 700;

    resizeAspectRatio(gl, canvas);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.2, 0.3, 1.0);

    return true;
}

function setupBuffers() {
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    shader.setAttribPointer('a_position', 2, gl.FLOAT, false, 0, 0); // x, y 2D 좌표

    gl.bindVertexArray(null);
}

// 좌표 변환 함수: 캔버스 좌표를 WebGL 좌표로 변환
// 캔버스 좌표: 캔버스 좌측 상단이 (0, 0), 우측 하단이 (canvas.width, canvas.height)
// WebGL 좌표 (NDC): 캔버스 좌측 하단이 (-1, -1), 우측 상단이 (1, 1)
function convertToWebGLCoordinates(x, y) {
    return [
        (x / canvas.width) * 2 - 1,  // x/canvas.width 는 0 ~ 1 사이의 값, 이것을 * 2 - 1 하면 -1 ~ 1 사이의 값
        -((y / canvas.height) * 2 - 1) // y canvas 좌표는 상하를 뒤집어 주어야 하므로 -1을 곱함
    ];
}

function setupMouseEvents() {
    function handleMouseDown(event) {
        event.preventDefault(); // 이미 존재할 수 있는 기본 동작을 방지
        event.stopPropagation(); // event가 상위 요소 (div, body, html 등)으로 전파되지 않도록 방지

        const rect = canvas.getBoundingClientRect(); // canvas를 나타내는 rect 객체를 반환
        const x = event.clientX - rect.left;  // canvas 내 x 좌표
        const y = event.clientY - rect.top;   // canvas 내 y 좌표
        
        if (!isDrawing && lines.length < 2) { 
            // 1번 또는 2번 선분을 그리고 있는 도중이 아닌 경우 (즉, mouse down 상태가 아닌 경우)
            // 캔버스 좌표를 WebGL 좌표로 변환하여 선분의 시작점을 설정
            let [glX, glY] = convertToWebGLCoordinates(x, y);
            startPoint = [glX, glY];
            if (!drawcircle) {
                center = [glX, glY];
            }
            isDrawing = true; // 이제 mouse button을 놓을 때까지 계속 true로 둠. 즉, mouse down 상태가 됨
        }
    }

    function handleMouseMove(event) {
        if (isDrawing) { // 1번 또는 2번 선분을 그리고 있는 도중인 경우
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            let [glX, glY] = convertToWebGLCoordinates(x, y);
            tempEndPoint = [glX, glY]; // 임시 선분의 끝 point
            if (!drawcircle) {
                radius = Math.sqrt((tempEndPoint[0] - center[0]) ** 2 + (tempEndPoint[1] - center[1]) ** 2);
                vertices = [];
                for (let i = 0; i <= numSegments; i++) {
                    let theta = (i / numSegments) * 2 * Math.PI;
                    let circle_x = center[0] + radius * Math.cos(theta);
                    let circle_y = center[1] + radius * Math.sin(theta);
                    vertices.push(circle_x, circle_y);
                }
            }
            render();
        }
    }

    function handleMouseUp() {
        if (isDrawing && tempEndPoint) {

            lines.push([...startPoint, ...tempEndPoint]); 

            if (lines.length == 1) {
                radius = Math.sqrt((tempEndPoint[0] - center[0]) ** 2 + (tempEndPoint[1] - center[1]) ** 2);

                if (!drawcircle) {
                    vertices = [];
                    for (let i = 0; i <= numSegments; i++) {
                        let theta = (i / numSegments) * 2 * Math.PI;
                        let circle_x = center[0] + radius * Math.cos(theta);
                        let circle_y = center[1] + radius * Math.sin(theta);
                        vertices.push(circle_x, circle_y);
                    }
                }
                setupText(canvas, "Circle: center (" + center[0].toFixed(2) + ", " + center[1].toFixed(2) + 
                                    ") radius = " + radius.toFixed(2), 1);
            }
            else { // lines.length == 2
                setupText(canvas, "line segment: (" + lines[1][0].toFixed(2) + ", " + lines[1][1].toFixed(2) + 
                    ") ~ (" + lines[1][2].toFixed(2) + ", " + lines[1][3].toFixed(2) + ")", 2);

                let [x1, y1, x2, y2] = lines[1];
                intersections = calculate(center[0], center[1], radius, x1, y1, x2, y2);
                if (intersections.length == 0) {
                    setupText(canvas, "No intersection", 3);
                } else if (intersections.length == 1) {
                    setupText(canvas, "Intersection Points: " + intersections.length +
                        " Point 1: (" + intersections[0][0].toFixed(2) + ", " + intersections[0][1].toFixed(2) + ")", 3);
                } else {
                setupText(canvas, "Intersection Points: " + intersections.length +
                    " Point 1: (" + intersections[0][0].toFixed(2) + ", " + intersections[0][1].toFixed(2) + ")" +
                    " Point 2: (" + intersections[1][0].toFixed(2) + ", " + intersections[1][1].toFixed(2) + ")", 3);
                }
            }

            if (!drawcircle) {
                drawcircle = true;
            }
            isDrawing = false;
            startPoint = null;
            tempEndPoint = null;
            render();
        }
    }

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    shader.use();
    
    // 저장된 선들 그리기
    let num = 0;
    for (let line of lines) {
        if (num == 0) { // circle
            shader.setVec4("u_color", [1.0, 0.0, 1.0, 1.0]);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.LINE_STRIP, 0, vertices.length / 2);
        }
        else { // num == 1 (2번째 선분인 경우)
            shader.setVec4("u_color", [1.0, 1.0, 1.0, 1.0]);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(line), gl.STATIC_DRAW);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.LINES, 0, 2);
        }
        num++;
    }

    // 임시 선 그리기
    if (isDrawing && startPoint && tempEndPoint) {
        shader.setVec4("u_color", [0.5, 0.5, 0.5, 1.0]); // 임시 선분의 color는 회색
        if (!drawcircle) {
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.LINE_STRIP, 0, vertices.length / 2);
        } else {
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...startPoint, ...tempEndPoint]), 
                        gl.STATIC_DRAW);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.LINES, 0, 2);
        }
    }

    if (lines.length == 2) { // intersection pointer
        shader.setVec4("u_color", [1.0, 1.0, 0.0, 1.0]);

        let intersectionVertices = []; // 1차원 배열로 변환
        for (let intersection of intersections) {
            intersectionVertices.push(...intersection);
        }
        
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(intersectionVertices), gl.STATIC_DRAW);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.POINTS, 0, intersections.length);
    }

    // axes 그리기
    axes.draw(mat4.create(), mat4.create()); // 두 개의 identity matrix를 parameter로 전달
}

function calculate(cx, cy, r, x1, y1, x2, y2) {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let a = dx * dx + dy * dy;
    let b = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
    let c = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) - r * r;

    let discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
        return [];
    }

    let sqrtD = Math.sqrt(discriminant);
    let t1 = (-b - sqrtD) / (2 * a);
    let t2 = (-b + sqrtD) / (2 * a);

    let intersections = [];
    
    if (0 <= t1 && t1 <= 1) {
        intersections.push([x1 + t1 * dx, y1 + t1 * dy]);
    }
    if (0 <= t2 && t2 <= 1) {
        intersections.push([x1 + t2 * dx, y1 + t2 * dy]);
    }

    return intersections;

}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    shader = new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

async function main() {
    try {
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
            return false; 
        }

        // 셰이더 초기화
        await initShader();
        
        // 나머지 초기화
        setupBuffers();
        shader.use();
        
        // 마우스 이벤트 설정
        setupMouseEvents();
        
        // 초기 렌더링
        render();

        return true;
        
    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}
