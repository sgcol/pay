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
		db.tonydisp.find({used:false}).toArray(function(err, r) {
			if (err) return cb(null, db); // without recoved dispOrders;
			var dispOrders={};
			for (var i=0; i<r.length; i++) {
				dispOrders[r[i]._id]=r[i];
			}
			cb(null, db, dispOrders);
		});
	})
})(openService);

function openService(err, db, dispOrders) {
	dispOrders=dispOrders||{};
	router.all('/dispatch', httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', mobile:'string', callback:true}, 
	function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, mobile, callback) {
        if (!money || !isNumeric(money)) return callback('money必须是数字');
		if (Math.ceil(money*100)!=money*100) return callback('money 最多有两位小数');
		debugout(dispOrders);
		var order=dispOrders[orderid];
		if (order && order.err.text!='查询中') return callback('orderid重复');
		order=dispOrders[orderid]={};
		order.order_id=orderid;
		order.err={text:'收到订单'}
		order=merge(order, {
			order_amt:money,
			account_no:bankCard,
			bank_name:bankName,
			account_name:bankOwner,
			mobile:mobile,
			bank_firm_name:bankBranch,
		});
		var req=this.req, res=this.res;
		getBank(order, function(err, banks) {
			if (err) {
				order.err={text:err.title||'接口错误', url:`${getHost(req)}/hepay_error.html?msg=${err.message}`};
				return callback(null, {text:err.title||'接口错误', url:`${getHost(req)}/hepay_error.html?msg=${err.message}`});
			}
			if (banks.length>1) {
				order.err={text:'选择银行', url:`${getHost(req)}/hepay_sel_bank.html?banks=${JSON.stringify(banks)}&bankName=${bankName}&bankBranch=${bankBranch}&orderid=${orderid}`};
				return callback(null, {text:'选择银行', url:`${getHost(req)}/hepay_sel_bank.html?banks=${JSON.stringify(banks)}&bankName=${bankName}&bankBranch=${bankBranch}&orderid=${orderid}`});
			}
			var bi=banks[0];
			order.bank_firm_name=bi.lName;
			order.city=bi.city;order.province=bi.province;
			order.bank_firm_no=bi.bankCode;
			order.bank_name=bi.bank;
			createOrder(orderid, money, function(err) {
				if (err) return callback(err);
				db.tonydisp.updateOne({ _id:orderid}, merge(order, {time: new Date(), money:money, completeTime:new Date(0), used:false}), {upsert:true});
				callback();
			})
		})
    }));
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