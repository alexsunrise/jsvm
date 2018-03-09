({VmError} = require('./errors'));

class StopIteration extends VmError {
	constructor(value, message = 'iterator has stoped'){
		this.display = 'StopIteration';
		this.value = value;
		this.message = message;
	};
};

class ArrayIterator {
	constructor(elements){
		this.elements = elements;
		this.index = 0;
	};
	
	next(){
		if(this.index >= this.elements.length){
			throw new StopIteration();
		}
		return this.elements[this.index++];
	};
};


module.exports = {
		StopIteration: StopIteration,
		ArrayIterator: ArrayIterator,
};