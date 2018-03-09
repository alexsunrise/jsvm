({CowObjectMetadata} = require('./metadata'));
({defProp} = require('./util'));

function RegExpProxy(regexp, realm){
	this.regexp = regexp;
	this.realm = realm;
	this.lastIndex = 0;
	var md = new CowObjectMetadata(this, realm);
	md.proto = realm.getNativeMetadata(RegExp.prototype);
	md.defineProperty('global', {value: regexp.global});
	md.defineProperty('ignoreCase', {value: regexp.ignoreCase});
	md.defineProperty('multiline', {value: regexp.multiline});
	md.defineProperty('source', {value: regexp.source});
	defProp(this, '__md__', {
		value: md,
		writable: true
	});
};

RegExpProxy.__name__ = 'RegExp';

module.exports = RegExpProxy;