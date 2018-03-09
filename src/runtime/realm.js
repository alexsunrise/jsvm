({VmError, VmEvalError, VmRangeError, VmReferenceError, VmSyntaxError, VmTypeError, VmURIError} = require('./errors'));
({ObjectMetadata, CowObjectMetadata, RestrictedObjectMetadata} = require('./metadata'));
({defProp, isArray, prototypeOf, create, hasProp} = require('./util'));
RegExpProxy = require('./regexp_proxy');
({ArrayIterator, StopIteration} = require('./builtin'));

// these special runtime properties need to be handled separately
runtimeProperties = {
		'__mdid__': null,
		'__md__': null,
		'__vmfunction__': null,
		'__fiber__': null,
		'__callname__': null,
		'__construct__': null,
		'__source__': null,
		'__name__': null
};

class Realm {
	constructor(merge){
		global = {
				undefined: undefined,
				Object: Object,
				Function: Function,
				Number: Number,
				Boolean: Boolean,
				String: String,
				Array: Array,
				Date: Date,
				RegExp: RegExp,
				Error: VmError,
				EvalError: VmEvalError,
				RangeError: VmRangeError,
				ReferenceError: VmReferenceError,
				SyntaxError: VmSyntaxError,
				TypeError: VmTypeError,
				URIError: VmURIError,
				StopIteration: StopIteration,
				Math: Math,
				JSON: JSON,
				parseInt: parseInt,
				parseFloat: parseFloat
		};
		global.global = global;
		
		// Populate native proxies
		var nativeMetadata = {};
		
		var currentId = 0;
		
		var hasOwnProperty = function(obj, key){
			var type = typeof obj;
			var objType = (type === 'object' || type === 'function');
			if (hasProp(runtimeProperties, key)){
				if(objType){
					if (hasProp(obj, '__mdid__')){
						var md = nativeMetadata[obj.__mdid__];
					} else if (hasProp(obj, '__md__')){
						var md = obj.__md__;
					}
					if (md){
						return md.hasDefProperty(key);
					}
				}
				return false;
			}
			var mdid = obj.__mdid__;
			var md = nativeMetadata[obj.__mdid__];
			if ((md && md.object) === (obj || !objType)){
				return md.hasOwnProperty(key, obj);
			}
			if(hasProp(obj, '__md__')){
				return obj.__md__.hasOwnProperty(key);
			}
			return hasProp(obj, key);
		};

		var register = (obj, restrict) => {
			if (!hasProp(obj, '__mdid__')){
				defProp(obj, '__mdid__', {
					value: currentId + 1,
					writable: true
				});
			}
			currentId = Math.max(obj.__mdid__, currentId);
			if (hasProp(nativeMetadata, obj.__mdid__)){
				return;
			}
			var type = typeof restrict;
			if (type && type === 'boolean'){
				return nativeMetadata[obj.__mdid__] = new CowObjectMetadata(obj, this);
			}
			if (type === 'object'){
				nativeMetadata[obj.__mdid__] = new RestrictedObjectMetadata(obj, this);
				if(isArray(restrict)){
					for(let k in restrict){
						if(hasProp(obj, k)){
							nativeMetadata[obj.__mdid__].leak[k] = null;
							register(obj[k], true);
						}
					}
				} else {
					for(let k in restrict){
						if(hasProp(restrict, k) && hasProp(obj, k)){
							nativeMetadata[obj.__mdid__].leak[k] = null;
							register(obj[k], restrict[k]);
						}
					}
				}
				return;
			}
			return nativeMetadata[obj.__mdid__] = new ObjectMetadata(obj);
		};

		var getPrototypeOf = function(obj){
			if(hasProp(obj, '__mdid__')){
				var proto = nativeMetadata[obj.__mdid__].proto;
			} else if (hasProp(obj, '__md__')){
				var proto = obj.__md__.proto;
			}
			if(proto){
				return proto;
			}
			return prototypeOf(obj);
		};

		var getOwnPropertyDescriptor = (obj, key) => {
			
		};

		var defineProperty = (obj, key, descriptor) => {
			var type = typeof obj;
			var objType = (type === 'object') || (type == 'function');
			if (objType){
				if(hasProp(obj, '__mdid__')){
					nativeMetadata[obj.__mdid__].defineProperty(key, descriptor)
				} else {
					if(!hasProp(runtimeProperties, key) &&
							hasProp(descriptor, 'value') &&
							hasProp(descriptor, 'writable') && descriptor.writable &&
							hasProp(descriptor, 'enumerable') && descriptor.enumerable &&
							hasProp(descriptor, 'configurable') && descriptor.configurable){
						// normal property
						obj[key] = descriptor.value;
					} else {
						if(!hasProp(obj, '__md__')){
							defProp(obj, '__md__', {
								value: new ObjectMetadata(obj, this),
								writable: true
							});
							obj.__md__.defineProperty(key, descriptor);
						}
					}
				}
			}
			return undefined;
		};
		
		register(Object, {
			'prototype': ['constructor', 'toString']
		});
		register(Function, {
			'prototype': ['constructor', 'apply', 'call', 'toString']
		});
		register(Number, {
			'isNaN': true,
			'isFinite': true,
			'prototype': ['constructor', 'toExponential', 'toFixed', 'toLocaleString', 'toPrecision', 'toString', 'valueOf']
		});
		register(Boolean, {
			'prototype': ['constructor', 'toString', 'valueOf']
		});
		register(String, {
			'fromCharCode': true,
			'prototype': ['constructor', 'charAt', 'charCodeAt', 'concat', 'constains', 'indexOf', 'lastIndexOf', 'replace', 'search', 'slice', 'split', 'substr', 'substring', 'toLowerCase', 'toString', 'toUpperCase', 'valueOf']
		});
		register(Array, {
			'isArray': true,
			'every': true,
			'prototype': ['constructor', 'join', 'reverse', 'sort', 'push', 'pop', 'shift', 'unshift', 'splice', 'concat', 'slice', 'indexOf', 'lastIndexOf', 'forEach', 'map', 'reduce', 'reduceRight', 'filter', 'some', 'every']
		});
		register(Date, {
			'now': true,
			'parse': true,
			'UTC': true,
			'prototype': ['constructor', 'getDate', 'getDay', 'getFullYear', 'getHours', 'getMilliseconds', 'getMinutes', 'getMonth', 'getSeconds', 'getTime', 'getTimezoneOffset', 'getUTCDate', 'getUTCDay', 'getUTCFullYear', 'getUTCHours', 'getUTCMilliseconds', 'getUTCMinutes', 'getUTCSeconds', 'setDate', 'setFullYear', 'setHours', 'setMilliseconds', 'setMinutes', 'setMonth', 'setSeconds', 'setTime', 'setUTCDate', 'setUTCFullYear', 'setUTCHours', 'setUTCMilliseconds', 'setUTCMinutes', 'setUTCSeconds', 'toDateString', 'toISOString', 'toJSON', 'toLocaleDateString', 'toLocateString', 'toLocaleTimeString', 'toString', 'toTimeString', 'toUTCString', 'valueOf']
		});
		register(RegExp, {
			'prototype': ['constructor', 'exec', 'test', 'toString']
		});
		register(Math, ['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos', 'exp', 'floor', 'imul', 'log', 'max', 'min', 'pow', 'random', 'round', 'sin', 'sqrt', 'tan']
		);
		register(JSON, ['parse', 'stringify']
		);
		
		register(parseFloat, true);
		
		register(parseInt, true);
		
		register(ArrayIterator, ['prototype']);
		
		register(RegExpProxy, ['prototype']);
		
		nativeMetadata[Object.__mdid__].properties = {
				create: create,
				getPrototypeOf: getPrototypeOf,
				defineProperty: defineProperty
		};
		
		nativeMetadata[Object.prototype.__mdid__].properties = {
				hasOwnProperty: function(key){
					return hasOwnProperty(this, key);
				}
		};
		
		nativeMetadata[Function.prototype.__mdid__].properties = {
				toString: function(){
					if(this.__vmfunction__)
						return this.__source__;
					return this.toString();
				}
		};
		
		nativeMetadata[Array.prototype.__mdid__].properties = {
				iterator: function(){
					return new ArrayIterator(this);
				}
		};
		
		nativeMetadata[String.prototype.__mdid__].properties = {
				match: function(obj){
					if(obj instanceof RegExpProxy)
						return this.match(obj.regexp);
					return this.match(obj);
				},
				replace: function(obj){
					var args = Array.prototype.slice.call(arguments);
					if(obj instanceof RegExpProxy)
						args[0] = obj.regexp;
					return this.replace.apply(this, args);
				}
		};
		
		nativeMetadata[RegExp.prototype.__mdid__].properties = {
				exec: function(str){
					if(this instanceof RegExpProxy){
						this.regexp.lastIndex = this.lastIndex;
						var rv = this.regexp.exec(str);
						this.lastindex = this.regexp.lastIndex;
						return rv;
					}
					return this.exec(str);
				},
				test: function(str){
					if(this instanceof RegExpProxy){
						this.regexp.lastIndex = this.lastIndex;
						var rv = this.regexp.test(str);
						this.lastindex = this.regexp.lastIndex;
						return rv;
					}
					return this.test(str);
				},
				tostring: function(){
					if(this instanceof RegExpProxy)
						return this.regexp.toString();
					return this.toString();
				}
		};
		
		// retrieves the metadata from the closest object in the prototype chain that has a metadata object associated
		this.mdproto = function(obj){
			var proto = prototypeOf(obj);
			if(proto)
				return nativeMetadata[proto.__mdid__];
		};
		
		this.has = function(obj, key){
			if(obj in [undefined, null])
				return false;
			var type = typeof obj;
			var objType = type in ['object', 'function'];
			if(hasProp(runtimeProperties, key)){
				if(objType){
					if(hasProp(obj, '__mdid__'))
						var md = nativeMetadata[obj.__mdid__];
					else if(hasProp(obj, '__md__'))
						md = obj.__md__;
					if(md)
						return md.hasDefProperty(key);
					return this.has(prototypeOf(obj), key);
				}
				return false;
			}
			var mdid = obj.__mdid__;
			var md = nativeMetadata[obj.__mdid__];
			if(md && md.object === obj || !objType){
				return md.has(key, obj);
			}
			if(hasProp(obj, '__mdid__')){
				return obj.__mdid__.has(key);
			}
			if(hasProp(obj, key)){
				return true;
			}
			return this.has(prototypeOf(obj), key);
		};
		
		this.get = function(obj, key){
			if(obj in [undefined, null])
				return undefined;
			var type = typeof obj;
			var objType = type in ['object', 'function'];
			if(hasProp(runtimeProperties, key)){
				if(objType){
					if(hasProp(obj, '__mdid__'))
						var md = nativeMetadata[obj.__mdid__];
					else if(hasProp[obj, '__md__'])
						var md = obj.__md__;
					if(md && md.hasDefProperty(key))
						return md.get(key);
					return this.get(prototypeOf(obj), key);
				}
				else // primitive
					return nativeMetadata[obj.__mdid__].get(key);
				return undefined;
			}
			if(type === 'string' && (typeof key === 'number' || key === 'length')) // char at index or string length
				return obj[key];
			var mdid = obj.__mdid__;
			var md = nativeMetadata[obj.__mdid__];
			if(md && (md.object === obj || !objType)){
				// registered native object, or primitive type. use its corresponding metadata object to read the property
				return md.get(key, obj);
			}
			if(hasProp(obj, '__md__'))
				// use the inline metadata object to read the property
				return obj.__md__.get(key);
			if(hasProp(obj, key))
				// read the property directly
				return obj[key];
			// search the object prototype chain
			return this.get(prototypeOf(obj), key);
		};
		
		this.set = function(obj, key, val) {
			var type = typeof obj;
			var objType = type in ['object', 'function'];
			if(hasProp(runtimeProperties, key)){
				if(objType){
					if(hasProp(obj, '__mdid__'))
						var md = nativeMetadata[obj.__mdid__];
					else if(hasProp[obj, '__md__']){
						defProp(obj, '__md__', {
							value: new ObjectMetadata(obj, this),
							writable: true
						});
						md = obj.__md__;
					}
					if(!md.hasDefProperty(key)){
						md.defineProperty(key, {
							value: val,
							writable: true,
							enumerable: true,
							configurable: true
						});
					}
					md.set(key, val);
				}
				return val;
			}
			if(objType){
				if(hasProp(obj, '__md__'))
					obj.__md__.set(key, value);
				else if (hasProp(obj, '__mdid__'))
					nativemetadata[obj.__mdid__].set(key, val);
				else
					obj[key] = val;
			}
			return val;
		};
		
		this.del = function(obj, key) {
			var type = typeof obj;
			var objType = type in ['object', 'function'];
			if(hasProp(runtimeProperties, key)){
				if(objType){
					if(hasProp(obj, '__mdid__'))
						return nativeMetadata[obj.__mdid__].del(key);
					else if(hasProp[obj, '__md__'])
						return obj.__md__delDefProperty(key);
				}
				return true;
			}
			if(objType){
				if(type === 'function' && key === 'prototype')
					// a function prototype cannot be deleted
					return false;
				if(hasProp(obj, '__md__'))
					return obj.__md__.del(key);
				else if (hasProp(obj, '__mdid__'))
					return nativemetadata[obj.__mdid__].del(key);
				else
					return delete obj[key];
			}
			return true;
		};
		
		this.instanceOf = function(klass, obj){
			if((obj in [undefined, null]) || !(typeof obj in ['object', 'function']))
				return false;
			if(hasProp(obj, '__mdid__'))
				return nativeMetadata[obj.__mdid__].instanceOf(klass);
			if(hasProp(obj, '__md__'))
				return obj.__md__.instanceOf(klass);
			return obj instanceof klass;
		};
		
		this.getNativeMetadata = function(obj){
			return nativeMetadata[obj.__mdid__];
		};
		
		this.enumerateKeys = function(obj){
			if(typeof obj === 'object')
				if(hasProp(obj, '__md__'))
					return obj.__md__.enumerateKeys();
			var keys = [];
			for(key in obj){
				if(key !== '__mdid__')
					keys.push(key);
			}
			return new ArrayIterator(keys);
		}
		
		for(k in merge)
			if(hasProp(merge, k))
				global[k] = merge[k];
		
		this.global = global;
		
		this.registerNative = register;
	} // constructor
	
	inv(o){
		return -o;
	};
	
	lnot(o){
		return !o;
	};
	
	not(o){
		return ~o;
	};
	
	inc(o){
		return o + 1;
	};
	
	dec(o){
		return o - 1;
	};
	
	add(r, l){
		return l + r;
	};
	
	sub(r, l) {
		return l - r;
	};
	
	mul(r, l) {
		return l * r;
	};
	
	div(r, l){
		return l / r;
	};
	
	mod(r, l){
		return l % r;
	};
	
	shl(r, l){
		return l << r;
	};
	
	sar(r, l){	// Shift Arithmetic Right
		return l >> r;
	};
	
	shr(r, l){	// Shift Right
		return l >>> r;
	};
	
	or(r, l){
		return l | r;
	};
	
	and(r, l){
		return l & r;
	};
	
	xor(r, l){
		return l ^ r;
	};
	
	ceq(r, l){		// equal to value
		return l == r;
	};
	
	cneq(r, l){		// equal value and equal type
		return l === r;
	};
	
	cid(r, l){		// not equal value
		return l != r;
	};
	
	cnid(r, l){		// not equal value or not euqal type
		return l !== r;
	};
	
	lt(r, l){
		return l < r;
	};
	
	lte(r, l){
		return l <= r;
	};
	
	gt(r, l){
		return l > r;
	};
	
	gte(r, l){
		return l >= r;
	};
};

module.exports = Realm;












































