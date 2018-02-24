function Visitor(){
}

Visitor.prototype.visit = function(node) {
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

Visitor.prototype.visitArray(array){
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


Visitor.prototype.Program = function(node){
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.EmptyStatement = function(node){
    return null;
};

Visitor.prototype.BlockStatement = function(node){
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.ExpressionStatement = function(node){
    node.expression = this.visit(node.expression);
    return node;
};

Visitor.prototype.IfStatement = function(node){
    node.test = this.visit(node.test);
    node.consequent = this.visit(node.consequent);
    node.alternate = this.visit(node.alternate);
    return node;
};

Visitor.prototype.LabeledStatement = function(node){
    node.label = this.visit(node.label);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.BreakStatement = function(node){
    node.label = this.visit(node.label);
    return node;
};

Visitor.prototype.ContinueStatement = function(node){
    node.label = this.visit(node.label);
    return node;
};

Visitor.prototype.WithStatement = function(node){
    node.object = this.visit(node.object);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.SwitchStatement = function(node){
    node.discriminant = this.visit(node.discriminant);
    node.cases = this.visit(node.cases);
    return node;
};

Visitor.prototype.SwitchCase = function(node){
    node.test = this.visit(node.test);
    node.consequent = this.visit(node.consequent);
    return node;
};

Visitor.prototype.ReturnStatement = function(node){
    node.argument = this.visit(node.argument);
    return node;
};

Visitor.prototype.ThrowStatement = function(node){
    node.argument = this.visit(node.argument);
    return node;
};

Visitor.prototype.TryStatement = function(node){
    node.block = this.visit(node.block);
    node.handlers = this.visit(node.handles);
    node.guardedHandlers = this.visit(node.guardedHandlers);
    node.finalizer = this.visit(node.finalizer);
    return node;
};

Visitor.prototype.WhileStatement = function(node){
    node.test = this.visit(node.test);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.DoWhileStatement = function(node){
    node.body = this.visit(node.body);
    node.test = this.visit(node.test);
    return node;
};

Visitor.prototype.ForStatement = function(node){
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

Visitor.prototype.ForInStatement = function(node){
    node.left = this.visit(node.left);
    node.right = this.visit(node.right);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.ForOfStatement = function(node){
    node.left = this.visit(node.left);
    node.right = this.visit(node.right);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.LetStatement = function(node){
    node.head = this.visit(node.head);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.DebuggerStatement = function(node){
    return node;
};

Visitor.prototype.FunctionDeclaration = function(node){
    node.id = this.visit(node.id);
    node.params = this.visit(node.params);
    node.defaults = this.visit(node.defaults);
    node.rest = this.visit(node.rest);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.VariableDeclaration = function(node){
    node.declarations = this.visit(node.declarations);
    return node;
};

Visitor.prototype.Declarator = function(node){
    node.id = this.visit(node.id);
    node.init = this.visit(node.init);
    return node;
};

Visitor.prototype.ThisExpression = function(node){
    return node;
};

Visitor.prototype.ArrayExpression = function(node){
    node.elements = this.visit(node.elements);
    return node;
};

// if property is not a reference, it will cause a problem
Visitor.prototype.ObjectExpression = function(node){
    for(property in node.properties){
        property.value = this.visit(property.value);;
        property.key = this.visit(property.key);
    }
    return node;
};

Visitor.prototype.FunctionExpression = function(node){
    node.id = this.visit(node.id);
    node.params = this.visit(node.params);
    node.defaults = this.visit(node.defaults);
    node.rest = this.visit(node.rest);
    node.body = this.visit(node.body);
    return node;
};

Visitor.prototype.SequenceExpression = function(node){
    node.expressions = this.visit(node.expressions);
    return node;
};

Visitor.prototype.UnaryExpression = function(node){
    node.argument = this.visit(node.argument);
    return node;
};

Visitor.prototype.BinaryExpression = function(node){
    node.left = this.visit(node.left);
    node.right = this.visit(node.right);
    return node;
};

Visitor.prototype.AssignmentExpression = function(node){
    node.right = this.visit(node.right);
    node.left = this.visit(node.left);
    return node;
};

// the third exp of ForStatement
Visitor.prototype.UpdateExpression = function(node){
    node.argument = this.visit(node.argument);
    return node;
};

Visitor.prototype.LogicalExpression = function(node){
    node.left = this.visit(node.left);
    node.right = this.visit(node.right);
    return node;
};

Visitor.prototype.ConditionalExpression = function(node){
    node.test = this.visit(node.test);
    node.consequent = this.visit(node.consequent);
    node.alternate = this.visit(node.alternate);
    return node;
};

Visitor.prototype.NewExpression = function(node){
    node.callee = this.visit(node.callee);
    node.arguments = this.visit(node.arguments);
    return node;
};

Visitor.prototype.CallExpression = function(node){
    node.arguments = this.visit(node.arguments);
    node.callee = this.visit(node.callee);
    return node;
};

// what is MemberExpression ?
Visitor.prototype.MemberExpression = function(node){
    node.object = this.visit(object);
    node.property = this.visit(property);
    return node;
};

// what is ObjectPattern ?
Visitor.prototype.ObjectPattern = function(node){
    for(property in node.properties){
        property.value = this.visit(property.value);
        property.key = this.visit(property.key);
    }
    return node;
};

Visitor.prototype.ArrayPattern = function(node){
    node.elements = this.visit(node.elements);
    return node;
};

Visitor.prototype.CatchClause = function(node){
    node.param = this.visit(node.param);
    node.guard = this.visit(node.guard);
    node.body = this.visit(node.body);
    return node;
};

Vsitor.prototype.Identifier = function(node){
    return node;
};

Visitor.prototype.Literal = function(node){
    return node;
};

Visitor.prototype.YieldExpression = function(node){
    node.argument = this.visit(node.argument);
    return node;
};

Visitor.prototype.ComprehensionExpression = function(node){
    node.body = this.visit(node.body);
    node.blocks = this.visit(node.blocks);
    node.filter = this.visit(node.filter);
    return node;
};

Visitor.prototype.ComprehensionBlock = function(node){
    node.left = this.visit(node.left);
    node.right = this.visit(node.right);
    return node;
};

Visitor.prototype.ClassExpression = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ClassBody = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ClassDeclaration = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ClassHeritage = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ArrowFunctionExpression = function(node){
    node.params = this.visit(node.params);
    node.defaults = this.visit(node.defaults);
    node.rest = this.visit(node.rest);
    node.body = this.visit(node.body);
    return node;
    // why here has this statement ?
    throw new Error('not implemented');
};

Visitor.prototype.ExportBatchSepcifier = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ExportSepcifier = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ImportDeclaration = function(node){
    throw new Error('not implemented');
};
Visitor.prototype.ImportSepcifier = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ExportDeclaration = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.MethodDefinition = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.Property = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.ModuleDeclaration = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.SpreadElement = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.TemplateElement = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.TaggedTemplateExpression = function(node){
    throw new Error('not implemented');
};

Visitor.prototype.TemplateLiteral = function(node){
    throw new Error('not implemented');
};

module.exports = Visitor;
