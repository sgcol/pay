var easym=require('gy-easy-mongo')
  , argv =require('yargs')
	.demand('mongo')
	.describe('mongo', '--mongo=[mongodb://][usr:pwd@]ip[:port][,[usr:pwd@]ip[:port]]/db, 参考https://docs.mongodb.com/manual/reference/connection-string/')
	.argv;

var __stored_db=null;
module.exports=function (cb) {
	if (__stored_db) return cb(null, __stored_db, easym);
	else new easym.DbProvider().init(argv.mongo, {exists:[
		{bills:{index:['user'], capped:true, size:100*1024, max:100000}},
		'knownCard',
		]}, function(err, db) {
		if (err) return cb(err);
		__stored_db=db;
		cb(null, db, easym);
	});
}

