/**
 * AuraCalc Math Parser & AST Compiler
 * Zero external dependencies. Extremely robust recursive-descent parser.
 * Supports numbers, operators (+, -, *, /, ^), unary operations, parentheses,
 * implicit multiplication (e.g., "2x", "5(3+4)"), constants (pi, e),
 * and standard mathematical functions.
 */

class Tokenizer {
    constructor(input) {
        this.input = input;
        this.cursor = 0;
    }

    tokenize() {
        const tokens = [];
        const n = this.input.length;

        while (this.cursor < n) {
            const char = this.input[this.cursor];

            // 1. Whitespace
            if (/\s/.test(char)) {
                this.cursor++;
                continue;
            }

            // 2. Operators & Parentheses
            if (char === '+') { tokens.push({ type: 'PLUS', value: '+' }); this.cursor++; continue; }
            if (char === '-') { tokens.push({ type: 'MINUS', value: '-' }); this.cursor++; continue; }
            if (char === '*') { tokens.push({ type: 'MUL', value: '*' }); this.cursor++; continue; }
            if (char === '/') { tokens.push({ type: 'DIV', value: '/' }); this.cursor++; continue; }
            if (char === '^') { tokens.push({ type: 'POW', value: '^' }); this.cursor++; continue; }
            if (char === '(') { tokens.push({ type: 'LPAREN', value: '(' }); this.cursor++; continue; }
            if (char === ')') { tokens.push({ type: 'RPAREN', value: ')' }); this.cursor++; continue; }
            if (char === ',') { tokens.push({ type: 'COMMA', value: ',' }); this.cursor++; continue; }

            // 3. Numbers (including decimals)
            if (/\d/.test(char) || char === '.') {
                let numStr = '';
                let hasDot = false;
                while (this.cursor < n && (/\d/.test(this.input[this.cursor]) || this.input[this.cursor] === '.')) {
                    if (this.input[this.cursor] === '.') {
                        if (hasDot) break; // Invalid float double dot
                        hasDot = true;
                    }
                    numStr += this.input[this.cursor];
                    this.cursor++;
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
                continue;
            }

            // 4. Identifiers (variables, functions, constants)
            if (/[a-zA-Z]/.test(char)) {
                let name = '';
                while (this.cursor < n && /[a-zA-Z0-9]/.test(this.input[this.cursor])) {
                    name += this.input[this.cursor];
                    this.cursor++;
                }
                tokens.push({ type: 'IDENTIFIER', value: name });
                continue;
            }

            // Unknown character
            throw new Error(`Unexpected character: '${char}' at index ${this.cursor}`);
        }

        tokens.push({ type: 'EOF', value: null });
        return tokens;
    }
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.cursor = 0;
    }

    peek() {
        return this.tokens[this.cursor];
    }

    consume(type) {
        const token = this.peek();
        if (token.type !== type) {
            throw new Error(`Expected token type ${type}, but got ${token.type} ('${token.value}')`);
        }
        this.cursor++;
        return token;
    }

    match(type) {
        const token = this.peek();
        if (token.type === type) {
            this.cursor++;
            return token;
        }
        return null;
    }

    // Expression -> Term ((PLUS | MINUS) Term)*
    parse() {
        let node = this.parseAdditive();
        if (this.peek().type !== 'EOF') {
            throw new Error(`Unexpected token: '${this.peek().value}' at the end of the expression.`);
        }
        return node;
    }

    parseAdditive() {
        let left = this.parseMultiplicative();
        while (true) {
            const plus = this.match('PLUS');
            if (plus) {
                left = { type: 'binary', operator: '+', left, right: this.parseMultiplicative() };
                continue;
            }
            const minus = this.match('MINUS');
            if (minus) {
                left = { type: 'binary', operator: '-', left, right: this.parseMultiplicative() };
                continue;
            }
            break;
        }
        return left;
    }

    // Multiplicative -> Power ((MUL | DIV) Power)*
    // We also handle implicit multiplication here if a number is followed by LPAREN or IDENTIFIER
    parseMultiplicative() {
        let left = this.parseUnary();
        while (true) {
            const mul = this.match('MUL');
            if (mul) {
                left = { type: 'binary', operator: '*', left, right: this.parseUnary() };
                continue;
            }
            const div = this.match('DIV');
            if (div) {
                left = { type: 'binary', operator: '/', left, right: this.parseUnary() };
                continue;
            }

            // Implicit Multiplication check:
            // If the next token is a LPAREN, an IDENTIFIER, or a NUMBER, and we didn't see an operator,
            // check if we should do implicit multiplication (e.g. `2x`, `2(3+4)`, `x(y)`)
            const nextToken = this.peek();
            if (
                nextToken.type === 'LPAREN' ||
                nextToken.type === 'IDENTIFIER' ||
                nextToken.type === 'NUMBER'
            ) {
                left = { type: 'binary', operator: '*', left, right: this.parseUnary() };
                continue;
            }

            break;
        }
        return left;
    }

    // Unary -> (PLUS | MINUS) Unary | Power
    parseUnary() {
        const plus = this.match('PLUS');
        if (plus) {
            return { type: 'unary', operator: '+', argument: this.parseUnary() };
        }
        const minus = this.match('MINUS');
        if (minus) {
            return { type: 'unary', operator: '-', argument: this.parseUnary() };
        }
        return this.parsePower();
    }

    // Power -> Primary (POW Unary)*
    parsePower() {
        let left = this.parsePrimary();
        while (true) {
            const pow = this.match('POW');
            if (pow) {
                left = { type: 'binary', operator: '^', left, right: this.parseUnary() };
                continue;
            }
            break;
        }
        return left;
    }

    // Primary -> NUMBER | IDENTIFIER [ ( Expression ) ] | LPAREN Expression RPAREN | Constant
    parsePrimary() {
        const token = this.peek();

        if (token.type === 'NUMBER') {
            this.consume('NUMBER');
            return { type: 'number', value: token.value };
        }

        if (token.type === 'IDENTIFIER') {
            this.consume('IDENTIFIER');
            const name = token.value.toLowerCase();

            // Check if this is a function call (followed by LPAREN)
            if (this.peek().type === 'LPAREN') {
                this.consume('LPAREN');
                const arg = this.parseAdditive();
                this.consume('RPAREN');

                const validFunctions = ['sin', 'cos', 'tan', 'sqrt', 'abs', 'log', 'ln', 'exp', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh'];
                if (validFunctions.includes(name)) {
                    return { type: 'function', name, argument: arg };
                }
                throw new Error(`Unknown mathematical function: '${name}'`);
            }

            // Check if constant
            if (name === 'pi') {
                return { type: 'constant', name: 'π', value: Math.PI };
            }
            if (name === 'e') {
                return { type: 'constant', name: 'e', value: Math.E };
            }

            // Otherwise, treat as general variable (like 'x' for graphing)
            return { type: 'variable', name: token.value };
        }

        if (token.type === 'LPAREN') {
            this.consume('LPAREN');
            const expr = this.parseAdditive();
            this.consume('RPAREN');
            return expr;
        }

        throw new Error(`Unexpected token at start of expression: '${token.value || 'EOF'}'`);
    }
}

// Math evaluation operations
const mathOps = {
    '+': (a, b) => a + b,
    '-': (a, b) => a - b,
    '*': (a, b) => a * b,
    '/': (a, b) => {
        if (b === 0) throw new Error('Division by zero error');
        return a / b;
    },
    '^': (a, b) => Math.pow(a, b)
};

const mathFuncs = {
    sin: (a) => Math.sin(a),
    cos: (a) => Math.cos(a),
    tan: (a) => Math.tan(a),
    sqrt: (a) => {
        if (a < 0) throw new Error('Negative square root error');
        return Math.sqrt(a);
    },
    abs: (a) => Math.abs(a),
    log: (a) => {
        if (a <= 0) throw new Error('Logarithm domain error (<= 0)');
        return Math.log10(a);
    },
    ln: (a) => {
        if (a <= 0) throw new Error('Logarithm domain error (<= 0)');
        return Math.log(a);
    },
    exp: (a) => Math.exp(a),
    asin: (a) => {
        if (a < -1 || a > 1) throw new Error('Arcsin domain error [-1, 1]');
        return Math.asin(a);
    },
    acos: (a) => {
        if (a < -1 || a > 1) throw new Error('Arccos domain error [-1, 1]');
        return Math.acos(a);
    },
    atan: (a) => Math.atan(a),
    sinh: (a) => Math.sinh(a),
    cosh: (a) => Math.cosh(a),
    tanh: (a) => Math.tanh(a)
};

/**
 * Evaluates the parsed AST node recursively
 * @param {object} node - AST Node
 * @param {object} variables - Values of variables (e.g. { x: 5 })
 */
function evaluateAST(node, variables = {}) {
    if (!node) return 0;

    switch (node.type) {
        case 'number':
        case 'constant':
            return node.value;

        case 'variable':
            const varName = node.name;
            if (variables[varName] !== undefined) {
                return variables[varName];
            }
            if (variables[varName.toLowerCase()] !== undefined) {
                return variables[varName.toLowerCase()];
            }
            throw new Error(`Undefined variable: '${varName}'`);

        case 'unary':
            const argVal = evaluateAST(node.argument, variables);
            if (node.operator === '-') return -argVal;
            if (node.operator === '+') return argVal;
            throw new Error(`Unknown unary operator: '${node.operator}'`);

        case 'binary':
            const leftVal = evaluateAST(node.left, variables);
            const rightVal = evaluateAST(node.right, variables);
            const op = mathOps[node.operator];
            if (op) return op(leftVal, rightVal);
            throw new Error(`Unknown binary operator: '${node.operator}'`);

        case 'function':
            const funcArgVal = evaluateAST(node.argument, variables);
            const func = mathFuncs[node.name];
            if (func) return func(funcArgVal);
            throw new Error(`Unknown function: '${node.name}'`);

        default:
            throw new Error(`Unknown AST Node Type: '${node.type}'`);
    }
}

/**
 * Main parse & evaluation entry point
 * @param {string} exprString - Mathematical equation string
 * @param {object} variables - Map of variables and values
 */
function parseAndEvaluate(exprString, variables = {}) {
    if (!exprString.trim()) return '';
    try {
        const tokenizer = new Tokenizer(exprString);
        const tokens = tokenizer.tokenize();
        const parser = new Parser(tokens);
        const ast = parser.parse();
        return evaluateAST(ast, variables);
    } catch (err) {
        throw err;
    }
}

/**
 * Returns raw AST for visualization purposes
 */
function getAST(exprString) {
    if (!exprString.trim()) return null;
    const tokenizer = new Tokenizer(exprString);
    const tokens = tokenizer.tokenize();
    const parser = new Parser(tokens);
    return parser.parse();
}

// Export for browser script usage
window.AuraParser = {
    Tokenizer,
    Parser,
    evaluateAST,
    parseAndEvaluate,
    getAST
};
