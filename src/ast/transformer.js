function Transformer(){
    visitors = 1 <= arguments.length ? slice.call(arguments, 0) : [];
    this.visitors = visitors;
}

Transformer.prototype.transform = function(ast){
    for(visitor in this.visitors){
        ast = visitor.visit(ast);
    }
    return ast;
};
