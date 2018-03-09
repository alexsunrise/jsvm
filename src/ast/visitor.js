// Base class for classes that perform ast transformation
// Any subclass must return a node on the type-specific methods
// or null to delete that node

class Visitor{
	constructor (){
	};

	visit (node) {
	    if(node instanceof Array){
	        return this.visitArray(node);
	    }
	    if(node && node.type){
	        return this[node.type](node);
	    }
	    if(node){
	        throw new Error('unexpected node');
	    }
	    return null;
	};

	visitArray (array){
	    var i = 0, result;
	    while(i < array.length){
	        if(!array[i]){
	            i++;
	            continue;
	        }
	        result = this.visit(array[i]);
	        if(result){
	            array[i++] = result;
	        } else {
	            array.splice(i, 1);
	        }
	    }
	    return array;
	};

	Program (node){
	    node.body = this.visit(node.body);
	    return node;
	};

	EmptyStatement (node){
	    return null;
	};

	BlockStatement (node){
	    node.body = this.visit(node.body);
	    return node;
	};

	ExpressionStatement (node){
	    node.expression = this.visit(node.expression);
	    return node;
	};

	IfStatement (node){
	    node.test = this.visit(node.test);
	    node.consequent = this.visit(node.consequent);
	    node.alternate = this.visit(node.alternate);
	    return node;
	};

	LabeledStatement (node){
	    node.label = this.visit(node.label);
	    node.body = this.visit(node.body);
	    return node;
	};

	BreakStatement (node){
	    node.label = this.visit(node.label);
	    return node;
	};

	ContinueStatement (node){
	    node.label = this.visit(node.label);
	    return node;
	};

	WithStatement (node){
	    node.object = this.visit(node.object);
	    node.body = this.visit(node.body);
	    return node;
	};

	SwitchStatement (node){
	    node.discriminant = this.visit(node.discriminant);
	    node.cases = this.visit(node.cases);
	    return node;
	};

	SwitchCase (node){
	    node.test = this.visit(node.test);
	    node.consequent = this.visit(node.consequent);
	    return node;
	};

	ReturnStatement (node){
	    node.argument = this.visit(node.argument);
	    return node;
	};

	ThrowStatement (node){
	    node.argument = this.visit(node.argument);
	    return node;
	};

	TryStatement (node){
	    node.block = this.visit(node.block);
	    node.handlers = this.visit(node.handles);
	    node.guardedHandlers = this.visit(node.guardedHandlers);
	    node.finalizer = this.visit(node.finalizer);
	    return node;
	};

	WhileStatement (node){
	    node.test = this.visit(node.test);
	    node.body = this.visit(node.body);
	    return node;
	};

	DoWhileStatement (node){
	    node.body = this.visit(node.body);
	    node.test = this.visit(node.test);
	    return node;
	};

	ForStatement (node){
	    /*
	    node.test = this.visit(node.test);
	    node.body = this.visit(node.body);
	    node.init = this.visit(node.init);
	    node.update = this.visit(node.update);
	    */
	    node.init = this.visit(node.init);
	    node.test = this.visit(node.test);
	    node.body = this.visit(node.body);
	    node.update = this.visit(node.update);
	    return node;
	};

	ForInStatement (node){
	    node.left = this.visit(node.left);
	    node.right = this.visit(node.right);
	    node.body = this.visit(node.body);
	    return node;
	};

	ForOfStatement (node){
	    node.left = this.visit(node.left);
	    node.right = this.visit(node.right);
	    node.body = this.visit(node.body);
	    return node;
	};

	LetStatement (node){
	    node.head = this.visit(node.head);
	    node.body = this.visit(node.body);
	    return node;
	};

	DebuggerStatement (node){
	    return node;
	};

	FunctionDeclaration (node){
	    node.id = this.visit(node.id);
	    node.params = this.visit(node.params);
	    node.defaults = this.visit(node.defaults);
	    node.rest = this.visit(node.rest);
	    node.body = this.visit(node.body);
	    return node;
	};

	VariableDeclaration (node){
	    node.declarations = this.visit(node.declarations);
	    return node;
	};

	Declarator (node){
	    node.id = this.visit(node.id);
	    node.init = this.visit(node.init);
	    return node;
	};

	ThisExpression (node){
	    return node;
	};

	ArrayExpression (node){
	    node.elements = this.visit(node.elements);
	    return node;
	};

	// if property is not a reference, it will cause a problem
	ObjectExpression (node){
	    for(property in node.properties){
	        property.value = this.visit(property.value);;
	        property.key = this.visit(property.key);
	    }
	    return node;
	};

	FunctionExpression (node){
	    node.id = this.visit(node.id);
	    node.params = this.visit(node.params);
	    node.defaults = this.visit(node.defaults);
	    node.rest = this.visit(node.rest);
	    node.body = this.visit(node.body);
	    return node;
	};

	SequenceExpression (node){
	    node.expressions = this.visit(node.expressions);
	    return node;
	};

	UnaryExpression (node){
	    node.argument = this.visit(node.argument);
	    return node;
	};

	BinaryExpression (node){
	    node.left = this.visit(node.left);
	    node.right = this.visit(node.right);
	    return node;
	};

	AssignmentExpression (node){
	    node.right = this.visit(node.right);
	    node.left = this.visit(node.left);
	    return node;
	};

	// the third exp of ForStatement
	UpdateExpression (node){
	    node.argument = this.visit(node.argument);
	    return node;
	};

	LogicalExpression (node){
	    node.left = this.visit(node.left);
	    node.right = this.visit(node.right);
	    return node;
	};

	ConditionalExpression (node){
	    node.test = this.visit(node.test);
	    node.consequent = this.visit(node.consequent);
	    node.alternate = this.visit(node.alternate);
	    return node;
	};

	NewExpression (node){
	    node.callee = this.visit(node.callee);
	    node.arguments = this.visit(node.arguments);
	    return node;
	};

	CallExpression (node){
	    node.arguments = this.visit(node.arguments);
	    node.callee = this.visit(node.callee);
	    return node;
	};

	// MemberExpression
	MemberExpression (node){
	    node.object = this.visit(node.object);
	    node.property = this.visit(node.property);
	    return node;
	};

	// ObjectPattern
	ObjectPattern (node){
	    for(property in node.properties){
	        property.value = this.visit(property.value);
	        property.key = this.visit(property.key);
	    }
	    return node;
	};

	ArrayPattern (node){
	    node.elements = this.visit(node.elements);
	    return node;
	};

	CatchClause (node){
	    node.param = this.visit(node.param);
	    node.guard = this.visit(node.guard);
	    node.body = this.visit(node.body);
	    return node;
	};

	Identifier (node){
	    return node;
	};

	Literal (node){
	    return node;
	};

	YieldExpression (node){
	    node.argument = this.visit(node.argument);
	    return node;
	};

	ComprehensionExpression (node){
	    node.body = this.visit(node.body);
	    node.blocks = this.visit(node.blocks);
	    node.filter = this.visit(node.filter);
	    return node;
	};

	ComprehensionBlock (node){
	    node.left = this.visit(node.left);
	    node.right = this.visit(node.right);
	    return node;
	};

	ClassExpression (node){
	    throw new Error('not implemented');
	};

	ClassBody (node){
	    throw new Error('not implemented');
	};

	ClassDeclaration (node){
	    throw new Error('not implemented');
	};

	ClassHeritage (node){
	    throw new Error('not implemented');
	};

	ArrowFunctionExpression (node){
	    node.params = this.visit(node.params);
	    node.defaults = this.visit(node.defaults);
	    node.rest = this.visit(node.rest);
	    node.body = this.visit(node.body);
	    return node;
	    // why here has this statement ?
	    throw new Error('not implemented');
	};

	ExportBatchSepcifier (node){
	    throw new Error('not implemented');
	};

	ExportSepcifier (node){
	    throw new Error('not implemented');
	};

	ImportDeclaration (node){
	    throw new Error('not implemented');
	};
	ImportSepcifier (node){
	    throw new Error('not implemented');
	};

	ExportDeclaration (node){
	    throw new Error('not implemented');
	};

	MethodDefinition (node){
	    throw new Error('not implemented');
	};

	Property (node){
	    throw new Error('not implemented');
	};

	ModuleDeclaration (node){
	    throw new Error('not implemented');
	};

	SpreadElement (node){
	    throw new Error('not implemented');
	};

	TemplateElement (node){
	    throw new Error('not implemented');
	};

	TaggedTemplateExpression (node){
	    throw new Error('not implemented');
	};

	TemplateLiteral (node){
	    throw new Error('not implemented');
	};
};
	


module.exports.Visitor = Visitor;
