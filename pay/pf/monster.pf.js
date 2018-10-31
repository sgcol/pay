var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);;
var router = express.Router();
var qs=require('querystring').stringify, url=require('url'), clone=require('clone'), sortObj=require('sort-object'), md5=require('md5');
var httpf=require('httpf'), path=require('path'), merge=require('gy-merge');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var _=require('lodash'),async=require('async'), request=require('request'), _base=require('./base.js'), getBank=_base.getBank;

(function prepareData(cb) {
	getDB(function(err, db) {
		if (err) return console.log('load db failed, tony.pf can`t work');
		cb(null, db);
	})
})(openService);

function openService(err, db) {
    router.all('/afterbuy', verifySign, httpf({orderid:'string', money:'number', status:'string', time:'string', callback:true}, function(orderid, money, status, time, callback) {
        callback();
    }))
    router.all('/aftersell', verifySign, httpf({orderid:'string', money:'number', status:'string', time:'string', callback:true}, function(orderid, money, status, time, callback) {
        callback();
    }))
    router.all('/list', httpf({time:'string'}, function(time) {
        var str='';
        for (var i in dispOrders) {
            var order=dispOrders[i];
			if (order.err==null) continue;
			if (order.err.text=='收到订单') 
				str+=[order.order_id, order.account_name, order.account_no, order.bank_name, order.province, order.city, order.bank_firm_name, order.order_amt, '2', ''].join(',')+'\n';
        }
        return httpf.text(str);
	}));
	router.all('/report', httpf({err:'string', orderid:'string', money:'number', time:'string', callback:true}, function(err, orderid, money, time, callback) {
		var order=dispOrders[orderid];
		if (!order) return callback('no such order '+orderid);
		if (err) {
			order.err={text:err};
			return callback();
		}
		order.err=undefined;
		confirmOrder(orderid, money, function(e) {
			if (e) return callback(e);
			db.tonydisp.updateOne({_id:orderid}, {$set:{completeTime:new Date(), used:true}});
			callback();
		})

	}))
};

module.exports=router;