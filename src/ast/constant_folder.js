Visitor = require('./visitor');
hasProp = require('../runtime/util').hasProp;

function ConstantFolder(){    
}

ConstantFolder.prototype = new Visitor();

ConstantFolder.prototype.UnaryExpression = function(node){
    node = this.
};

module.exports = ConstantFolder;
