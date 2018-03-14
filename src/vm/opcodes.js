esprima = require('esprima');

Visitor = require('../ast/visitor').Visitor;
({StopIteration, ArrayIterator} = require('../runtime/builtin'));
({defProp, hasProp, create} = require('../runtime/util'));
({VmTypeError, VmEvalError, VmReferenceError} = require('../runtime/errors'));
RegExpProxy = require('../runtime/regexp_proxy');
({Fiber, Scope, WithScope} = require('./thread'));


OpcodeClassFactory = (function(){
	// opcode id, correspond to the index in the opcodes array and is used to represent serialized opcodes
	var id = 0;
	classFactory = function(name, fn, calculateFactor) {
		// generate opcode class
		// this is ugly but its the only way I found to get nice opcode
		// names when debugging with node-inspector/chrome dev tools
		OpcodeClass = (function(){
			let constructor;
			if(typeof eval !== 'function' || (typeof (constructor = eval(`(function ${name}(args){ if(args) this.args = args;})`)) !== 'function')){
				constructor = function(args){
					if(args)
						this.args = args;
					// explicitly return undefined
					return;
				};
				constructor.name = name;
			}
			constructor.prototype.id = id++;
			constructor.prototype.name = name;
			constructor.prototype.exec = fn;
			if(calculateFactor){
				constructor.prototype.calculateFactor = calculateFactor;
			} else {
				constructor.prototype.factor = calculateOpcodeFactor(fn);
				constructor.prototype.calculateFactor = function(){
					return this.factor;
				}				
			}
			return constructor;
		})()
		return OpcodeClass;
	};
	return classFactory;
})();


/*
 Each opcode has a stack depth factor which is the maximum size that the
 opcode will take the evaluation stack to, and is used later to
 determine the maximum stack size needed for running a script

 In most cases this number is static and depends only on the opcode function
 body. To avoid having to maintain the number manually, we parse the opcode
 source and count the number of pushes - pops by transversing the ast. This
 is hacky but seems to do the job
*/

class Counter extends Visitor{
	constructor(){
		super();
		this.factor = 0;
		this.current = 0;
	};
	
	CallExpression(node){
		node = super.CallExpression(node);
		if(node.callee.type === 'MemberExpression'){
			if(node.callee.property.type === 'Identifier'){
				var name = node.callee.property.name;
			} else if(node.callee.property.type === 'Literal'){
				var name = node.callee.property.value;
			} else {
				throw new Error('assert error');
			}
			if(name === 'push'){
				this.current ++;
			} else if(name === 'pop'){
				this.current --;
			}
			this.factor = Math.max(this.factor, this.current);
		}
		return node;
	};
};

calculateOpcodeFactor = function(opcodeFn){
	ast = esprima.parse("(" + opcodeFn.toString() + ")");
	counter = new Counter();
	counter.visit(ast);
	return counter.factor;
};

Op = function(name, fn, factorFn){
	return OpcodeClassFactory(name, fn, factorFn);
};

opcodes = [
	Op('POP', function(f, s, l){	// remove top
		return s.pop();
	}),
	Op('DUP', function(f, s, l){	// duplicate top
		s.push(s.top());
	}),
	Op('SWAP', function(f, s, l){	// swap top 2 value
		top = s.pop();
		bot = s.pop();
		s.push(top);
		s.push(bot);
	}),
	Op('RET', function(f, s, l){	// return from function
		ret(f);
	}),
	Op('RETV', function(f, s, l){	// return value from function
		f.fiber.rv = s.pop();
		ret(f);
	}),
	Op('PAUSE', function(f, s, l){	// pause frame
		f.paused = true;
	}),
	Op('YIELD', function(f, s, l){	// yield value from generator 
		f.fiber.yielded = s.pop();
		f.fiber.pause();
	}),
	Op('THROW', function(f, s, l){	// throw something
		throwErr(f, s.pop());
	}),
	Op('ENTER_GUARD', function(f){	// enter guarded region
		f.guards.push(f.script.guards[this.args[0]]);
	}),
	Op('EXIT_GUARD', function(f){	// exit guarded region  
		currentGuard = f.guards[f.guards.length - 1];
		specifiedGuard = f.script.guards[this.args[0]];
		if(specifiedGuard === currentGuard){
			f.guards.pop();
		}
	}),
	Op('SR1', function(f, s, l){	// save to register 1
		f.fiber.r1 = s.pop();
	}),
	Op('SR2', function(f, s, l){	// save to register 2
		f.fiber.r2 = s.pop();
	}),
	Op('SR3', function(f, s, l){	// save to register 3
		f.fiber.r3 = s.pop();
	}),
	Op('LR1', function(f, s, l){	// load from register 1
		s.push(f.fiber.r1);
	}),
	Op('LR2', function(f, s, l){	// load from register 2
		s.push(f.fiber.r2);
	}),
	Op('LR3', function(f, s, l){	// load from register 3
		s.push(f.fiber.r3);
	}),
	Op('SREXP', function(f, s, l){	// save to the expression register
		s.fiber.rexp = s.pop();
	}),
	Op('ITER', function(f, s, l){	// calls 'iterator' method
		callm(f, 0, 'iterator', s.pop());
	}),
	Op('ENUMERATE', function(f, s, l){	// push iterator that yields the object enumerable properties
		s.push(r.enumerateKeys(s.pop()));
	}),
	Op('NEXT', function(f, s, l){	// calls iterator 'next'
		callm(f, 0, 'next', s.pop());
		if(f.error instanceof StopIteration){
			f.error = null;
			f.paused = false;
			f.ip = this.args[0];
		}
	}),
	Op('FUNCTION_SETUP', 
		function(f, s, l){	// prepare the arguments object and the self reference when the function has a name
			l.set(1, s.pop());
			fn = s.pop();
			if(this.args[0])
				l.set(2, fn);
		},
		function(){	// the fiber pushing the arguments object and the self reference cancels this opcode pop call
			return 0;
	}),
	Op('GLOBAL', function(f, s, l, r){	// push the global object 
		s.push(r.global);
	}),
	Op('REST', function(f, s, l, r){	// initialize 'rest' param 
		index = this.args[0];
		varIndex = this.args[1];
		args = l.get(1);
		if(index < args.length)
			l.set(varIndex, Array.prototype.slice.call(args, index));
	}),
	Op('NEW', function(f, s, l){	// call as constructor 
		call(f, this.args[0], s.pop(), null, null, true)
	}),
	Op('CALL',
		function(f, s, l){	// call function 
			call(f, this.args[0], s.pop(), null, this.args[1]);
		},
		function(){	// pop n arguments plus function and push return value
			return 1 - (this.args[0] + 1);
	}),
	Op('CALLM', 
		function(f, s, l){	// call method 
			callm(f, this.args[0], s.pop(), null, this.args[1]);
		},
		function(){	// pop n arguments plus function plus target and push return value
			return 1 - (this.args[0] + 1 + 1);
	}),
	Op('GET', function(f, s, l, r){	// get property from object  
		obj = s.pop();
		key = s.pop();
		if(obj == null){
			return throwErr(f, new VmTypeError("Cannot read property '" + key + "' of " + obj));
		}
		s.push(r.get(obj, key));
	}),
	Op('SET', function(f, s, l, r){	// set property on object
		obj = s.pop();
		key = s.pop();
		val = s.pop();
		if(obj == null){
			return throwErr(f, new VmTypeError("Cannot set property '" + key + "' of " + obj));
		}
		s.push(r.set(obj, key, val));
	}),
	Op('DEL', function(f, s, l, r){	// del property on object
		obj = s.pop();
		key = s.pop();
		if(obj == null){
			return throwErr(f, new VmTypeErr('Cannot convert null to object'));
		}
		s.push(r.del(obj, key));
	}),
	Op('GETL', function(f, s, l){	// get local variable
		scopeIndex = this.args[0];
		varIndex = this.args[1];
		scope = l;
		while(scopeIndex--)
			scope = scope.parent;
		s.push(scope.get(varIndex));
	}),
	Op('SETL', function(f, s, l){	// set local variable
		scopeIndex = this.args[0];
		varIndex = this.args[1];
		scope = l;
		while(scopeIndex--)
			scope = scope.parent;
		s.push(scope.set(varIndex, s.pop()));
	}),
	Op('GETW', function(f, s, l, r){	// 
		key = this.args[0];
		while(l instanceof WithScope){
			if(l.has(key))
				return s.push(l.get(key));
			l = l.parent;
		}
		while(l instanceof Scope){
			idx = l.name(key);
			if(idx >= 0)
				return s.push(l.get(idx));
			l = l.parent;
		}
		if(!hasProp(r.global, key) && !this.args[1])
			return throwErr(f, new VmReferenceError(key + " is not defined"));
		s.push(r.global[key]);
	}),
	Op('SETW', function(f, s, l, r){	// 
		key = this.args[0];
		val = s.pop();
		while(l instanceof WithScope){
			if(l.has(key))
				return s.push(l.set(key, val));
			l = l.parent;
		}
		while(l instanceof Scope){
			idx = l.name(key);
			if(idx >= 0)
				return s.push(l.set(idx, val));
			l = l.parent;
		}
		s.push(r.global[key] = val);
	}),
	Op('GETG', function(f, s, l, r){	// get global variable
		if(!hasProp(r.global, this.args[0]) && !this.args[1])
			return throwErr(f, new VmReferenceError(this.args[0] + " is not defined"));
		s.push(r.global[this.args[0]]);
	}),
	Op('SETG', function(f, s, l, r){	// set global variable
		s.push(r.global[this.args[0]] = s.pop());
	}),
	Op('ENTER_SCOPE', function(f){	// enter nested scope
		f.scope = new Scope(f.scope, f.script.localNames, f.script.localLength);
	}),
	Op('EXIT_SCOPE', function(f){	// exit nested scope
		f.scope = f.scope.parent;
	}),
	Op('ENTER_WITH', function(f, s){	// enther 'whti' block
		f.scope = new WithScope(f.scope, s.pop());
	}),
	// UNARY OP
	Op('INV', function(f, s, l, r){	// invert signal
		s.push(r.inv(s.pop()));
	}),
	Op('LNOT', function(f, s, l, r){	// logical NOT
		s.push(r.lnot(s.pop()));
	}),
	Op('NOT', function(f, s, l, r){	// bitwise NOT
		s.push(r.not(s.pop()));
	}),
	Op('INC', function(f, s, l, r){	// increment
		s.push(r.inc(s.pop()));
	}),
	Op('DEC', function(f, s, l, r){	// decrement
		s.push(r.dec(s.pop()));
	}),
	// BINARY OP
	Op('ADD', function(f, s, l, r){	// sum
		s.push(r.add(s.pop(), s.pop()));
	}),
	Op('SUB', function(f, s, l, r){	// difference
		s.push(r.sub(s.pop(), s.pop()));
	}),
	Op('MUL', function(f, s, l, r){	// product
		s.push(r.mul(s.pop(), s.pop()));
	}),
	Op('DIV', function(f, s, l, r){	// division
		s.push(r.div(s.pop(), s.pop()));
	}),
	Op('MOD', function(f, s, l, r){	// modulo
		s.push(r.mod(s.pop(), s.pop()));
	}),
	Op('SHL', function(f, s, l, r){	// left shift
		s.push(r.shl(s.pop(), s.pop()));
	}),
	Op('SAR', function(f, s, l, r){	// right shift
		s.push(r.sar(s.pop(), s.pop()));
	}),
	Op('SHR', function(f, s, l, r){	// unsigned right shift
		s.push(r.shr(s.pop(), s.pop()));
	}),
	Op('OR', function(f, s, l, r){	// bitwise OR
		s.push(r.or(s.pop(), s.pop()));
	}),
	Op('AND', function(f, s, l, r){	// bitwise AND
		s.push(r.and(s.pop(), s.pop()));
	}),
	Op('XOR', function(f, s, l, r){	// bitwise XOR
		s.push(r.xor(s.pop(), s.pop()));
	}),
	Op('CEQ', function(f, s, l, r){	// equals '=='
		s.push(r.ceq(s.pop(), s.pop()));
	}),
	Op('NCEQ', function(f, s, l, r){	// not equals '!='
		s.push(r.nceq(s.pop(), s.pop()));
	}),
	Op('CID', function(f, s, l, r){	// same '==='
		s.push(r.cid(s.pop(), s.pop()));
	}),
	Op('CNID', function(f, s, l, r){	// not same '!=='
		s.push(r.cnid(s.pop(), s.pop()));
	}),
	Op('LT', function(f, s, l, r){	// less than
		s.push(r.lt(s.pop(), s.pop()));
	}),
	Op('LTE', function(f, s, l, r){	// less or equal
		s.push(r.lte(s.pop(), s.pop()));
	}),
	Op('GT', function(f, s, l, r){	// greater than
		s.push(r.gt(s.pop(), s.pop()));
	}),
	Op('GTE', function(f, s, l, r){	// greater or equal than
		s.push(r.gte(s.pop(), s.pop()));
	}),
	Op('IN', function(f, s, l, r){	// property in obj prototype chain
		s.push(r.has(s.pop(), s.pop()));
	}),
	Op('INSTANCEOF', function(f, s, l, r){	// instance of
		s.push(r.instanceOf(s.pop(), s.pop()));
	}),
	Op('TYPEOF', function(f, s, l, r){	// instance of
		s.push(typeof s.pop());
	}),
	Op('VOID', function(f, s){	// 
		s.pop();
		s.push(undefined);
	}),
	Op('JMP', function(f, s, l){	// uncondifional jump
		f.ip = this.args[0];
	}),
	Op('JMPT', function(f, s, l, r){	// jump if true
		if(s.pop())
			f.ip = this.args[0];
	}),
	Op('JMPF', function(f, s, l, r){	// jump if false
		if(!s.pop())
			f.ip = this.args[0];
	}),
	Op('UNDEF', function(f, s){	// 
		s.push(undefined);
	}),
	Op('LITERAL', function(f, s, l){	// push literal value
		s.push(this.args[0]);
	}),
	Op('STRING_LITERAL', function(f, s, l){	// push string object
		s.push(f.script.string[this.args[0]]);
	}),
	Op('REGEXP_LITERAL', function(f, s, l, r){	// push regexp object
		s.push(new RegExpProxy(f.script.regexps[this.args[0]], r));
	}),
	Op('OBJECT_LITERAL', 
		function(f, s, l, r){	// object literal
			var length = this.args[0];
			var rv = {};
			while(length--)
				r.set(rv, s.pop(), s.pop());
			s.push(rv);
		}, 
		function(){		// pops one item for each key/value and push the object
			return 1 - (this.args[0] * 2);
	}),
	Op('ARRAY_LITERAL', 
		function(f, s, l, r){	// array literal
			var length = this.args[0];
			var rv = new Array(length);
			while(length--)
				rv[length] = s.pop();
			s.push(rv);
		}, 
		function(){		// pops each element and push the array
			return 1 - this.args[0];
	}),
	Op('FUNCTION', function(f, s, l, r){	// push function reference
		// get the index of the script with function code
		scriptIndex = this.args[0];
		// create a new function, passing the current local scope
		s.push(createFunction(f.script.scripts[scriptIndex], l, r, this.args[1]));
	}),
	// debug related opcodes
	Op('LINE', function(f){	// set line number
		f.setLine(this.args[0]);
	}),
	Op('COLUMN', function(f){	// set column number
		f.setColumn(this.args[0]);
	}),
	Op('DEBUG', function(f, s, l){	// pause and notify attached debugger
		debug();
	})
];

throwErr = function(frame, err){
	frame.error = err;
	frame.paused = true;
};

// Helpers shared between some opcodes

callm = function(frame, length, key, target, name){
	({evalStack: stack, realm} = frame);
	if(target == null){
		id = 'null';
		if(target === undefined)
			id = 'undefined';
		return throwError(frame, new VmTypeError("Cannot call method '" + key + "' of " + id));
	}
	constructor = target.constructor;
	targetName = constructor.__name__ || constructor.name || 'Object';
	name = targetName + '.' + name;
	func = realm.get(target, key);
	if(func instanceof Function)
		return call(frame, length, func, target, name);
	if(func == null){
		stack.pop();	// pop target
		throwErr(frame, new VmTypeError("Object #<${targetName}> has no method '${key}'"));
	} else {
		stack.pop();	// pop target
		throwErr(frame, new VmTypeError("Property '${key}' of object #<${targetName}> is not a function"));
	}
};

call = function(frame, length, func, target, name, construct){
	if(typeof func !== 'function')
		return throwError(frame, new VmTypeError('Object is not a function'));
	({evalStack: stack, fiber, realm} = frame);		// 
	args = {length: length, callee: func};
	while(length){
		args[--length] = stack.pop();
	}
	target = target || realm.global;
	push = true;
	args = Array.prototype.slice.call(args);
	if(func in [Function, realm.eval]){
		try{
			if(func === Function)
				// dynamically create a new Function instance
				stack.push(createFunction(realm.compileFunction(args), null, realm));
			else {
				// evaluate string in the current frame
				script = realm.eval(frame, args[0]);
				frame.paused = true;
				fiber.pushEvalFrame(frame.script);
			}
		} 
		catch(e){
			throwErr(frame, new VmEvalError(e.message));
		}
		return;
	}
	if(hasProp(func, '__vmfunction__')){
		func.__callname__ = name;
		func.__fiber__ = fiber;
		func.__construct__ = construct;
		push = false;
	}
	try{
		if(construct)
			// create a native class instance
			var val = createnativeInstance(func, args);
		else
			var val = func.apply(target, args);
		if(push && !fiber.paused)
			stack.push(val);
	}
	catch(nativeError){
		throwErr(frame, nativeError);
	}
};

createGenerator = function(caller, script, scope, realm, target, args, fn, callname){
	if(caller)
		var timeout = caller.timeout;
	var fiber = new Fiber(realm, timeout);
	frame = fiber.pushFrame(script, target, scope, args, fn, callname, false);
	var newborn = true;
	
	send = function(obj){
		if(newborn && obj !== undefined)
			throw new VmTypeError('no argument must be passed when starting generator');
		if(fiber.done())
			throw new VmError('generator closed');
		frame = fiber.callStack[fiber.depth];
		if(newborn){
			newborn = false;
			fiber.run();
		} else {
			frame.evalStack.push(obj);
			fiber.resume();
		}
		if(caller)
			// transfer timeout back to the caller fiber
			caller.timeout = fiber.timeout;
		if(fiber.done()){
			rv.closed = true;
			throw new StopIteration(fiber.rv, 'generator has stopped');
		}
		return fiber.yielded;
	};
	
	thrw = function(e){
		if(newborn){
			close();
			return e;
		}
		if(fiber.done())
			throw new VmError('generator closed');
		frame = fiber.callStack[fiber.depth];
		frame.error = e;
		fiber.resume();
		if(caller)
			caller.timeout = fiber.timeout;
		if(fiber.done())
			return fiber.rv;
		return fiber.yielded;
	};
	
	close = function(){
		if(fiber.done())
			return;
		if(newborn)
			fiber.depth = -1;
		// force a return;
		frame = fiber.callStack[fiber.depth];
		frame.evalStack.clear();
		frame.ip = frame.exitIp;
		fiber.resume();
		if(caller)
			caller.timeout = fiber.timeout;
		return fiber.rv;
	};
	
	rv = {
			next: send,
			send: send,
			throw: thrw,
			close: close,
			closed: false,
			iterator: function(){ return rv},
	};
	
	return rv;
};

createFunction = function(script, scope, realm, generator){
	if(generator){
		var rv = function(){
			name = rv.__callname__ || script.name;
			gen = createGenerator(rv.__fiber__, script, scope, realm, this, arguments, rv, name);
			if(!(fiber = rv.__fiber__))
				return gen;
			fiber.callStack[fiber.depth].evalStack.push(gen);
			rv.__fiber__ = null;
			rv.callname__ = null;
		}
	} else {
		var rv = function(){
			run = false;
			if(fiber = rv.__fiber__){
				fiber.callStack[fiber.depth].paused = true;
				rv.__fiber__ = null;
				construct = rv.__construct__;
				rv.__construct__ = null;
			} else {
				fiber = new Fiber(realm);
				run = true;
			}
			name = rv.__callname__ || script.name;
			rv.__callname__ = null;
			fiber.pushFrame(script, this, scope, arguments, rv, name, construct);
			if(run){
				fiber.run();
				return fiber.rv;
			}
		}
	}
	defProp(rv, '__vmfunction__', {value: true});
	defProp(rv, '__source__', {value: script.source});
	defProp(rv, '__name__', {value: script.name});
	defProp(rv, '__construct__', {value: null, writable: true});
	defProp(rv, '__fiber__', {value: null, writable: true});
	defProp(rv, '__callname__', {value: null, writable: true});
	return rv
};

debug = function(){};

// ugly but the only way I found to create native classed instances with a variable number of arguments
callDateConstructor = function(a){
	switch(a.length){
	case 0: rv = new Date();
	case 1: rv = new Date(a[0]);
	case 2: rv = new Date(a[0], a[1]);
	case 3: rv = new Date(a[0], a[1], a[2]);
	case 4: rv = new Date(a[0], a[1], a[2], a[3]);
	case 5: rv = new Date(a[0], a[1], a[2], a[3], a[4]);
	case 6: rv = new Date(a[0], a[1], a[2], a[3], a[4], a[5]);
	default:rv = new Date(a[0], a[1], a[2], a[3], a[4], a[5], a[6]);
	}
	/*
	 * if(a.length === 0) rv = new Date();
	 * else {
	 *     var l = a.slice();
	 *     rv = new Date(l);
	 * }
	 * 
	 */
	return rv;
};

createArrayConstructor = function(a){
	if(a.length === 1 && (a[0] | 0) === a[0]){
		return new Array(a[0]);
	}
	return a.slice();
};

createRegExpConstructor = function(a){
	if(a.length === 1)
		return new RegExp(a[0]);
	else
		return new RegExp(a[0], a[1]);
};

createNativeInstance = function(constructor, args){
	if (constructor === Date)
		return callDateConstructor(args);
	else if (constructor === Array)
		return callArrayConstructor(args);
	else if (constructor === RegExp)
		return callRegExpConstructor(args);
	else if (constructor === Number)
		return new Number(args[0]);
	else if (constructor === Boolean)
		return new Boolean(args[0]);
	else {
		// create a new object linked to the function prototype by using a constructor proxy
		constructorProxy = function(){
			constructor.apply(this, args);
		}
		constructorProxy.prototype = constructor.prototype;
		rv = new constructorProxy();
		return rv;
	};
};

module.exports.opcodes = opcodes;
