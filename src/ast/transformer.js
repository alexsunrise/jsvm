
class Transformer {
	constructor(...visitor){
		this.visitor = visitor;
	};
	
	transform(ast){
		for (i = 0; i <this.visitor.length; i++){
			var visitor = this.visitor[i];
			ast = visitor.visit(ast);
		}
		return ast;
	};
};

module.exports = Transformer;
