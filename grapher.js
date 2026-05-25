/**
 * AuraCalc Coordinate Grapher
 * Zero external dependencies. Uses HTML5 Canvas for ultra-smooth 60fps plotting.
 * Supports panning (drag) and zooming (scroll / pinch) with dynamic axis labeling
 * and coordinate HUD tracking on hover.
 */

class AuraGrapher {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Configuration
        this.theme = options.theme || {
            background: '#12131a',
            gridMajor: 'rgba(255, 255, 255, 0.15)',
            gridMinor: 'rgba(255, 255, 255, 0.05)',
            axis: 'rgba(255, 255, 255, 0.4)',
            text: 'rgba(255, 255, 255, 0.6)',
            accent: '#00f2fe',
            hoverPoint: '#ff007f',
            font: '12px "Fira Code", monospace'
        };

        // Graph Bounds (Math units)
        this.minX = -10;
        this.maxX = 10;
        this.minY = -10;
        this.maxY = 10;

        // Interaction State
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.savedBounds = null;
        this.hoverMouse = null; // { x: px, y: py } in canvas coordinates
        
        // Active equation AST
        this.equationAST = null;
        this.equationString = '';

        // Initialize events
        this.initEvents();
        this.resize();
    }

    setTheme(newTheme) {
        this.theme = { ...this.theme, ...newTheme };
        this.draw();
    }

    setEquation(exprString) {
        this.equationString = exprString;
        try {
            this.equationAST = exprString ? window.AuraParser.getAST(exprString) : null;
        } catch (e) {
            this.equationAST = null; // Parse error, don't plot
        }
        this.draw();
    }

    resize() {
        // High DPI (Retina) support
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        this.draw();
    }

    resetView() {
        this.minX = -10;
        this.maxX = 10;
        this.minY = -10;
        this.maxY = 10;
        this.draw();
    }

    // Coordinate conversion: Math -> Canvas (Pixels)
    toCanvasCoords(mathX, mathY) {
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        const px = ((mathX - this.minX) / (this.maxX - this.minX)) * width;
        // Invert Y axis for canvas drawing
        const py = height - ((mathY - this.minY) / (this.maxY - this.minY)) * height;

        return { x: px, y: py };
    }

    // Coordinate conversion: Canvas (Pixels) -> Math
    toMathCoords(px, py) {
        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        const mathX = this.minX + (px / width) * (this.maxX - this.minX);
        const mathY = this.minY + ((height - py) / height) * (this.maxY - this.minY);

        return { x: mathX, y: mathY };
    }

    initEvents() {
        const getMousePos = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        };

        // Panning (Drag)
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            const pos = getMousePos(e);
            this.dragStart = pos;
            this.savedBounds = {
                minX: this.minX,
                maxX: this.maxX,
                minY: this.minY,
                maxY: this.maxY
            };
            this.canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const inside = (
                e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom
            );

            if (inside) {
                this.hoverMouse = getMousePos(e);
            } else if (!this.isDragging) {
                this.hoverMouse = null;
            }

            if (this.isDragging && this.savedBounds) {
                const currentPos = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                };

                const dx = currentPos.x - this.dragStart.x;
                const dy = currentPos.y - this.dragStart.y;

                const width = rect.width;
                const height = rect.height;

                const mathWidth = this.savedBounds.maxX - this.savedBounds.minX;
                const mathHeight = this.savedBounds.maxY - this.savedBounds.minY;

                const deltaX = (dx / width) * mathWidth;
                const deltaY = (dy / height) * mathHeight;

                this.minX = this.savedBounds.minX - deltaX;
                this.maxX = this.savedBounds.maxX - deltaX;
                this.minY = this.savedBounds.minY + deltaY;
                this.maxY = this.savedBounds.maxY + deltaY;

                this.draw();
            } else if (inside) {
                this.draw(); // Redraw to update hover tracker
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.style.cursor = 'grab';
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.hoverMouse = null;
            this.draw();
        });

        // Zooming (Wheel Scroll)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const mousePos = getMousePos(e);
            const mathPos = this.toMathCoords(mousePos.x, mousePos.y);

            // Determine zoom level
            const zoomIntensity = 0.15;
            const factor = e.deltaY < 0 ? (1 - zoomIntensity) : (1 + zoomIntensity);

            // Scale math ranges around mathPos (the point under the cursor)
            this.minX = mathPos.x - (mathPos.x - this.minX) * factor;
            this.maxX = mathPos.x + (this.maxX - mathPos.x) * factor;
            this.minY = mathPos.y - (mathPos.y - this.minY) * factor;
            this.maxY = mathPos.y + (this.maxY - mathPos.y) * factor;

            this.draw();
        });

        // Touch support
        let touchStartDist = 0;
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.isDragging = true;
                const touch = e.touches[0];
                const rect = this.canvas.getBoundingClientRect();
                this.dragStart = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };
                this.savedBounds = {
                    minX: this.minX,
                    maxX: this.maxX,
                    minY: this.minY,
                    maxY: this.maxY
                };
            } else if (e.touches.length === 2) {
                this.isDragging = false;
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                touchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if (this.isDragging && e.touches.length === 1 && this.savedBounds) {
                const touch = e.touches[0];
                const currentPos = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top
                };
                const dx = currentPos.x - this.dragStart.x;
                const dy = currentPos.y - this.dragStart.y;

                const mathWidth = this.savedBounds.maxX - this.savedBounds.minX;
                const mathHeight = this.savedBounds.maxY - this.savedBounds.minY;

                const deltaX = (dx / rect.width) * mathWidth;
                const deltaY = (dy / rect.height) * mathHeight;

                this.minX = this.savedBounds.minX - deltaX;
                this.maxX = this.savedBounds.maxX - deltaX;
                this.minY = this.savedBounds.minY + deltaY;
                this.maxY = this.savedBounds.maxY + deltaY;

                this.draw();
            } else if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                if (touchStartDist > 0) {
                    const factor = touchStartDist / dist;
                    // Zoom around midpoint
                    const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
                    const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
                    const mathPos = this.toMathCoords(midX, midY);

                    this.minX = mathPos.x - (mathPos.x - this.minX) * factor;
                    this.maxX = mathPos.x + (this.maxX - mathPos.x) * factor;
                    this.minY = mathPos.y - (mathPos.y - this.minY) * factor;
                    this.maxY = mathPos.y + (this.maxY - mathPos.y) * factor;

                    touchStartDist = dist;
                    this.draw();
                }
            }
        });

        this.canvas.addEventListener('touchend', () => {
            this.isDragging = false;
            touchStartDist = 0;
        });
    }

    draw() {
        const w = this.canvas.width / window.devicePixelRatio;
        const h = this.canvas.height / window.devicePixelRatio;
        const ctx = this.ctx;

        ctx.clearRect(0, 0, w, h);

        // Fill background
        ctx.fillStyle = this.theme.background;
        ctx.fillRect(0, 0, w, h);

        // Draw grids & Axes
        this.drawGrid(w, h);

        // Plot function
        if (this.equationAST) {
            this.plotFunction(w, h);
        }

        // Draw Mouse Cursor HUD tracking
        if (this.hoverMouse && this.equationAST) {
            this.drawHUD(w, h);
        }
    }

    drawGrid(w, h) {
        const ctx = this.ctx;

        const mathWidth = this.maxX - this.minX;
        const mathHeight = this.maxY - this.minY;

        // Choose appropriate step based on magnification
        const idealSteps = 10;
        const rawStep = mathWidth / idealSteps;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
        const ratio = rawStep / magnitude;

        let step;
        if (ratio < 1.5) step = 1 * magnitude;
        else if (ratio < 3.5) step = 2 * magnitude;
        else if (ratio < 7.5) step = 5 * magnitude;
        else step = 10 * magnitude;

        // Start grid lines at clean multipliers of 'step'
        const startX = Math.ceil(this.minX / step) * step;
        const startY = Math.ceil(this.minY / step) * step;

        ctx.font = this.theme.font;
        ctx.fillStyle = this.theme.text;

        // 1. Draw Grid Lines (Vertical)
        for (let x = startX; x <= this.maxX; x += step) {
            // Avoid cumulative floating errors
            const rx = parseFloat(x.toFixed(10));
            const pt = this.toCanvasCoords(rx, 0);

            // Grid Line
            ctx.strokeStyle = rx === 0 ? this.theme.axis : this.theme.gridMinor;
            ctx.lineWidth = rx === 0 ? 2 : 0.8;
            ctx.beginPath();
            ctx.moveTo(pt.x, 0);
            ctx.lineTo(pt.x, h);
            ctx.stroke();

            // X Labels (along X axis or bottom of screen if axis is out of view)
            if (rx !== 0) {
                const zeroPt = this.toCanvasCoords(0, 0);
                let labelY = zeroPt.y + 15;
                if (zeroPt.y < 0) labelY = 15;
                if (zeroPt.y > h) labelY = h - 10;

                ctx.textAlign = 'center';
                ctx.fillText(rx.toString(), pt.x, labelY);
            }
        }

        // 2. Draw Grid Lines (Horizontal)
        for (let y = startY; y <= this.maxY; y += step) {
            const ry = parseFloat(y.toFixed(10));
            const pt = this.toCanvasCoords(0, ry);

            // Grid Line
            ctx.strokeStyle = ry === 0 ? this.theme.axis : this.theme.gridMinor;
            ctx.lineWidth = ry === 0 ? 2 : 0.8;
            ctx.beginPath();
            ctx.moveTo(0, pt.y);
            ctx.lineTo(w, pt.y);
            ctx.stroke();

            // Y Labels
            if (ry !== 0) {
                const zeroPt = this.toCanvasCoords(0, 0);
                let labelX = zeroPt.x - 10;
                if (zeroPt.x < 0) labelX = 10;
                if (zeroPt.x > w) labelX = w - 10;

                ctx.textAlign = 'right';
                ctx.fillText(ry.toString(), labelX, pt.y + 4);
            }
        }

        // 3. Highlight origin label '0' specifically
        const originPt = this.toCanvasCoords(0, 0);
        if (originPt.x >= 0 && originPt.x <= w && originPt.y >= 0 && originPt.y <= h) {
            ctx.textAlign = 'right';
            ctx.fillText('0', originPt.x - 5, originPt.y + 15);
        }
    }

    plotFunction(w, h) {
        const ctx = this.ctx;

        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();

        // Sample points horizontally
        let isDrawing = false;
        const totalSamples = w;

        for (let px = 0; px <= totalSamples; px++) {
            // Convert pixel X coordinate to math units
            const mathX = this.minX + (px / w) * (this.maxX - this.minX);

            try {
                // Evaluate formula for this X
                const mathY = window.AuraParser.evaluateAST(this.equationAST, { x: mathX });

                if (isNaN(mathY) || !isFinite(mathY)) {
                    isDrawing = false;
                    continue;
                }

                const canvasPt = this.toCanvasCoords(mathX, mathY);

                // Handle offscreen clipping
                if (canvasPt.y < -1000 || canvasPt.y > h + 1000) {
                    isDrawing = false;
                    continue;
                }

                if (!isDrawing) {
                    ctx.moveTo(canvasPt.x, canvasPt.y);
                    isDrawing = true;
                } else {
                    ctx.lineTo(canvasPt.x, canvasPt.y);
                }
            } catch (err) {
                // Evaluation failure (e.g. division by zero, negative square root), break line path
                isDrawing = false;
            }
        }

        ctx.shadowBlur = 10;
        ctx.shadowColor = this.theme.accent;
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset shadow
    }

    drawHUD(w, h) {
        const ctx = this.ctx;
        const mouseXMath = this.toMathCoords(this.hoverMouse.x, this.hoverMouse.y).x;

        try {
            const mouseYMath = window.AuraParser.evaluateAST(this.equationAST, { x: mouseXMath });

            if (isNaN(mouseYMath) || !isFinite(mouseYMath)) return;

            const targetPt = this.toCanvasCoords(mouseXMath, mouseYMath);

            // 1. Draw target intersection circle on function line
            ctx.fillStyle = this.theme.hoverPoint;
            ctx.shadowBlur = 15;
            ctx.shadowColor = this.theme.hoverPoint;
            ctx.beginPath();
            ctx.arc(targetPt.x, targetPt.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Draw clean guidelines (X/Y projection dashed lines)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(targetPt.x, targetPt.y);
            ctx.lineTo(targetPt.x, this.toCanvasCoords(0, 0).y); // Project to X axis
            ctx.moveTo(targetPt.x, targetPt.y);
            ctx.lineTo(this.toCanvasCoords(0, 0).x, targetPt.y); // Project to Y axis
            ctx.stroke();
            ctx.setLineDash([]); // Restore normal lines

            // 2. Draw modern hover glassmorphic data HUD box
            const displayX = mouseXMath.toFixed(3);
            const displayY = mouseYMath.toFixed(3);

            const text = `x: ${displayX}  y: ${displayY}`;
            ctx.font = '13px "Fira Code", monospace';
            const textWidth = ctx.measureText(text).width;

            const paddingX = 12;
            const paddingY = 8;
            const boxW = textWidth + paddingX * 2;
            const boxH = 30;

            // Position HUD near the target coordinate but offset safely
            let hudX = targetPt.x + 15;
            let hudY = targetPt.y - 15 - boxH;

            // Constrain within screen boundaries
            if (hudX + boxW > w) hudX = targetPt.x - 15 - boxW;
            if (hudY < 10) hudY = targetPt.y + 15;

            // Render glassmorphic background box
            ctx.fillStyle = 'rgba(26, 28, 38, 0.85)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1.5;
            
            // Draw box path with slight rounded corners
            const radius = 6;
            ctx.beginPath();
            ctx.moveTo(hudX + radius, hudY);
            ctx.lineTo(hudX + boxW - radius, hudY);
            ctx.quadraticCurveTo(hudX + boxW, hudY, hudX + boxW, hudY + radius);
            ctx.lineTo(hudX + boxW, hudY + boxH - radius);
            ctx.quadraticCurveTo(hudX + boxW, hudY + boxH, hudX + boxW - radius, hudY + boxH);
            ctx.lineTo(hudX + radius, hudY + boxH);
            ctx.quadraticCurveTo(hudX, hudY + boxH, hudX, hudY + boxH - radius);
            ctx.lineTo(hudX, hudY + radius);
            ctx.quadraticCurveTo(hudX, hudY, hudX + radius, hudY);
            ctx.closePath();
            
            ctx.fill();
            ctx.stroke();

            // Text content inside HUD
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(text, hudX + paddingX, hudY + paddingY + 11);

        } catch (e) {
            // Do not render HUD on coordinate mapping errors
        }
    }
}

// Export for browser script usage
window.AuraGrapher = AuraGrapher;
