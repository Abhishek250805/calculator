/**
 * AuraCalc Main Application Controller
 * Orchestrates views, theme changes, Web Audio click synthesis,
 * history tracking, SVG AST drawing, and Canvas Grapher binding.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // A. State & System Configuration
    // ----------------------------------------------------------------------
    let activeMode = 'standard-workspace';
    let soundEnabled = true;
    let standardHistory = '';
    let standardCurrent = '0';
    let isEvaluated = false;
    let history = JSON.parse(localStorage.getItem('auracalc_history')) || [];

    // Web Audio Context setup lazily
    let audioCtx = null;

    // ----------------------------------------------------------------------
    // B. Sound Synthesis (Mechanical Keyboard Clicks)
    // ----------------------------------------------------------------------
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playTactileClick() {
        if (!soundEnabled) return;
        try {
            initAudio();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            const filterNode = audioCtx.createBiquadFilter();

            osc.connect(filterNode);
            filterNode.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            // High pitch short pop sound for crisp mechanical feedback
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.04);

            filterNode.type = 'bandpass';
            filterNode.frequency.setValueAtTime(800, audioCtx.currentTime);
            filterNode.Q.setValueAtTime(3, audioCtx.currentTime);

            gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);

            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.04);
        } catch (e) {
            // Audio context failed or blocked by autoplay
        }
    }

    // ----------------------------------------------------------------------
    // C. Interface Theme & Mode Controllers
    // ----------------------------------------------------------------------
    const themeSelectors = document.querySelectorAll('.theme-selector');
    
    // Theme color presets coordinates to synchronize graph background colors
    const themeGraphColors = {
        nebula: { background: '#0f1016', gridMajor: 'rgba(255, 255, 255, 0.15)', gridMinor: 'rgba(255, 255, 255, 0.05)', axis: 'rgba(255, 255, 255, 0.4)', text: 'rgba(255, 255, 255, 0.6)', accent: '#a855f7', hoverPoint: '#06b6d4' },
        aurora: { background: '#08100e', gridMajor: 'rgba(255, 255, 255, 0.15)', gridMinor: 'rgba(255, 255, 255, 0.04)', axis: 'rgba(255, 255, 255, 0.35)', text: 'rgba(255, 255, 255, 0.55)', accent: '#10b981', hoverPoint: '#84cc16' },
        cyberpunk: { background: '#0b0c10', gridMajor: 'rgba(254, 221, 0, 0.2)', gridMinor: 'rgba(254, 221, 0, 0.05)', axis: 'rgba(254, 221, 0, 0.4)', text: 'rgba(255, 255, 255, 0.7)', accent: '#fedd00', hoverPoint: '#00f2fe' },
        sakura: { background: '#faf5f6', gridMajor: 'rgba(61, 31, 39, 0.12)', gridMinor: 'rgba(61, 31, 39, 0.03)', axis: 'rgba(61, 31, 39, 0.25)', text: 'rgba(61, 31, 39, 0.55)', accent: '#ec4899', hoverPoint: '#f43f5e' },
        polar: { background: '#f0f6fa', gridMajor: 'rgba(30, 41, 59, 0.12)', gridMinor: 'rgba(30, 41, 59, 0.03)', axis: 'rgba(30, 41, 59, 0.25)', text: 'rgba(30, 41, 59, 0.55)', accent: '#3b82f6', hoverPoint: '#06b6d4' }
    };

    themeSelectors.forEach(selector => {
        selector.addEventListener('click', () => {
            playTactileClick();
            themeSelectors.forEach(s => s.classList.remove('active'));
            selector.classList.add('active');
            
            const newTheme = selector.getAttribute('data-theme');
            document.body.setAttribute('data-theme', newTheme);

            // Re-sync Grapher colors
            if (window.grapherInst && themeGraphColors[newTheme]) {
                window.grapherInst.setTheme(themeGraphColors[newTheme]);
            }
        });
    });

    const modePills = document.querySelectorAll('.nav-pill');
    const workspaces = document.querySelectorAll('.workspace');

    modePills.forEach(pill => {
        pill.addEventListener('click', () => {
            playTactileClick();
            modePills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const targetId = pill.getAttribute('data-target');
            activeMode = targetId;

            workspaces.forEach(ws => {
                ws.classList.remove('active');
                if (ws.id === targetId) {
                    ws.classList.add('active');
                    
                    // Focus inputs or resize Canvas elements accordingly
                    if (targetId === 'studio-workspace') {
                        document.getElementById('studio-input').focus();
                        triggerASTVisualization();
                    } else if (targetId === 'grapher-workspace') {
                        document.getElementById('grapher-input').focus();
                        if (window.grapherInst) {
                            window.grapherInst.resize();
                        }
                    }
                }
            });
        });
    });

    // Sound Switch Toggle hook
    const soundSwitch = document.getElementById('sound-switch');
    soundSwitch.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        if (soundEnabled) {
            initAudio();
            playTactileClick();
        }
    });

    // ----------------------------------------------------------------------
    // D. Math Grapher Initialization
    // ----------------------------------------------------------------------
    const canvasElement = document.getElementById('graph-canvas');
    let grapher = null;

    if (canvasElement) {
        grapher = new window.AuraGrapher(canvasElement, {
            theme: themeGraphColors.nebula
        });
        window.grapherInst = grapher;

        // Auto-redraw on layout resizes
        window.addEventListener('resize', () => {
            if (activeMode === 'grapher-workspace' && grapher) {
                grapher.resize();
            }
        });
    }

    const grapherInput = document.getElementById('grapher-input');
    const grapherFeedback = document.getElementById('grapher-feedback');
    const resetViewBtn = document.getElementById('btn-reset-view');

    function updateGraphPlot() {
        const val = grapherInput.value.trim();
        if (!val) {
            grapher.setEquation('');
            grapherFeedback.textContent = 'Enter a mathematical function above';
            grapherFeedback.className = 'grapher-error-log';
            return;
        }

        try {
            // Syntactic test evaluation with x=1 to catch compile errors early
            window.AuraParser.parseAndEvaluate(val, { x: 1 });
            grapher.setEquation(val);
            grapherFeedback.textContent = 'Successfully drawn';
            grapherFeedback.className = 'grapher-error-log';
        } catch (err) {
            grapherFeedback.textContent = err.message;
            grapherFeedback.className = 'grapher-error-log error';
            grapher.setEquation(''); // Wipe out plotting on syntax break
        }
    }

    if (grapherInput) {
        grapherInput.addEventListener('input', updateGraphPlot);
        // Draw initial setup
        updateGraphPlot();
    }

    if (resetViewBtn && grapher) {
        resetViewBtn.addEventListener('click', () => {
            playTactileClick();
            grapher.resetView();
        });
    }

    // Preset Chip Event binders
    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            playTactileClick();
            presetChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');

            const equation = chip.getAttribute('data-equation');
            grapherInput.value = equation;
            updateGraphPlot();
        });
    });


    // ----------------------------------------------------------------------
    // E. Dynamic SVG AST Visualization Drawer
    // ----------------------------------------------------------------------
    const astSvg = document.getElementById('ast-svg');
    const astEmpty = document.getElementById('ast-empty');

    function drawASTNode(svg, x, y, label, isLeaf = false) {
        // Create circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', 18);
        circle.setAttribute('class', `ast-node-circle ${isLeaf ? 'leaf' : ''}`);
        svg.appendChild(circle);

        // Create text
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('class', 'ast-node-text');
        text.textContent = label;
        svg.appendChild(text);
    }

    function drawASTLink(svg, x1, y1, x2, y2) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // Elegant bezier curve vertical connector
        const dy = Math.abs(y2 - y1);
        const d = `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.4}, ${x2} ${y2 - dy * 0.4}, ${x2} ${y2}`;
        path.setAttribute('d', d);
        path.setAttribute('class', 'ast-node-link');
        svg.appendChild(path);
    }

    function getASTNodeLabel(node) {
        switch (node.type) {
            case 'number':
                // Shorten float displaying
                return Number.isInteger(node.value) ? node.value.toString() : node.value.toFixed(2);
            case 'constant':
                return node.name;
            case 'variable':
                return node.name;
            case 'unary':
                return node.operator + 'u'; // unary indicator
            case 'binary':
                return node.operator;
            case 'function':
                return node.name;
            default:
                return '?';
        }
    }

    function layoutAST(node, depth = 0, x = 0, width = 800, yStart = 45, ySpacing = 70) {
        if (!node) return null;

        const y = yStart + depth * ySpacing;
        const layoutNode = {
            node: node,
            x: x,
            y: y,
            children: []
        };

        if (node.type === 'binary') {
            const leftWidth = width / 2;
            const rightWidth = width / 2;
            layoutNode.children.push(layoutAST(node.left, depth + 1, x - leftWidth / 2, leftWidth, yStart, ySpacing));
            layoutNode.children.push(layoutAST(node.right, depth + 1, x + rightWidth / 2, rightWidth, yStart, ySpacing));
        } else if (node.type === 'unary') {
            layoutNode.children.push(layoutAST(node.argument, depth + 1, x, width, yStart, ySpacing));
        } else if (node.type === 'function') {
            layoutNode.children.push(layoutAST(node.argument, depth + 1, x, width, yStart, ySpacing));
        }

        return layoutNode;
    }

    function renderASTTreeLayout(svg, layoutNode) {
        if (!layoutNode) return;

        // Render connection lines first (drawn underneath)
        layoutNode.children.forEach(child => {
            if (child) {
                drawASTLink(svg, layoutNode.x, layoutNode.y, child.x, child.y);
                renderASTTreeLayout(svg, child);
            }
        });

        // Render actual nodes above lines
        const isLeaf = layoutNode.children.length === 0;
        const label = getASTNodeLabel(layoutNode.node);
        drawASTNode(svg, layoutNode.x, layoutNode.y, label, isLeaf);
    }

    function renderSVGTree(ast) {
        // Clear SVG
        astSvg.innerHTML = '';
        if (!ast) {
            astEmpty.style.display = 'block';
            return;
        }
        astEmpty.style.display = 'none';

        // Calculate size dynamically
        const rect = astSvg.getBoundingClientRect();
        const svgW = rect.width || 800;
        
        // Walk layout tree
        const rootLayout = layoutAST(ast, 0, svgW / 2, svgW * 0.8, 45, 68);

        // Render
        renderASTTreeLayout(astSvg, rootLayout);
    }

    // ----------------------------------------------------------------------
    // F. Expression Studio Work
    // ----------------------------------------------------------------------
    const studioInput = document.getElementById('studio-input');
    const btnStudioEval = document.getElementById('btn-studio-eval');
    const studioFeedback = document.getElementById('studio-feedback');

    function triggerASTVisualization() {
        const val = studioInput.value.trim();
        if (!val) {
            renderSVGTree(null);
            studioFeedback.textContent = 'Ready';
            studioFeedback.className = 'studio-feedback-bar';
            return;
        }

        try {
            const ast = window.AuraParser.getAST(val);
            renderSVGTree(ast);
            
            // Check parsing evaluation correctness
            const testResult = window.AuraParser.evaluateAST(ast);
            studioFeedback.textContent = `Valid algebraic equation. Evaluates to: ${testResult}`;
            studioFeedback.className = 'studio-feedback-bar success';
        } catch (err) {
            // Render syntax trees partial/nothing
            renderSVGTree(null);
            studioFeedback.textContent = `Syntax Error: ${err.message}`;
            studioFeedback.className = 'studio-feedback-bar error';
        }
    }

    function evaluateStudioInput() {
        const val = studioInput.value.trim();
        if (!val) return;

        playTactileClick();
        try {
            const res = window.AuraParser.parseAndEvaluate(val);
            studioFeedback.textContent = `Result: ${res}`;
            studioFeedback.className = 'studio-feedback-bar success';
            
            // Add item to persistent calculation history
            addHistoryItem('Studio', val, res);
        } catch (err) {
            studioFeedback.textContent = `Evaluation failed: ${err.message}`;
            studioFeedback.className = 'studio-feedback-bar error';
        }
    }

    if (studioInput) {
        studioInput.addEventListener('input', triggerASTVisualization);
        studioInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                evaluateStudioInput();
            }
        });
    }

    if (btnStudioEval) {
        btnStudioEval.addEventListener('click', evaluateStudioInput);
    }


    // ----------------------------------------------------------------------
    // G. Standard Pad Calculator Logic
    // ----------------------------------------------------------------------
    const stdHistoryDisplay = document.getElementById('std-display-history');
    const stdCurrentDisplay = document.getElementById('std-display-current');

    function updateStandardUI() {
        stdHistoryDisplay.textContent = standardHistory;
        stdCurrentDisplay.textContent = standardCurrent;
        
        // Auto scroll standard display fields horizontally to the right
        stdHistoryDisplay.scrollLeft = stdHistoryDisplay.scrollWidth;
        stdCurrentDisplay.scrollLeft = stdCurrentDisplay.scrollWidth;
    }

    function handleStandardBtnPress(action, val) {
        playTactileClick();

        if (action === 'clear') {
            standardHistory = '';
            standardCurrent = '0';
            isEvaluated = false;
        } else if (action === 'backspace') {
            if (isEvaluated) {
                standardHistory = '';
            } else if (standardCurrent.length > 1) {
                standardCurrent = standardCurrent.slice(0, -1);
            } else {
                standardCurrent = '0';
            }
        } else if (action === 'equal') {
            const fullExpr = (standardHistory + standardCurrent)
                .replace(/×/g, '*')
                .replace(/÷/g, '/');

            if (!fullExpr) return;

            try {
                const res = window.AuraParser.parseAndEvaluate(fullExpr);
                standardHistory = `${standardHistory}${standardCurrent} =`;
                standardCurrent = res.toString();
                isEvaluated = true;

                addHistoryItem('Standard', fullExpr, res);
            } catch (err) {
                standardCurrent = 'Error';
                isEvaluated = true;
            }
        } else {
            // Numbers & Operators input values
            const isOperator = ['+', '-', '*', '/', '^'].includes(val);

            if (isOperator) {
                // Formatting symbol display representation
                let symbol = val;
                if (val === '*') symbol = '×';
                if (val === '/') symbol = '÷';

                if (isEvaluated) {
                    standardHistory = `${standardCurrent} ${symbol} `;
                    standardCurrent = '0';
                    isEvaluated = false;
                } else {
                    standardHistory += `${standardCurrent} ${symbol} `;
                    standardCurrent = '0';
                }
            } else {
                // Digit / decimal additions
                if (isEvaluated) {
                    standardCurrent = val === '.' ? '0.' : val;
                    standardHistory = '';
                    isEvaluated = false;
                } else {
                    if (standardCurrent === '0' && val !== '.') {
                        standardCurrent = val;
                    } else {
                        // Avoid double dots in current float
                        if (val === '.' && standardCurrent.includes('.')) return;
                        standardCurrent += val;
                    }
                }
            }
        }

        updateStandardUI();
    }

    // Attach click events to all digital standard keypad buttons
    const calcBtns = document.querySelectorAll('.calc-btn');
    calcBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const val = btn.getAttribute('data-value');
            handleStandardBtnPress(action, val);
        });
    });


    // ----------------------------------------------------------------------
    // H. History Tape Memory Pipeline
    // ----------------------------------------------------------------------
    const historyLogContainer = document.getElementById('history-log');
    const clearHistoryBtn = document.getElementById('clear-history');

    function renderHistoryList() {
        if (!historyLogContainer) return;
        
        if (history.length === 0) {
            historyLogContainer.innerHTML = `<div class="history-empty-state">No equations in memory</div>`;
            return;
        }

        historyLogContainer.innerHTML = '';
        history.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.innerHTML = `
                <span class="history-card-label">${item.label}</span>
                <span class="history-card-expr">${item.expr}</span>
                <span class="history-card-res">${item.res}</span>
            `;

            // Recall history formula to active panel workspace on clicking
            card.addEventListener('click', () => {
                playTactileClick();
                recallHistoryItem(item.expr);
            });

            historyLogContainer.appendChild(card);
        });
    }

    function addHistoryItem(modeLabel, expression, result) {
        // Prevent duplicating sequential equations
        if (history.length > 0 && history[0].expr === expression) return;

        const roundedResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));

        history.unshift({
            label: modeLabel,
            expr: expression,
            res: roundedResult
        });

        // Retain only latest 25 formulas in standard buffer
        if (history.length > 25) {
            history.pop();
        }

        localStorage.setItem('auracalc_history', JSON.stringify(history));
        renderHistoryList();
    }

    function recallHistoryItem(expr) {
        if (activeMode === 'standard-workspace') {
            // Clean operations
            standardHistory = '';
            standardCurrent = expr.replace(/\*/g, '×').replace(/\//g, '÷');
            isEvaluated = false;
            updateStandardUI();
        } else if (activeMode === 'studio-workspace') {
            studioInput.value = expr;
            triggerASTVisualization();
        } else if (activeMode === 'grapher-workspace') {
            grapherInput.value = expr;
            updateGraphPlot();
        }
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            playTactileClick();
            history = [];
            localStorage.removeItem('auracalc_history');
            renderHistoryList();
        });
    }

    // Load history tape initially
    renderHistoryList();


    // ----------------------------------------------------------------------
    // I. Comprehensive Desktop Keyboard Hook Events
    // ----------------------------------------------------------------------
    const keystrokeOverlay = document.getElementById('keystroke-indicator');
    let overlayTimeout = null;

    function showKeystrokeOverlay(text) {
        if (!keystrokeOverlay) return;
        keystrokeOverlay.textContent = text;
        keystrokeOverlay.classList.add('visible');

        clearTimeout(overlayTimeout);
        overlayTimeout = setTimeout(() => {
            keystrokeOverlay.classList.remove('visible');
        }, 1200);
    }

    window.addEventListener('keydown', (e) => {
        // Bypass global keystroke capture if typing inside regular Text input consoles
        const isTextInput = ['studio-input', 'grapher-input'].includes(document.activeElement.id);
        
        // Define targets specifically for virtual pad simulation
        let virtualKeyId = null;
        let actionVal = null;
        let actionName = null;

        const key = e.key;

        // Parse corresponding virtual targets
        if (key >= '0' && key <= '9') {
            virtualKeyId = `key-${key}`;
            actionVal = key;
        } else if (key === '.') {
            virtualKeyId = 'key-dot';
            actionVal = '.';
        } else if (key === '+') {
            virtualKeyId = 'key-plus';
            actionVal = '+';
        } else if (key === '-') {
            virtualKeyId = 'key-minus';
            actionVal = '-';
        } else if (key === '*') {
            virtualKeyId = 'key-mul';
            actionVal = '*';
        } else if (key === '/') {
            // Prevent default browser search trigger with "/" key
            e.preventDefault();
            virtualKeyId = 'key-div';
            actionVal = '/';
        } else if (key === '^') {
            virtualKeyId = 'key-pow';
            actionVal = '^';
        } else if (key === 'Enter' || key === '=') {
            virtualKeyId = 'key-equal';
            actionName = 'equal';
        } else if (key === 'Backspace') {
            virtualKeyId = 'key-backspace';
            actionName = 'backspace';
        } else if (key === 'Escape') {
            virtualKeyId = 'key-ac';
            actionName = 'clear';
        }

        // Trigger on-screen simulated active pressing depths & actions
        if (virtualKeyId) {
            const btnEl = document.getElementById(virtualKeyId);
            if (btnEl) {
                btnEl.classList.add('simulated-active');
                setTimeout(() => btnEl.classList.remove('simulated-active'), 80);
            }

            // Only inject calculations automatically in Standard mode, otherwise let manual input control
            if (!isTextInput && activeMode === 'standard-workspace') {
                handleStandardBtnPress(actionName, actionVal);
            } else {
                playTactileClick(); // Still play crisp click feedback for standard visual buttons mapping
            }

            // Show HUD indicator
            showKeystrokeOverlay(`KEY: ${key.toUpperCase()}`);
        }
    });

    // ----------------------------------------------------------------------
    // J. Mobile Responsive Slide-out Sidebar Drawer Controls
    // ----------------------------------------------------------------------
    const menuToggleBtn = document.getElementById('menu-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarPanel = document.querySelector('.sidebar-panel');
    const navPillBtns = document.querySelectorAll('.nav-pill');

    function toggleMobileMenu() {
        if (sidebarPanel && sidebarOverlay) {
            sidebarPanel.classList.toggle('open');
            sidebarOverlay.classList.toggle('open');
        }
    }

    function closeMobileMenu() {
        if (sidebarPanel && sidebarOverlay) {
            sidebarPanel.classList.remove('open');
            sidebarOverlay.classList.remove('open');
        }
    }

    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', () => {
            playTactileClick();
            toggleMobileMenu();
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            playTactileClick();
            closeMobileMenu();
        });
    }

    // Auto-close slide drawer on selecting any mode
    navPillBtns.forEach(pill => {
        pill.addEventListener('click', closeMobileMenu);
    });
});
