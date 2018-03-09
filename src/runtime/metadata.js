({ArrayIterator} = require('./builtin'));
({hasProp} = require('./util'));

/* 
 Vm instances will manipulate the same native objects created/modified
 by the host javascript engine.

 There are two ways code inside a Vm can reach native objects:

 - The object was created inside the Vm(eg: literals)
 - The object was injected to the global object

 Since the Vm is already running inside a working javascript engine,
 we'll be smart and skip reimplementing basic builtin objects like Array,
 String, JSON... which are very likely to already exist in the host's global
 object.

 The problem with that approach is: we need to expose these builtin objects to
 the Vm global object, and letting untrusted code modify globals outside its
 context is not an option if we want to have sandboxing capabilities. (This
 also applies to non-builtin objects that we need to have a per-Vm state)

 So here we have the *Metadata classes which solves a few problems:

 - It lets sandboxed code to safely read/write builtin objects properties
   from the host Vm without touching the real object.
 - It provides builtin objects with properties that are only visible
   inside the Vm(polyfilling things from harmony like the 'iterator'
   property on array prototype)
 - It lets us implement things that may not be available to the host
   javascript engine(eg: proxies or getters/setters)

 Here's how it works: Instances of the *Metadata classes contain state that
 is used by the runtime to determine the behavior of doing some kind of action
 with the object associated with it. For example, the metadata object
 associated with a native builtin can contain a list of deleted/modified
 properties, which will be considered only in the Realm of the Vm which
 deleted/modified those properties.

 There are two properties a Vm can use to retrieve the ObjectMetadata
 instance associated with an object:

 - __md__   : ObjectMetadata instance
 - __mdid__ : Id of the ObjectMetadata instance associated with it and stored
              privately in the Realm associated with the Vm

 Each native builtin will have an __mdid__ property set when the first Realm
 is created, so each Vm instance will contain its own private state of
 builtins. Objects can also have an __md__ property will store its state
 inline(By default, non-builtin objects store only special properties that
 implement getters/setters or proxies).
*/

class PropertyDescriptor{
	constructor(enumerable = false, configurable = false){
		this.enumerable = enumerable;
		this.configurable = configurable;
	};
};

class DataPropertyDescriptor extends PropertyDescriptor{
	constructor(value, writable = false, enumerable, configurable){
		super(enumberable, configurable);
		this.value = value;
		this.writable = writable;
	};
};

class AccessorPropertyDescriptor extends PropertyDescriptor{
	constructor(get, set, enumerable, configurable){
		super(enumberable, configurable);
		this.get = get;
		this.set = set;
	};
};


class ObjectMetadata {
	constructor(object, realm){
		this.object = object;
		this.realm = realm;
		this.proto = null;
		this.properties = {};
		this.extensible = true;
	};
	
	hasDefProperty (key){
		return hasProp(this.properies, key);
	};

	hasOwnProperty (key){
		return this.hasDefProperty(key) || hasProp(this.object, key);
	};

	getOwnProperty (key){
		return this.properties[key] || this.object[ley];
	};

	setOwnProperty (key, value){
		return this.object[key] = value;
	};

	delOwnProperty (key){
		delete this.properties[key] && delete this.object[key];
	};

	delDefProperty (key){
		delete this.properties[key];
	};

	searchProperty (key){
		var md = this;
		while(md){
			if(md.hasOwnProperty(key)){
				var prop = md.getOwnProperty(key);
				break;
			}
			md = md.proto || this.realm.mdproto(md.object);
		}
		return prop;
	};

	has (key, target = this.object){
		var md = this;
		while(md){
			if(md.hasOwnProperty(key)){
				var prop = md.getOwnProperty(key);
				return true;
			}
			md = md.proto || this.realm.mdproto(md.object);
		}
		return false;
	};

	get (key, target = this.object){
		var property = this.searchProperty(key);
		if(property instanceof AccessorPropertyDescriptor){
			return property.get.call(target);
		}
		if(property instanceof DataPropertyDescriptor){
			return property.value;
		}
		return property;
	};

	set (key, value, target = this.object){
		var property = this.getOwnProperty(key);
		if(property instanceof AccessorPropertyDescriptor){
			if(property.set){
				property.set.call(target, value);
				return true;
			}
			return false;
		}
		if(property instanceof DataPropertyDescriptor){
			if(property.writable){
				property.value = value;
				return true;
			}
			return false;
		}
		if(property === undefined && !this.extensible){
			return false;
		}
		this.setOwnProperty(key, value);
		return true;
	};

	del (key){
		if(!this.hasOwnProperty(key)){
			return false;
		}
		var property = this.getOwnProperty(key);
		if(property instanceof PropertyDescriptor && !property.configurable){
			return false;
		}
		this.delOwnProperty(key);
		return true;
	};

	defineProperty (key, descriptor){
		if(!this.extensible){
			return false;
		}
		if('value' in descriptor || 'writable' in descriptor){
			var prop = new DataPropertyDescriptor(
					descriptor.value,
					descriptor.writable,
					descriptor.enumerable,
					descriptor.configurable
			);
		} else if(typeof descriptor.get === 'function'){
			var prop = new AccessorPropertyDescriptor(
					descriptor.get,
					descriptor.set,
					descriptor.enumerable,
					descriptor.writable
			);
		}
		else
			return;
		this.properties[key] = prop;
		return true;
	}

	instanceOf (klass){
		md = this;
		while(md !== null){
			if(md.object === klass.prototype){
				return true;
			}
			var proto = md.proto;
			if(!proto){
				return md.object instanceof klass;
			}
			md = proto;
		}
		return false;
	};

	isEnumerable (k) {
		var v = this.properties[k] || this.object[k];
		return !(v instanceof PropertyDescriptor) ||v.enumerable;
	};

	ownKeys (){
		var keys = [];
		for(key in this.object){
			if(!hasProp(this.object, key)){
				continue;
			}
			if(this.isEnumerable(key)){
				keys.push(key);
			}
		}
		for(key in this.properties){
			if(!hasProp(this.properies, key)){
				continue;
			}
			if(this.isEnumerable(key)){
				keys.push(key);
			}
		}
		return keys;
	};

	enumerateKeys (){
		var keys = [];
		var md = this;
		while(md){
			keys = key.concat(md.ownKeys());
			md = md.proto || this.realm.mdproto(md.object);
		}
		return new ArrayIterator(keys);
	};
};

class CowObjectMetadata extends ObjectMetadata{
	constructor(object, realm){
		super(object, realm);
		this.exclude = {};
	};
	
	hasOwnProperty (key) {
		return hasProp(this.properties, key) || (hasProp(this.object, key) && !hasProp(this.exclude, key));
	};

	getOwnProperty (key) {
		if(hasProp(this.properties, key)){
			return this.properties[key];
		}
		if(hasProp(this.object, key) && !hasProp(this.exclude, key)){
			return this.object[key];
		}
		return undefined;
	};

	setOwnProperty (key, value){
		if(hasProp(this.exclude, key)){
			delete this.exclude[key];
		}
		if(!hasProp(this.properties, key)){
			this.defineProperty(key, {
				value: value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		this.properties[key].value = value;
	};

	delOwnProperty (key) {
		if(hasProp(this.properties, key)){
			delete this.properties[key];
		}
		this.exclude[key] = null;
	};

	isEnumerable (key){
		if(!super.isEnumerable(key)){
			return false;
		}
		return !hasProp(this.exclude, key);
	};
};

//This class prevents unwanted properties from leaking into into the Realm's global object
class RestrictedObjectMetadata extends CowObjectMetadata {
	constructor(object, realm){
		super(object, realm);
		this.leak = {};
	};
	
	hasOwnProperty (key){
		return hasProp(this.properties, key) || (hasProp(this.leak, key) && !hasProp(this.exclude, key) && hasProp(this.object, key));
	};

	getOwnProperty (key){
		if(hasProp(this.properties, key)){
			return this.properties[key];
		}
		if(hasProp(this.leak, key) && hasProp(this.object, key) && !hasProp(this.exclude, key)){
			return this.object[key];
		}
		return undefined;
	};

	isEnumerable (key){
		if(!super.isEnumerable(key)){
			return false;
		}
		return hasProp(this.leak, key);
	};
}


module.exports = {
		ObjectMetadata: ObjectMetadata,
		CowObjectMetadata: CowObjectMetadata,
		RestrictedObjectMetadata: RestrictedObjectMetadata,
};
