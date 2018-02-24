VmError = require('../runtime/errors').VmError;
VmTimeoutError = require('../runtime/errors').VmTimeoutError;

isArray = require('../runtime/util').isArray;

function Fiber(realm, timeout = -1){
	this.realm = realm;
	this.timeout = timeout;
	this.maxDepth = 1000;
	this.maxTraceDepth = 50;
	this.callStack = [];
	this.evalStack = null;
	this.depth = -1;
	this.yielded = this.rv = void 0;
	this.paused = false;
	// fiber-specific registers
	// temporary registers
	this.r1 = this.r2 = this.r3 = null;
	// expression register(last evaluated expression statement)
	this.rexp = null;
};

Fiber.prototype.run = function(){
	frame = this.callStack[this.depth];
	err = frame.error
	while(this.depth >= 0 && frame && !this.paused){
		if(err){
			frame = this.unwind(err);
		}
		frame.run();
		if((err = frame.error) instanceof VmError){
			this.injectStackTrace(err);
		}
		if(frame.done()){
			if(frame.guards.length){
				guard = frame.guards.pop();
				if(guard.finalizer){
					// we returned in the middle of a 'try' statement.
					// if there's a finalizer, it be executed before returning
					frame.ip = guard.finalizer;
					frame.exitIp = guard.end;
					frame.paused = false;
					continue;
				}
			}
		} else {
			// possibly a function call, ensure 'frame' is pointing to the top
			frame = this.callStack[this.depth];
			err = frame.error;
			continue;
		}
		// function returned, check if this was a constructor invocation and act accordingly
		if(frame.construct){
			// not in ['object', 'function']
			if(!((typeof this.rv) in ['object', 'function'])){
				this.rv = frame.scope.get(0); //return this
			}
		}
		frame = this.popFrame();
		if(frame && !err){
			// set the return value
			frame.evalStack.push(this.rv);
			this.rv = void 0;
		}
	}
	if(this.timedOut()){
		err = new VmTimeoutError(this);
		this.injectStackTrace(err);
	}
	if(err){
		throw err;
	}
};







function Frame(fiber, script, scope, realm, fname, construct = false){
	this.fiber = fiber;
	this.script = script;
	this.scope = scope;
	this.realm = realm;
	this.fname = name;
	this.construct = construct;
	this.evalStack = new EvaluationStack(this.script.stackSize, this.fiber);
	this.ip = 0;
	this.exitIp = this.script.instructions.length;
	this.paused = false;
	this.finalizer = null;
	this.guards = [];
	this.rv = void 0;
	this.line = this.column = -1;
};

Frame.prototype.run = function(){
	instructions = this.script.instructions;
	while(this.ip != this.exitIp && !this.paused && this.fiber.timeout != 0){
		this.fiber.timeout--;
		instructions[this.ip++].exec(this, this.evalStack, this.scope, this.realm);
	}
	if(this.fiber.timeout === 0){
		this.paused = this.fiber.paused = true;
	}
	if(!this.paused && !this.error && (len = this.evalStack.len()) !== 0){
		// debug assertion
		throw new Error("Evaluation stack has " + len + " items after execution");
	}
};

Frame.prototype.done = function(){
	return this.ip === this.exitIp;
};

// later we will use these methods to notify listeners(eg: debugger)
// about line/column changes
Frame.prototype.setLine = function(){
	this.line = line;
};

Frame.prototype.setColumn = function(){
	this.column = column;
};

// Eval frame is like a normal frame, except it will use the current scope/guards
function EvalFrame(frame, script){
	// copy try/catch guards to the script
	for(guard in frame.script.guards){
		script.guards.push(guard);
	}
	Frame.call(this, frame.fiber, script, frame.scope, frame.realm, script.filename);
};

EvalFrame.prototype = new Frame();
EvalFrame.prototype.constrctor = Frame;

EvalFrame.prototype.run = function(){
	Frame.prototype.run();
	// the eval function will return the expression evaluated last
	return this.fiber.rv = this.fiber.rexp;
};

function EvaluationStack(size, fiber){
	this.fiber = fiber;
	this.array = new Array(size);
	this.idx = 0;
};

EvaluationStack.prototype.push = function(item){
	if(this.idx == this.array.length){
		throw new Error('maximum evaluation stack size exceeded');
	}
	return this.array[this.idx++] = item;
};

EvaluationStack.prototype.pop = function(){
	return this.array[--this.idx];
};

EvaluationStack.prototype.top = function(){
	return this.array[this.idx - 1];
};

EvaluationStack.prototype.len = function(){
	return this.idx;
};

EvaluationStack.prototype.clear = function(){
	return this.idx = 0;
};

function Scope(parent, names, len){
	this.parent = parent;
	this.names = names;
	this.data = new Array(len);
};

Scope.prototype.get = function(i){
	return this.data[i];
};

Scope.prototype.set = function(i, value){
	return this.data[i] = value;
};

Scope.prototype.name = function(name){
	for(key in this.names){
		if(!hasProp.call(this.names, key)){
			continue;
		}
		if(this.names[key] === name){
			return parseInt(key);
		}
	}
	return -1;
};

Scope.prototype.nameHash = function(){
	rv = {};
	for(key in this.names){
		value = this.names[key];
		if(typeof value === 'string'){
			rv[value] = parseInt(key); 
		}
	}
	rv['this'] = 0;
	rv['arguments'] = 1;
	return rv;
};

function WithScope(parent, object){
	this.parent = parent;
	this.object = object;
};

WithScope.prototype.get = function(name){
	return this.object[name];
};

WithScope.prototype.set = function(name, value){
	return this.object[name] = value;
};

WithScope.prototype.has(name) = function(){
	return name in this.object;
};

module.exports = Fiber;
module.exports = Scope;
module.exports = WithScope;


