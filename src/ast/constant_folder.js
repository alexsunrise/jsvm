Visitor = require('./visitor').Visitor;
hasProp = require('../runtime/util').hasProp;

// very simple optimizer that folds constant primitive expressions in the AST
class ConstantFolder extends Visitor{
	constructor(){
		super();
	};
	
	// eg. '+10' return '10', '-10' return '-10';
	UnaryExpression (node){
		var result = null;
	    // node = Visitor.prototype.UnaryExpression.call(this, node);
		node = super.UnaryExpression(node);
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
	BinaryExpression (node){
		var result = null;
		// node = Visitor.prototype.BinaryExpression.call(this, node);
		node = super.BinaryExpression(node);
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

};

module.exports.ConstantFolder = ConstantFolder;
