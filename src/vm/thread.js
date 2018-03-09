VmError = require('../runtime/errors').VmError;
VmTimeoutError = require('../runtime/errors').VmTimeoutError;

isArray = require('../runtime/util').isArray;

class Fiber{
	constructor(realm, timeout = -1){
		this.realm = realm;
		this.timeout = timeout;
		this.maxDepth = 1000;
		this.maxTraceDepth = 50;
		this.callStack = [];
		this.evalStack = null;
		this.depth = -1;
		this.yielded = this.rv = undefined;
		this.paused = false;
		// fiber-specific registers
		// temporary registers
		this.r1 = this.r2 = this.r3 = null;
		// expression register(last evaluated expression statement)
		this.rexp = null;
	};
	
	run (){
		var frame = this.callStack[this.depth];
		var err = frame.error
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
				this.rv = undefined;
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
	
	unwind (err){
		// unwind the call stack searching for a guard
		var frame = this.callStack[this.depth];
		while(frame){
			// ensure the error is set on the current frame
			frame.error = err
			// ip is always pointing to the next instruction, so subtract one
			ip = frame.ip - 1;
			if(len = frame.guards.length){
				guard = frame.guards[len - 1];
				if(guard.start <= ip && ip <= guard.end){
					if(guard.handler != null){
						// try/catch
						if(ip <= guard.handler){
							// thrown inside the guarded region
							frame.evalStack.push(err);
							frame.error = null;
							frame.ip = guard.handler;
						} else {
							// thrown outside the guarded region (eg: catch or finally block)
							if(guard.finalizer && frame.ip <= guard.finalizer){
								// there's a finally block and it was thrown inside the catch block, make sure executed
								frame.ip = guard.finalizer;
							} else {
								frame = this.popFrame();
								continue;
							}
						}
					} else {
						// try/finally
						frame.ip = guard.finalizer;
					}
					frame.paused = false;
					return frame;
				}
			}
			frame = this.popFrame();
		}
		throw err;
	};
	
	injectStackTrace (err){
		var trace = [];
		var minDepth = 0;
		if(this.depth > this.maxTraceDepth){
			minDepth = this.depth - maxTraceDepth;
		}
		var [min, max] = function(){
			return this.depth < minDepth ? [this.depth, minDepth] : [minDepth, this.depth]; 
		};
		for(var i = min; i < max; i++){
			frame = this.callStack[i];
			name = frame.script.name;
			if(name === '<anonymous>' && frame.fanme){
				name = frame.fname;
			}
			trace.push({
				at: {
					name: name,
					filename: frame.script.filename,
				},
				line: frame.line,
				column: frame.column
			});
		}
		if(err.trace){
			t = err.trace;
			// error was rethrown, inject the current trace at the end of the leaf trace
			while(isArray(t[t.length - 1])){
				t = t[t.length - 1];
			}
			t.push(trace);
		} else {
			err.trace = trace;
		}
		// show stack trace on node.js
		return err.stack = err.toString();
	};
	
	pushFrame (script, target, parent, args, self, name = '<anonymous>', construct = false){
		if(!this.checkCallStack()){
			return;
		}
		var scope = new Scope(parent, script.localNames, script.localLength);
		scope.set(0, target);
		var frame = new Frame(this, script, scope, this.realm, name, construct);
		if(self){
			frame.evalStack.push(self);
		}
		if(args){
			frame.evalStack.push(args);
		}
		this.callStack[++this.depth] = frame;
		return frame;
	};

	pushEvalFrame (frame, script){
		if(!checkCallStack()){
			return;
		}
		this.callStack[++this.depth] = new EvalFrame(frame, script);
	};

	checkCallStack (){
		if(this.depth === this.maxDepth){
			this.callStack[this.depth].error = new VmError('maximum call stack size exceeded');
			this.pause();
			return false;
		}
		return true;
	};

	popFrame (){
		var frame = this.callStack[--this.depth];
		if(frame){
			frame.paused = false;
		}
		return frame;
	};

	setReturnValue (rv){
		this.callStack[this.depth].evalStack.push(rv);
	};

	pause (){
		this.paused = this.callStack[this.depth].paused = true;
	};

	resume (timeout = -1){
		this.timeout = timeout;
		this.paused = false;
		frame = this.callStack[this.depth];
		frame.paused = this.callStack[0].evalStack;
		this.run();
		if(!this.paused){
			return this.rexp;
		}
	};

	timedOut (){
		return this.timeout === 0;
	};

	send (obj){
		return this.callStack[this.depth].evalStack.push(obj);
	};

	done (){
		return this.depth === -1;
	};
};

class EvaluationStack{
	constructor(size, fiber){
		this.fiber = fiber;
		this.array = new Array(size);
		this.idx = 0;
	};
	
	push (item){
		if(this.idx == this.array.length){
			throw new Error('maximum evaluation stack size exceeded');
		}
		return this.array[this.idx++] = item;
	};

	pop (){
		return this.array[--this.idx];
	};

	top (){
		return this.array[this.idx - 1];
	};

	len (){
		return this.idx;
	};

	clear (){
		return this.idx = 0;
	};
};

// class Frame
class Frame{
	constructor(fiber, script, scope, realm, fname, construct = false){
		this.fiber = fiber;
		this.script = script;
		this.scope = scope;
		this.realm = realm;
		this.fname = fname;
		this.construct = construct;
		this.evalStack = new EvaluationStack(script.stackSize, fiber);
		this.ip = 0;
		this.exitIp = script.instructions.length;
		this.paused = false;
		this.finalizer = null;
		this.guards = [];
		this.rv = undefined;
		this.line = this.column = -1;
	};
	
	run (){
		var instructions = this.script.instructions;
		while(this.ip != this.exitIp && !this.paused && this.fiber.timeout != 0){
			this.fiber.timeout--;
			instructions[this.ip++].exec(this, this.evalStack, this.scope, this.realm);
		}
		if(this.fiber.timeout === 0){
			this.paused = this.fiber.paused = true;
		}
		let len = this.evalStack.len()
		if(!this.paused && !this.error && len !== 0){
			// debug assertion
			throw new Error("Evaluation stack has " + len + " items after execution");
		}
	};

	done (){
		return this.ip === this.exitIp;
	};

	// later we will use these methods to notify listeners(eg: debugger)
	// about line/column changes
	setLine (){
		this.line = line;
	};

	setColumn (){
		this.column = column;
	};
};


// Eval frame is like a normal frame, except it will use the current scope/guards
class EvalFrame extends Frame{
	constructor(frame, script){
		// copy try/catch guards to the script
		for(guard in frame.script.guards){
			script.guards.push(guard);
		}
		super(this, frame.fiber, script, frame.scope, frame.realm, script.filename);
	};

	run (){
		super.run();
		// the eval function will return the expression evaluated last
		return this.fiber.rv = this.fiber.rexp;
	};
};

// class Scope
class Scope{
	constructor(parent, names, len){
		this.parent = parent;
		this.names = names;
		this.data = new Array(len);
	};
	
	get (i){
		return this.data[i];
	};

	set (i, value){
		return this.data[i] = value;
	};

	name (name){
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

	nameHash (){
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
};

// class WithScope
class WithScope{
	constructor(parent, object){
		this.parent = parent;
		this.object = object;
	};
	
	get (name){
		return this.object[name];
	};
	
	set (name, value){
		return this.object[name] = value;
	};
	
	has (name){
		return name in this.object;
	};
};

module.exports = {
		Fiber: Fiber,
		Scope: Scope,
		WithScope: WithScope,
};