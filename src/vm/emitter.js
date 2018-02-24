parse =require('esprima');

Script = require('./script');
opcodes = require('./opcodes');
Visitor = require('./../runtime/util');

// Last visitor applied in the compilation pipeline, it emit opcodes to be executed in the vm

function Emitter(scopes, filename, name, original, source){
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

Emitter.prototype = new Visitor();
Emitter.prototype.constructor = Visitor;

Emitter.prototype.scope = function(name){
	crossFunctionScope = false;
	var i = 0;
	for(scope in this.scopes){
		if(hasProp(scope, name)){
			return [i, scope[name]];
		}
		// only scopes after the function scope will increase the index
		if(crossFunctionScope || scope === this.scriptScope){
			crossFunctionScope = true;
			i++;
		}
	}
	return null;
};

Emitter.prototype.scopeGet = function(name){
	if(this.withLevel){
		this.GETW(name, this.ignoredNotDefined);
		this.ignoreNotDefined = 0;
		return;
	}
	scope = this.scope(name);
	if(scope){
		this.ignoreNotDefined = 0;
		this.GETL.applay(this, scope);
		return;
	}
	this.GETG(name, this.ignoreNotDefined); // global object get
	this.ignoreNotDefined = 0;
	return;
};

Emitter.prototype