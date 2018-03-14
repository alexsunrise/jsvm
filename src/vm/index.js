esprima = require('esprima');

Transformer = require('../ast/transformer');
Realm = require('../runtime/realm');
ConstantFolder = require('../ast/constant_folder').ConstantFolder;
Emitter = require('./emitter');
({Fiber} = require('./thread'));
Script = require('./script');

Vm = (function(){
	class Vm{
		constructor(merge, allowEval = false){
			this.realm = new Realm(merge);
			if(allowEval){
				this.realm.compileFunction = Vm.compileFunction;
				this.realm.eval = this.realm.global.eval = Vm.compileEval;
			}
		};
		
		eval (string, filename, timeout){
			// script = Vm.compile(string, filename);
			return this.run(Vm.compile(string, filename), timeout);
		};
		
		run (script, timeout){
			var fiber = this.createFiber(script, timeout);
			fiber.run();
			if(!fiber.paused){
				return fiber.rexp;
			}
		};
	
		createFiber (script, timeout){
			var fiber = new Fiber(this.realm, timeout);
			fiber.pushFrame(script, this.realm.global);
			return fiber;
		};
		
		static compile (source, filename = '<script>'){
			let emitter = new Emitter(null, filename, null, source.split('\n'));
			return compile(source, emitter);
		};
	
		static compileEval (frame, source){
			// reconstruct the scope information necessary for compilation
			let scopes = [], scope = frame.scope;
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
	
		static compileFunction (args){
			let functionArgs = [];
			if(args.length > 1){
				for(i = 0; i < args.length; i++ ){
					functionArgs = functionArgs.concat(args[i].split(','));
				}
			}
			let body = args[args.length - 1];
			let source = "(function(" + (functionArgs.join(', ')) + ") {\n" + body + "\n})";
			let emitter = new Emitter([{
				"this": 0,
				"arguments":1
				}], '<eval>', null, source.split('\n'));
			let program = compile(source, emitter);
			return program.scripts[0];
		};
	};
	Vm.fromJSON = Script.fromJSON;
	Vm.parse = esprima.parse;
	return Vm;
}).call(this);

compile = function(source, emitter){
	transformer = new Transformer(new ConstantFolder(), emitter);
	ast = esprima.parse(source, {loc: true});
	transformer.transform(ast);
	return emitter.end();
};

module.exports = Vm;
