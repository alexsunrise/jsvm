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

function VmError(message){
    this.message = message;
    this.trace = null;
};

VmError.prototype.toString = function(){
    errName = this.display;
}
