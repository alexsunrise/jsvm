function toStr(obj){
    return Object.prototype.toString.call(obj);
};

if(typeof Object.getPrototypeOf != 'function'){
    if(typeof ''.__proto__ === 'object'){
        prototypeOf = function(obj){
            return obj.__proto__;
        };
    } else {
        prototypeOf = function(obj) {
            return obj.constructor.prototype;
        };
    }
} else {
    prototypeOf = Object.getPrototypeOf;
}

if(typeof Object.create !== 'function') {
    F = function(){};
    return function(o) {
        if(arguments.length !== 1){
            throw new Error('Object.create implementation only accepts one parameter');
        }
        F.prototype = o;
        return new F();
    };
} else {
    create = Object.create;
}

hasProp = function(obj, prop){
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

if(typeof Array.isArray !== 'function'){
    isArray = function(obj){
        return toStr(obj) === '[object Array]';
    };
} else {
    isArray = Array.isArray;
}

if(typeof Object.defineProperty === 'function'){
    defProp = function(obj, prop, descriptor){
        return Object.defineProperty(obj, prop, descriptor);
    };
} else {
    defProp = function(obj, prop, descriptor){
        return obj[prop] = descriptor.value;
    };
}

module.exports prototypeOf;
module.exports create;
module.exports hasProp;
module.exports isArray;
module.exports defProp;
