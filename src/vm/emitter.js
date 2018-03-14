parse =require('esprima');

Script = require('./script');
opcodes = require('./opcodes').opcodes;
Visitor = require('./../ast/visitor').Visitor;
({hasProp} = require('../runtime/util'));

// Last visitor applied in the compilation pipeline, it emit opcodes to be executed in the vm

class Emitter extends Visitor{
	constructor(scopes, filename, name, original, source){
		super();
		this.filename = filename;
		this.name = name;
		this.original = original;
		this.source = source;
		
		this.instructions = [];
		this.labels = [];
		this.scripts = [];
		this.tryStatements = [];
		this.withLevel = 0;
		// stack of scopes. Each scope maintains a name -> index association
		// where index is unique per script(function or code executing in global scope)
		this.scopes = scopes || [];
		if(scopes){
			this.scriptScope = scopes[0];
		}
		this.localNames = [];
		this.varIndex = 3;
		this.guards = [];
		this.currentLine = -1;
		this.currentColumn = -1;
		this.stringIds = {};
		this.strings = [];
		this.regexpIds = {};
		this.regexps = [];
		this.ignoreNotDefined = 0;
	}
	
	scope (name){
		let crossFunctionScope = false;
		let j = 0;
		for(i = 0; i < this.scopes.length; i++){
			let scope = this.scopes[i];
			if(hasProp(scope, name))
				return [j, scope[name]];
			// only scopes after the function scope will increase the index
			if(crossFunctionScope || scope === this.scriptScope){
				crossFunctionScope = true;
				j++;
			}
		}
		return null;
	};
	
	scopeGet (name){
		if(this.withLevel){
			this.GETW(name, this.ignoredNotDefined);
			this.ignoreNotDefined = 0;
			return;
		}
		let scope = this.scope(name);
		if(scope){
			this.ignoreNotDefined = 0;
			this.GETL.apply(this, scope);
			return;
		}
		this.GETG(name, this.ignoreNotDefined); // global object get
		this.ignoreNotDefined = 0;
		return;
	};
	
	scopeSet(name){
		if(this.withLevel)
			return this.SETW(name);
		let scope = this.scope(name);
		if(scope)
			return this.SETL.apply(this, scope);
		this.SETG(name); 	// global object set
	};
	
	enterScope(){
		if(!this.scopes.length){
			// only enter a nested scope when running global code as local variables
			// are indentified by an integer and not name
			this.ENTER_SCOPE();
		}
		this.scopes.unshift({});
	};
	
	exitScope(){
		this.scopes.shift();
		if(!this.scope.length)
			// back to global scope
			this.EXIT_SCOPE();
	};
	
	addCleanupHook(cleanup){
		// add cleanup instructions to all named labels
		for(label in this.labels){
			if(label.name){
				if(!label.cleanup){
					label.cleanup = [];
				}
				label.cleanup.push(cleanup);
			}
		}
		// also add to all enclosing try/catch/finally blocks that may exit the block
		for(tryStatement in this.tryStatements){
			tryStatement.hooks.push(cleanup);
		}
	};
	
	declareVar(name, kind){
		if(kind in ['const', 'var'])
			var scope = this.scriptScope;
		else
			var scope = this.scopes[0];
		if (scope && !scope[name]){
			this.localNames[this.varIndex] = name;
			scope[name] = this.varIndex++;
		}
		// else this is a global variable
	}
	
	declarePattern(node, kind){
		if(node.type in ['ArrayPattern', 'ArrayExpression']){
			for(el in node.elements){
				if(el)
					this.declarePattern(el, kind);
			}
		} else if (node.type in ['ObjectPattern', 'ObjectExpression']){
			for(prop in node.properties)
				this.declarePattern(prop.value, kind);
		} else if (node.type === 'Identifier')
			this.declareVar(node.name, kind);
		elsename
			throw new Error('assertion error');
	};
	
	newLabel(){
		return new Label(this);
	};
	
	label(name){
		if(!name)
			return this.labels[this.labels.length - 1];
		for(label in this.labels)
			if(label.name === name)
				return label;
		return null;
	};
	
	pushLabel(name, stmt, brk, cont){
		this.labels.push({name:name, stmt: stmt, brk: brk,cont: cont});
	};
	
	popLabel(){
		return this.labels.pop();
	};
	
	declareFunction(name, index, generator){
		this.declareVar(name);
		let scope = this.scope(name);
		if(scope)
			var opcode = new SETL(scope);
		else
			var opcode = new SETG([name]);
		// a function is declared by binding a name to the function ref
		// before other statements that are not function declarations
		let codes = [
			new FUNCTION([index, generator]),
			opcode,
			new POP()
		];
		this.instructions = codes.concat(this.instructions);
		var processedLabels = {};
		for(i = 0; i < this.instructions.length; i++){
			let code = this.instructions[i];
			// replace all GETG/GETL instructions that match the declared name on
			// a parent scope by GETL of the matched index in the local scope
			if (this.scopes.length && code instanceof GETG)
				if (code.args[0] === name)
					this.instructions[i] = new GETL(scope);
			if(code instanceof GETL){
				if(code.args[0] !== 0){
					s = this.scopes[code.args[0]];
					if(s[name] === code.args[1])
						this.instructions[i] = new GETL(scope)
				}
			}
			// update all labels offsets
			code.forEachLabel = function(l){
				if(hasProp(processedLabels, l.id))
					// the same label can be reused between instructions, this will ensure we only visit each label once
					return l;
				processedLabels[l.id] = null;
				if(l.ip == null)
					// only offset marked labels
					l.ip += 3;
				return l;
			};
		}
	};
	
	end() {
		for(i = 0; i < this.instructions.length; i++) {
			let code = this.instructions[i];
			code.forEachLabel = function(l){
				if(l.ip === null)
					throw new Error('label has not been marked');
				return l.ip;
			};
		}
		for (guard in this.guards){
			guard.start = guard.start.ip;
			if(guard.handler)
				guard.handle = guard.handler.ip;
			if(guard.finalizer)
				guard.finamenalizer = guard.finalizer.ip;
			guard.end = guard.end.ip;
		}
		// calculate the maximum evaluation stack size
		// at least 2 stack size is needed for the arguments object
		// and the self function reference
		let current = 2, max = 2;
		for(let i = 0; i < this.instructions.length; i++) {
			let code = this.instructions[i];
			current += code.calculateFactor();
			max = Math.max(current, max);
		}
		let localLength = 0;
		for(k in this.localNames)
			localLength++;
		// compile all functions
		for (i = 0; i < this.scripts.length; i++)
			this.scripts[i] = this.scripts[i]();
		return new Script(this.filename, this.name, this.instructions, this.scripts, this.localNames, localLength, this.guards, max, this.string, this.regexps, this.source);
	};
	
	visit(node){
		if(node == null)
			// eg: the 'alternate' block of an if statement
			return;
		if(node.loc){
			let line = 0, column = 0;
			({line, column} = node.loc.start);
			if(line !== this.currentLine){
				let idx = this.instructions.length - 1;
				while(this.instructions[idx] instanceof opcodes.LINE || this.instructions[idx] instanceof opcodes.COLUMN){
					this.instructions.pop();
					idx--;
				}
				this.LINE(line);
				this.currentLine = line;
			} else if (column !== this.currentColumn){
				let idx = this.instructions.length - 1;
				while(this.instructions[idx] instanceof opcodes.COLUMN){
					this.instructions.pop();
					idx--;
				}
				this.COLUMN(column);
				this.currentColumn = column;
			}
		}
		return super.visit(node);
	};
	
	BlockStatement(node){
		this.enterScope();
		if(node.blockInit)
			node.blockInit();
		this.visit(node.body)
		if(node.blockCleanup)
			node.blockCleanup();
		this.exitScope();
		return node;
	};
	
	VmLoop(node, emitInit, emitBeforeTest, emitUpdate, emitAfterTest){
		blockInit = () => {
			if(emitInit)
				emitInit(brk);
			if(emitUpdate)
				start.mark();
			else
				cont.mark();
			if(emitBeforeTest){
				emitBeforeTest();
				this.JMPF(brk);
			}
		};
		
		blockCleanup = () => {
			if(emitUpdate){
				cont.mark();
				emitUpdate(brk);
				this.POP();
				this.JMP(start);
			}
			if(emitAfterTest){
				emitAfterTest();
				this.JMPF(brk);
			}
			this.JMP(cont);
		};
		
		currentLabel = this.label();
		start = this.newLabel();
		cont = this.newLabel();
		brk = this.newLabel();
		
		if(currentLabel != null && currentLabel.stmt === node)
			// adjust current label 'cont' so 'continue label' will work
			currentLabel.cont = cont;
		this.pushLabel(null, node, brk, cont);
		if(node.body.type === 'BlockStatement'){
			node.body.blockInit = blockInit;
			node.body.blockCleanup = blockCleanup;
			this.visit(node.body);
		}else {
			this.enterScope();
			blockInit();
			this.visit(node.body);
			blockCleanup();
			this.exitScope();
		}
		brk.mark();
		this.popLabel();
		return node;
	};
	
	VmIteratorLoop(node, pushIterator){
		labelCleanup = (label, isBreak) => {
			if(!label || label.stmt !== node || isBreak)
				this.POP();
		};
		
		emitInit = (brk) => {
			if(node.left.type === 'VariableDeclaration')
				this.visit(node.left);
			this.visit(node.right);
			pushIterator();
			emitUpdate(brk);
			this.POP();
		};
		
		emitUpdate = (brk) => {
			this.DUP();
			this.NEXT(brk);
			this.visit(assignNext())	// assign next to the iteration variable
		};
		
		assignNext = () => {
			return {
				loc: node.left.loc,
				type: 'AssignmentExpression',
				operator: '=',
				left: assignTarget
			};
		};
		
		this.addCleanupHook(labelCleanup);
		assignTarget = node.left;
		if(assignTarget.type == 'VariableDeclaration')
			assignTarget = node.left.declarations[0].id;
		this.VmLoop(node, emitInit, null, emitUpdate);
		this.POP();
		return node;
	};
	
	WhileStatement(node) {
		emitBeforeTest = () => {
			this.visit(node.test);
		};
		
		this.VmLoop(node, null, emitBeforeTest);
		return node;
	};
	
	DoWhileStatement(node) {
		emitAfterTest = () => {
			this.visit(node.test);
		};
		
		this.VmLoop(node, null, null, null, emitAfterTest);
		return node;
	};
	
	ForStatement(node){
		emitInit = () => {
			this.visit(node.init);
			if(node.init.type !== 'VariableDeclaration')
				this.POP();
		};
		
		emitBeforeTest = () => {
			this.visit(node.test);
		};
		
		emitUpdate = () => {
			this.visit(node.update);
		};
		
		this.VmLoop(node, emitInit, emitBeforeTest, emitUpdate);
		return node;
	};
	
	ForInStatement(node) {
		pushIniterator = () => {
			this.ENUMERATE();
		};
		
		this.VmIteratorLoop(node, pushIterator);
		return node;
	};
	
	ForOfStatement(node) {
		pushIterator = () => {
			this.ITER();
		};
		
		this.VmIteratorLoop(node, pushIterator);
		return node;
	};
	
	ExpressionStatement(node) {
		super.ExpressionStatement(node);
		// remove the expression value from the stack and save it
		this.SREXP();
		return node;
	};
	
	IfStatement(node){
		ifTrue = this.newLabel();
		end = this.newLabel();
		this.visit(node.test);
		this.JMPT(ifTrue);
		this.JMP(end);
		ifTrue.mark();
		this.visit(node.consequent);
		end.mark();
		return node;
	};
	
	LabeledStatement(node) {
		brk = this.newLabel();
		this.pushLabel(node.label.name, node.body, brk);
		this.visit(node.body);
		brk.mark();
		this.popLabel();
		return node;
	};
	
	BreakStatement(node) {
		if(node.label){
			label = this.label(node.label.name);
			if(label.cleanup)
				for(cleanup in label.cleanup)
					cleanup(label, true);
		} else
			var label = this.label();
		this.JMP(label.brk);
		return node;
	};
	
	ContinueStatement(node) {
		if(node.label){
			label = this.label(node.label.name);
			if(label.cleanup)
				for(cleanup in label.cleanup)
					cleanup(label, false);
		} else
			var label = this.label();
		this.JMP(label.cont);
		return node;
	};
	
	WithStatement(node) {
		this.visit(node.object);
		this.ENTER_WITH();
		this.withLevel++;
		this.visit(node.body);
		this.withLevel--
		this.EXIT_SCOPE();
		return node;
	};
	
	SwitchStatement(node){
		brk = this.newLabel();
		this.pushLabel(null, node, brk);
		this.addCleanupHook( ( () => {this.POP(); this.exitScope();}));
		this.enterScope();
		this.visit(node.discriminant);
		nextBlock = this.newLabel();
		for(clause in node.cases){
			nextTest = this.newLabel();
			if(clause.test){
				this.DUP;name
				this.visit(clause.test);
				this.CID();
				this.JMPF(nextTest);
				this.JMP(nextBlock);
			}
			if(clause.consequent.length){
				nextBlock.mark();
				this.visit(clause.consequent);
				nextBlock = this.newLabel();
				this.JMP(nextBlock);	// fall to the next block
			}
			nextTest.mark();
		}
		nextBlock.mark();
		this.popLabel();
		brk.mark();
		this.exitScope()
		return node;
	};
	
	ReturnStatement(node){
		// for hook in this.returnHooks
		//  hook();
		if(node.argument){
			this.visit(node.argument);
			this.RETV();
		}
		else
			this.RET();
		return node;
	};
	
	ThrowStatement(node){
		super.ThrowStatement(node);
		this.THROW();
		return node;
	};
	
	TryStatement(node){
		if(node.handlers.length > 1)
			throw new Error('assert error');
		this.tryStatement.push({hooks: []});
		start = this.newLabel();
		handler = this.newLabel();
		finalizer = this.newLabel();
		end = this.newLabel();
		guard = {
			start: start,
			handler: (node.handlers.length? handler : null),
			finalizer: (node.finalizer? finalizer : null),
			end: end
		};
		this.guards.push(guard);
		guardId = this.guards.length - 1;
		this.ENTER_GUARD(guardId)
		start.mark()
		this.visit(node.block);
		this.JMP(finalizer);
		handler.mark();
		if(node.handler.length){
			node.handlers[0].body.blockInit = () => {
				// bind error to the declared pattern
				param = node.handlers[0].param;
				this.declarePattern(param);
				assign = {
						type: 'ExpressionStatement',
						expression: {
							loc: param.loc,
							type: 'AssignmentExpression',
							operator: '=',
							left: param
						},
				}
				this.visit(assign);
				// run cleanup hooks
				for(hook in this.typeStatements[this.tryStatements.length - 1].hooks)
					hook();
			};
			this.visit(node.handlers[0].body);
		}
		finalizer.mark();
		if(node.finalizer){
			this.visit(node.finalizer);
			if(!node.handlers.length){
				for(hook in this.typeStatements[this.tryStatements.length - 1].hooks)
					hook();
				// exit guard and pause to rethrow exception
				this.EXIT_GUARD(guardId);
				this.PAUSE();
			}
		}
		end.mark();
		this.EXIT_GUARD(guardId);
		this.tryStatements.pop();
		return node;
	};
	
	DebuggerStatement(node){
		this.DEBUG();
		return node;
	};
	
	VariableDeclaration(node){
		for(decl in node.declarations)
			decl.kind = node.kind;
		this.visit(node.declarations);
		return node;
	};
	
	VariableDeclarator(node){
		this.declarePattern(node.id, node.kind);
		if(node.init){
			assign = {
				type: 'ExpressionStatement',
				expression: {
					loc: node.loc,
					type: 'AssignmentExpression',
					operator: '=',
					left: node.id,
					right: node.init
				},
			}
			this.visit(assign);
		}
		return node;
	};
	
	ThisExpression(node){
		if(this.scopes.length)
			this.scopeGet('this');
		else
			this.GLOBAL();
		return node;
	};
	
	ArrayExpression(node){
		super.ArrayExpression(node);
		this.ARRAY_LITERAL(node.elements.length);
		return node;
	};
	
	ObjectExpression(node){
		for(property in node.properties){
			if(property.kind === 'init'){	//object literal
				this.visit(property.value);
				if(property.key.type === 'Literal')
					this.visit(property.key);
				else	// identifier. use the name to create a literal string
					this.visit({type: 'Literal', value: property.key.name});
			} else
				throw new Error("property kind " + property.kind + " not implemented");
		}
		this.OBJECT_LITERAL(node.properties.length);
		return node;
	};
	VmFunction(node){
		({
			start:{line: sline, column: scol},
			end: {line: eline, column: ecol},
		} = node.loc);
		var source = this.original.slice(sline - 1, eline);
		source[0] = source[0].slice(scol);
		source[source.length - 1] = source[source.length - 1].slice(0, ecol);
		source = source.join('\n');
		name = '<anonymous>';
		if(node.id)
			var name = node.id.name;
		// emit function code only at the end so it can access all scope
		// variables defined after it
		emit = () => {
			var initialScope = {this: 0, arguments: 1};
			if (node.id)
				// a function that has a name can reference it self
				initialScope[name] = 2;
			if (node.lexicalThis)
				delete initialScope.this;
			var fn = new Emitter([initialScope].concat(this.scopes), this.filename, name, this.original, source)
			// perform initial function call setup
			fn.FUNCTION_SETUP(node.id != null);
			var len = node.params.length;
			if(node.rest){
				// initialize rest parameter
				fn.declareVar(node.rest.name);
				var scope = fn.scope(node.rest.name);
				fn.REST(len, scope[1]);
			}
			// initialize rest parameter
			for(i = 0; i < len; i++){
				var param = node.params[i];
				var def = node.defaults[i];
				var declaration = parse("var placeholder = arguments[" + i + "] || 0;").body[0];
				var declarator = declaration.declarations[0];
				declarator.id = param;
				def ? declarator.init.right = def : declarator.init = declarator.init.left;
				fn.visit(declaration);
			}
			// emit function body
			if(node.expression){
				// arrow expression
				fn.visit(node.body);
				fn.RETV();
			} else
				fn.visit(node.body.body);
			return fn.end();
		};
		
		functionIndex = this.scripts.length;
		this.scripts.push(emit);
		if(node.isExpression)
			// push function on the stack
			this.FUNCTION(functionIndex, node.generator);
		if(node.declare)
			// declare so the function will be bound at the beginning of the context
			this.declareFunction(node.declare, functionIndex, node.generator);
		return node;
	};
	
	FunctionDeclaration(node){
		node.isExpression = false;
		node.declare = node.id.name;
		this.VmFunction(node);
		return node;
	};
	
	FunctionExpression(node){
		node.isExpression = true;
		node.declare = false;
		this.VmFunction(node);
		return node;
	};
	
	ArrowFunctionExpression(node){
		node.isExpression = true;
		node.declare = false;
		node.lexicalThis = true;
		this.VmFunction(node);
		return node;
	};
	
	SequenceExpression(node) {
		for(i = 0; i < node.expressions.length; i++){
			this.visit(nonamede.expressions[i]);
			this.POP();
		}
		this.visit(node.expressions[i]);
		return node;
	};
	
	UnaryExpression(node){
		if(node.operator === 'delete'){
			if(node.argument.type === 'MemberExpression'){
				this.visitProperty(node.argument)
				this.visit(node.argument.obj);
				DEL();
			}else if(node.argument.type === 'Identifier' && !this.scopes.length){
				// global property
				this.LITERAL(node.argument.name);
				this.GLOBAL();
				this.DEL();
			} else {
				// no-op
				this.LITERAL(false);
			}
		} else {
			if(node.operator === 'typeof' && node.argument.type === 'Identifier')
				this.ignoreNotDefined = 1;
			super.UnaryExpression(node);
			this[unaryOp[node.operator]]();
		}
		return node;
	};
	
	BinaryExpression(node){
		super.BinaryExpression(node);
		this[binaryOp[node.operator]]();
		return node;
	};
	
	LogicalExpression(node){
		var evalEnd = this.newLabel();
		this.visit(node.left);
		this.DUP();
		if(node.operator === '||')
			this.JMPT(evalEnd);
		else
			this.JMPF(evalEnd);
		this.POP();
		this.visit(node.rigth);
		evalEnd.mark();
		return node;
	};
	
	conditionalExpression(node){
		this.IfStatement(node);
		return node;
	};
	
	NewExpression(node){
		this.visit(node.arguments);	// push arguments
		this.visit(node.callee);
		this.NEW(node.arguments.length);
		return node;
	};
	
	CallExpression(node){
		var len = node.arguments.length;
		this.visit(node.arguments);	// push arguments
		if(node.callee.type === 'MemberExpression'){
			this.visit(node.callee.object);	// push target
			this.SR1();	// save target
			this.LR1();	// load target
			this.visitProperty(node.callee);	// push property
			if(node.callee.property.type === 'Identifier')
				var fname = node.callee.property.name;
			this.CALLM(len, fname);
		} else {
			this.visit(node.callee);
			if(node.callee.type === 'Identifier')
				var fname = node.callee.name;
			this.CALL(len, fname);
		}
		return node;
	};
	
	visitProperty(memberExpression){
		if(memberExpression.computed)
			this.visit(memberExpression.property);
		else if (memberExpression.property.type === 'Identifier')
			this.LITERAL(memberExpression.property.name);
		else if(memberExpression.property.type === 'Literal')
			this.LITERAL(memberExpression.property.value);
		else
			throw new Error('invalid assert');
	};
	
	MemberExpression(node){
		this.visitProperty(node);
		this.visit(node.object);
		this.GET();
		return node;
	};
	
	AssignmentExpression(node){
		if(node.right){
			if(node.right.type === 'MemberExpression' && !node.right.object){
				// destructuring pattern, need adjust the stack before getting the value
				this.visitProperty(node.right);
				this.SWAP();
				this.GET();
			} else
				this.visit(node.right);
		}
		// else, assume value is already on the stack
		if(node.left.type in ['ArrayPattern', 'ArrayExpression', 'ObjectPattern', "ObjectExpression"]){
			if(node.left.type in ['ArrayPattern', 'ArrayExpression']){
				var index = 0;
				for(element in node.left.elements){
					if (element){
						this.DUP();
						// get the nth-item from the array
						var childAssignment = {
							operator: node.operator,
							type: 'AssignmentExpression',
							left: element,
							right:{
								type: 'MemberExpression',
								// omit the object since its alreadly loaded on stack
								property: {type: 'Literal', value: index},
							},
						};
						this.visit(childAssignment);
						this.POP()
					}
					index++;
				}
			} else {
				for(property in node.left.properties){
					this.DUP();
					var source = property.key;
					var target = property.value;
					var childAssignment = {
						operator: node.operator,
						type: 'AssignmentExpression',
						left: target,
						right:{
							type: 'MemberExpression',
							computed: true,
							property: {type: 'Literal', value: source.name},
						},
					};
					this.visit(childAssignment);
					this.POP()
				}
			}
			return;
		}
		if(node.left.type === 'MemberExpression'){
			this.visitProperty(node.left);
			this.visit(node.left.object);
			this.SR2();
			this.SR1();
			if(node.operator !== '='){
				this.LR1();
				this.LR2();
				this.GET()	// get current value
				// swap new/old values
				// this.SWAP();
				// apply operator
				this[binaryOp[node.operator.slice(0, node.operator.length - 1)]]();
				this.LR1();	// load property
				this.LR2();	// load object
				this.SET();	// set
			} else {
				this.LR1();	// load property
				this.LR2();	// load object
				this.SET();
			}
		} else {
			if(node.operator !== '='){
				this.scopeGet(node.left.name);
				this.SWAP();
				// apply operator
				this[binaryOp[node.operator.slice(0, node.operator.length - 1)]]();
			}
			this.scopeSet(node.left.name);	// set value
		}
		return node;
	};
	
	UpdateExpression(node){
		if(node.argument.type === 'MemberExpression'){
			this.visitProperty(node.argument);
			this.visit(node.argument.object);
			this.SR2();
			this.SR1();
			this.LR1();
			this.LR2();
			this.GET();	// get current
			this.SR3();	// save current
			this.LR3();	// load current
			(node.operator === '++' ? this.INC() : this.DEC());	//apply operator
			this.LR1();	// load property
			this.LR2();	// load object
			this.SET();
		} else {
			this.scopeGet(node.argument.name);
			this.SR3();
			this.LR3();
			(node.operator === '++' ? this.INC() : this.DEC());
			this.scopeSet(node.argument.name);
		}
		if(!node.prefix){
			this.POP();
			this.LR3();
		}
		return node;
	};
	
	Identifier(node){
		// An identifier. Note that an identifier may be an expression or a destructuring pattern.
		this.scopeGet(node.name);
		return node;
	};
	
	Literal(node){
		var val = node.value;
		if(typeof val === 'undefined')
			this.UNDEF();
		// variable-length literals(strings and regexps) are stored in arrays and referenced by index
		else if (typeof val === 'string'){
			if(!hasProp(this.stringIds, val)){
				this.strings.push(val);
				var idx = this.strings.length - 1;
				this.stringIds[val] = idx;
			}
			idx = this.stringIds[val];
			this.STRING_LITERAL(idx);
		} else if (val instanceof RegExp) {
			id = Script.regexpToString(val);
			if(!hasProp(this.regexpIds, id)){
				this.regexps.push(val);
				idx = this.regexps.length - 1;
				this.regexpIds[id] = idx;
			}
			idx = this.regexpIds[id];
			this.REGEXP_LITERAL(idx);
		} else 
			this.LITERAL(val);
		return node;
	};
	
	YieldExpression(node){
		this.visit(node.argument);
		this.YIELD();
		return node;
	};
	
	ComprehensionExpression(node){
		// An array comprehension. The blocks array corresponds to the sequence
		// of for and for each blocks. The optional filter expression corresponds
		// to the final if clause, if present
		throw new Error('not implemented');
	};
	
	ComprehensionBlock(node){
		// A for or for each block in an array comprehension or generator expression
		throw new Error('not implemented');
	};
	
	ClassExpression(node){
		throw new Error('not implemented');
	};
	
	ClassBody(node){
		throw new Error('not implemented');
	};
	
	ClassDeclaration(node){
		throw new Error('not implemented');
	};
	ClassHeritage(node){
		throw new Error('not implemented');
	};
	
	ExportBatchSpecifier(node){
		throw new Error('not implemented');
	};
	
	ExportSpecifier(node){
		throw new Error('not implemented');
	};
	
	ExportDeclaration(node){
		throw new Error('not implemented');
	};
	
	ImportSpecifier(node){
		throw new Error('not implemented');
	};
	
	ImportDeclaration(node){
		throw new Error('not implemented');
	};
	
	MethodDefinition(node){
		throw new Error('not implemented');
	};
	
	Property(node){
		throw new Error('not implemented');
	};
	
	ModuleDeclaration(node){
		throw new Error('not implemented');
	};
	
	SpreadElement(node){
		throw new Error('not implemented');
	};
	
	TemplateElement(node){
		throw new Error('not implemented');
	};
	
	TaggedTemplateExpression(node){
		throw new Error('not implemented');
	};
	
	TemplateLiteral(node){
		throw new Error('not implemented');
	};
};

(function(){
	// create an Emitter method for each opcode
	for(i = 0; i < opcodes.length; i++){
		let opcode = opcodes[i];
		opcodes[opcode.prototype.name] = opcode;
		opcode.prototype.forEachLabel = function(cb){
			if(this.args){
				for (j = 0; j < this.args.length; j++)
					if(this.args[j] instanceof Label)
						this.args[j] = cb(this.args[j]);
			}
		};
		// also add a method for resolving label addresses
		Emitter.prototype[opcode.prototype.name] = function(...args){
			if(!args.length)
				args = null;
			this.instructions.push(new opcode(args));
			return;
		};
	}
})();

var Label = (function(){
	class Label{
		constructor(emitter){
			this.emitter = emitter;
			this.id = Label.id ++;
			this.ip = null;
		};
		
		mark(){
			this.ip = this.emitter.instructions.length;
		}
	};

	Label.id = 1;

})();

({GETL, SETL, GETG, SETG, FUNCTION, POP} = opcodes);

var unaryOp = {
	'-': 'INV',
	'!': 'LNOT',
	'~': 'NOT',
	'typeof': 'TYPEOF',
	'void': 'VOID'
};

var binaryOp = {
	'==': 'CEQ',
	'!=': 'CNEQ',
	'===': 'CID',
	'!==': 'CNID',
	'<': 'LT',
	'<=': 'LTE',
	'>': 'GT',
	'>=': 'GTE',
	'<<': 'SHL',
	'>>': 'SAR',
	'>>>': 'SHR',
	'+': 'ADD',
	'-': 'SUB',
	'*': 'MUL',
	'/': 'DIV',
	'%': 'MOD',
	'|': 'OR',
	'&': 'AND',
	'^': 'XOR',
	'in': 'IN',
	'instanceof': 'INSTANCEOF',
};

var assignOp = {
	'+=': 'ADD',
	'-=': 'SUB',
	'*=': 'MUL',
	'/=': 'DIV',
	'%=': 'MOD',
	'<<=': 'SHL',
	'>>=': 'SAR',
	'>>>=': 'SHR',
	'|=': 'OR',
	'&=': 'AND',
	'^=': 'XOR',
};

module.exports = Emitter
