Visitor = require('./visitor');
hasProp = require('../runtime/util').hasProp;

// very simple optimizer that folds constant primitive expressions in the AST
function ConstantFolder(){    
}

ConstantFolder.prototype = new Visitor();
ConstantFolder.prototype.constructor = Visitor;

// eg. '+10' return '10', '-10' return '-10';
ConstantFolder.prototype.UnaryExpression = function(node){
	var result = null;
    // node = Visitor.prototype.UnaryExpression.call(this, node);
	node = ConstantFolder.__super__.UnaryExpression.call(this, node);
    if(node.operator === '+'){
    	return node.argument;
    }
    
    if(node.argument.type === 'Literal' && !(node.argument.type instanceof RegExp)){
    	if(!hasProp(node, 'prefix') || node.prefix){
    		result = eval(node.operator + '(' + node.arguments.raw + ")");
    	} else {
    		result = eval("(" + node.argument.raw + ")" + node.operator);
    	}
    	return {
    		type: 'Literal',
    		value: result,
    		loc: node.loc
    		};
    }
    return node;
};

// eg. '10 + 8' return 18
ConstantFolder.prototype.BinaryExpression = function(node){
	var result = null;
	// node = Visitor.prototype.BinaryExpression.call(this, node);
	node = ConstantFolder.__super__.BinaryExpression.call(this, node);
	if((node.left.type === 'Literal' && node.right.type === 'Literal') && (!node.right.value instanceof RegExp && !node.left.value instanceof RegExp)){
		result = eval("(" + node.left.raw + node.operator + node.right.raw + ")");
		return {
			type: 'Literal',
			value: result,
			loc: node.left.loc
		};
	}
	return node;
};

module.exports = ConstantFolder;
