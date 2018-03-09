isArray = require('./util').isArray;

function printTrace(trace, indent = ''){
    indent += '    ';
    var rv = '';
    for(frame in trace){
        if(isArray(frame)){
            rv += "\n\n" + indent + "Rethrown:";
            rv += printTrace(frame, indent);
            continue;
        }
        l = frame.line;
        c = frame.colum;
        name = frame.at.name;
        filename = frame.at.filename;
        if(name){
            rv += "\n" + indent + "at " + name + " (" + filename + ": " + l + ":" + c + ")";
        } else {
            rv += "\n" + indent + "at " + filename + ": " + l + ":" + c;
        }
    }
    return rv;
};

class VmError{
	constructor(message){
		this.message = message;
	    this.trace = null;
	};
	
	toString (){
	    errName = this.constructor.display;
	    rv = errName + ": " + this.message;
	    if(this.trace){
	    	rv += printTrace(this.trace);
	    }
	    return rv;
	};
	
	stackTrace(){
		this.toString();
	};
};

class VmEvalError extends VmError{
	constructor(){
		display = 'EvalError';
		// VmError.call(this);
	};
};


class VmRangeError extends VmError{
	constructor(){
		this.display = 'RangeError';
		// VmError.call(this);
	};
};

VmReferenceError = class VmReferenceError extends VmError{
	constructor(){
		// VmError.call(this);
		this.display = 'ReferenceError';
	};
};

class VmSyntaxError extends VmError{
	constructor(){
		// VmError.call(this);
		this.display = 'SyntaxError';
	};
};

class VmTypeError extends VmError{
	constructor(){
		// VmError.call(this);
		this.display = 'TypeError';
	};
};

class VmURIError extends VmError{
	constructor(){
		// VmError.call(this);
		this.display = 'URIError';
	};
};

class VmTimeoutError extends VmError{
	constructor(){
		// VmError.call(this);
		this.display = 'TimeoutError';
	};
};

module.exports = {
		VmError: VmError,
		VmEvalError: VmEvalError,
		VmRangeError: VmRangeError,
		VmReferenceError: VmReferenceError,
		VmSyntaxError: VmSyntaxError,
		VmTypeError: VmTypeError,
		VmURIError: VmURIError,
		VmTimeoutError: VmTimeoutError
};
