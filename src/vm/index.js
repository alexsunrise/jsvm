esprima = require('esprima');

Transformer = require('../ast/transformer');
Realm = require('../runtime/realm');
ConstantFolder = require('../ast/constant_folder');
Emitter = require('./emitter');
{Fiber} = require('./thread');
Script = require('./script');

function Vm(merge, allowEval = false){
	this.realm = new Realm(merge);
	if(allowEval){
		this.realm.compileFunction = Vm.compileFunction;
		this.realm.eval = this.realm.global.eval = Vm.compileEval;
	}
};

Vm.prototype.eval = function(string, filename, timeout){
	this.run(Vm.compile(string, filename), timeout);
};

Vm.prototype.run = function(script, timeout){
	fiber = this.createFiber(script, timeout);
	fiber.run();
	if(!fiber.paused){
		return fiber.rexp;
	}
};

Vm.prototype.createFiber = function(script, timeout){
	fiber = new Fiber(this.realm, timeout);
	fiber.pushFrame(script, this.realm.global);
	return fiber;
};

Vm.compile = function(source, filename = '<script>'){
	emitter = new Emitter(null, filename, null, source.split('\n'));
	return compile(source, emitter);
};

Vm.compileEval = function(frame, source){
	// reconstruct the scope information necessary for compilation
	var scopes = [], scope = frame.scope;
	while(scope){
		scopes.push(scope.namesHash());
		scope = scope.parent;
	}
	emitter = new Emitter(scopes, '<eval>', 'eval', source.split('\n'));
	if(frame.scope){
		// this should take care of updating local variables declared in the eval'ed string
		emitter.varIndex = frame.scope.data.length;
		names = frame.scope.names.slice();
		names[0] = 'this';
		names[1] = 'arguments';
		emitter.localNames = names;
	}
	return compile(source, emitter);
};

Vm.compileFunction = function(args){
	var functionArgs = [];
	if(args.length > 1){
		for(i = 0; i < args.length; i++ ){
			functionArgs = functionArgs.concat(args[i].split(','));
		}
	}
	body = args[args.length - 1];
	source = "(function(" + (functionArgs.join(', ')) + ") {\n" + body + "\n})";
	emitter = new Emitter([{
		"this": 0,
		"arguments":1
		}], '<eval>', null, source.split('\n'));
	program = compile(source, emitter);
	return program.scripts[0];
};

Vm.fromeJSON = Script.fromeJSON;

Vm.parse = esprima.parse;

compile = function(source, emitter){
	transformer = new Transformer(new ConstantFolder(), emitter);
	ast = esprima.parse(source, {loc: true});
	transformer.transform(ast);
	return emitter.end();
};

module.exports = Vm;
