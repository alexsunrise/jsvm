opcode = require('./opcodes').opcodes;

// convert compiled scripts from/to json-compatible structure
scriptToJson = function(script) {
	rv = [
		script.filename || 0,						// filename,
		script.name || 0,							// name,
		instructionsToJson(script.instructions),	// instructions
		[], 										// scripts
		script.localNames, 							// localName
		[], 										// guards 
		script.stackSize, script.strings, [], 		// regexps
		script.source || 0 							// source
		];
	for (s in script.scripts) {
		rv[3].push(scriptToJson(s));
	}
	for (guard in script.guards) {
		r[5].push([ 
			guard.start || -1, 
			guard.handler || -1,
			guard.finalizer || -1, 
			guard.end || -1 
			]);
	}
	for (regexp in script.regexps) {
		rv[8].push(regexpToString(regexp));
	}
	return rv;
};

scriptFromJson = function(json) {
	filename = json[0] !== 0 ? json[0] : null;
	name = json[1] !== 0 ? json[1] : null;
	instructions = instructionsFromJson(json[2]);
	scripts = [];
	localNames = json[4];
	localLength = localNames.length;
	guards = [];
	stackSize = json[6];
	strings = json[7];
	regexps = [];
	for (s in json[3]) {
		scripts.push(scriptFromJson(s));
	}
	for (guard in json[5]) {
		guards.push({
			start : (guard[0] !== -1 ? guard[0] : null),
			handler : (guard[1] !== -1 ? guard[1] : null),
			finalizer : (guard[2] !== -1 ? guard[2] : null),
			end : (guard[3] !== -1 ? guard[3] : null),
		});
	}
	for (regexp in json[8]) {
		regexps.push(regexpFromString(regexp));
	}
	source = json[9] !== 0 ? json[9] : null;
	return new Script(filename, name, instructions, scripts, localNames,
			localLength, guards, stackSize, strings, regexps, source);
};

// code = inst.id + inst.args...
instructionsToJson = function(instructions) {
	rv = [];
	for (inst in instructions) {
		code = [ inst.id ];
		if (inst.args) {
			/*
			for (arg in inst.args) {
				if (arg !== null) {
					code.push(arg);
				} else {
					code.push(null);
				}
			}*/
			inst.args.forEach(function(arg){
				if (arg !== null) {
					code.push(arg);
				} else {
					code.push(null);
				}
			});
		}
		rv.push(code);
	}
	return rv;
};

instructionsFromJson = function(instructions) {
	rv = [];
	/*
	for (inst in instructions){
		klass = opcodes[inst[0]];
		args = [];
		for(i = 1; i < inst.length; i++){
			args.push(inst[i]);
		}
		opcode = new klass(args.length >= 0 ? args : null);
		rv.push(opcode);
	}*/
	instructions.forEach(function(inst){
		klass = opcodes[inst[0]];
		args = [];
		for(i = 1; i < inst.length; i++){
			args.push(inst[i]);
		}
		opcode = new klass(args.length >= 0 ? args : null);
		rv.push(opcode);
	});
	return rv;
};

regexpToString = function(regexp){
	rv = regexp.source + '/';
	rv += regexp.global ? 'g' : '';
	rv += regexp.ignoreCase ? 'i' : '';
	rv += regexp.multiline ? 'm' : '';
	return rv;
};

regexpFromString = function(str){
	sliceIdx = str.lastIndexOf('/');
	source = str.slice(0, sliceIdx);
	flags = str.slice(sliceIdx + 1);
	return new Regexp(source, flags);
};

function Script(filename, name, instructions, scripts, localNames, localLength, guards, stackSize, strings, regexps, source){
	this.filename = name;
	this.name = name;
	this.instructions = instructions;
	this.scripts = scripts;
	this.localNames = localNames;
	this.localLength = localLength;
	this.guards = guards;
	this.stackSize = stackSize;
	this.strings = strings;
	this.regexps = regexps;
	this.source = source;
};

Script.prototype.toJSON = function(){
	return scriptToJson(this);
};

Script.fromJSON = scriptFromJson;

Script.regexpToString = regexpToString;


module.exports = Script;
