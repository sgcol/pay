const IncomingMessage =require('http').IncomingMessage;
var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);
var router = express.Router();
var qs=require('querystring').stringify, url=require('url'), clone=require('clone'), sortObj=require('sort-object'), md5=require('md5');
var httpf=require('httpf'), path=require('path'), merge=require('gy-merge');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var _=require('lodash'),async=require('async'), request=require('request');

var merchant_id, merchant_key, ali_bank_keyl;
if (argv.dev || process.env.NODE_ENV!='production') {
	merchant_id='261118549953744896'; merchant_key='4cf97dbbb9d954971f9c1adb60441c22';	// test version
	ali_bank_key='fa2b27966ef04e45817efae241e78e77';  // test version
} else {
	merchant_id='261118549953744896'; merchant_key='4cf97dbbb9d954971f9c1adb60441c22'; // formal edition
	// merchant_id='227776058148130816'; merchant_key='34ca94d5e5b34abf97cb583e2c915cf9';	// test version
	ali_bank_key='f464a60834c944d4a8955432ff5d0b8c';     // formal edition
}
const dispatchOrderBias='32ff5d0b8c';

function combineObj(o) {
	var r='';
	for (var k in o) {
		r+=k+'='+o[k]+'&';
	}
	return r;
}
function signObj(o, forceSign) {
	var o=sortObj(clone(o));
	_.without(['sign', 'extra', 'biz_code', 'card_no','type', 'bank_firm_no', 'bank_firm_name', 'city', 'province'], forceSign).forEach(function(key) {if (o[key]) delete o[key];});
	var str =combineObj(o)+merchant_key, s=md5(str).toUpperCase();
	return s;
}
function makeSigned(o, forceSign) {
	o.sign=signObj(o, forceSign);
	return o;
}

const availbleMoney=[30, 50, 100, 200, 500];

const PAYBYALIPAY=0, PAYBYWECHAT=3;
/************hepay spec */
function hepaySign(req, res, orderid, money, type, callback){
	if (req.headers['referer']) {
		var header=url.parse(req.headers['referer']);
		header.pathname=path.join(header.pathname, req.baseUrl, req.path);
	} else {
		var header=url.parse(req.originalUrl);
		header.protocol=req.protocol+':';
		header.host=req.headers['host'];
	}
	header.search=header.path=undefined;
	var supportedMethod=['1010','1000', '1013', '1000'];
	if (type<0 || type>=supportedMethod.length) type=0;
	var o={
		order_id:orderid,
		merchant_id:merchant_id,
		order_amt:''+money*100,
		return_url:makeUrl('rc'),
		bg_url:makeUrl('pay'),
		biz_code:supportedMethod[type]
	};
	o.sign=signObj(o);
	debugout(o);
	return o;
}

var baseHeader=null;
function makeUrl(req, path, query) {
	if (!(req instanceof IncomingMessage)) {
		query=path;
		path=req;
		var header=baseHeader;
	} else {
		var header=url.parse(req.originalUrl);
		header.protocol=req.protocol+':';
		header.host=req.headers['host'];
	}

	header.search=header.path=undefined;
	header.pathname=url.resolve(header.pathname, path);
	header.query=query;

	baseHeader=header;
	return url.format(header);
}
router.use(function(req, res, next) {
	var header=url.parse(req.originalUrl);
	header.protocol=req.protocol+':';
	header.host=req.headers['host'];

	baseHeader=header;
	next();
})

router.all('/rc', function(req, res) {
	res.send('充值完成，请返回游戏');
});
getDB(function(err, db) {
	if (err) return router.use(function(req,res) {
		res.send({err:err});
	});
	router.all('/pay', httpf({order_id:'string', order_amt:'number', state:'number', sign:'string', callback:true}, function(orderid, amount, state, sign, callback) {
		debugout('3rd pay', this.req.body, this.req.query);
		try {
			if (state!=0) return callback(null, httpf.text('ok'));
			var self=this;
			if (signObj(this.req.body)!=sign) {
				var ret='sign err';
				if (argv.debugout) ret +=' wanted:'+signObj(this.req.body);
				return callback(null, httpf.text(ret));
			}
			confirmOrder(orderid, amount/100, function(err) {
				try {
					if (err) {
						debugout('confirm order err', err);
						return callback(null, httpf.text(err.toString()));
					}
					callback(null, httpf.text('ok'));
				} catch(e) {debugout('confirmorder excp', e)};
			});
		} catch(e) {
			debugout(e);
		} 
	}));
	router.all('/hepaySign', httpf({orderid:'string', money:'number'}, function(orderid, money) {
		return hepaySign(this.req, this.res, orderid, money, PAYBYWECHAT);
	}));
	function doPay(err, orderid, money, prefer) {
		this.res.redirect(makeUrl('../../doOrder.html', {orderid:orderid, money:money}));
	}
	router.all('/internal_pay', intfCreateOrder(doPay))
	const name2code={
		'中国建设银行':'CCB',
		'中国农业银行':'ABC',
		'中国工商银行':'ICBC',
		'中国银行':'BOC',
		'上海浦东发展银行':'SPDB',
		'中国光大银行':'CEB',
		'平安银行':'PABC',
		'兴业银行':'CIB',
		'中国邮政储蓄银行':'POST',
		'中信银行':'CITIC',
		'华夏银行':'HXB',
		'招商银行':'CMB',
		'广东发展银行':'GDB',
		'北京银行':'BCCB',
		'上海银行':'SHB',
		'中国民生银行':'CMBC',
		'交通银行':'BCOM',
		'北京农村商业银行':'BJRCB',
		'建设银行':'CCB','农业银行':'ABC','工商银行':'ICBC','浦发银行':'SPDB','光大银行':'CEB','平安银行':'PABC','兴业银行':'CIB','邮政储蓄银行':'POST','中信银行':'CITIC','华夏银行':'HXB',
		'招商银行':'CMB','广发银行':'GDB','北京银行':'BCCB','上海银行':'SHB','民生银行':'CMBC','交通银行':'BCOM','北京农村商业银行':'BJRCB'
	}
	var dispOrders={}, retry={};
	function add2Retry(order) {
		var item=retry[order.order_id];
		if (item) item.n++;
		else retry[order.order_id]={order:order, n:0};
	}
	function doDispatch(order, bi) {
		if(bi) {
			order.obj.bank_firm_name=bi.lName;
			order.obj.city=bi.city;order.province=bi.province;
			order.obj.bank_firm_no=bi.bankCode;
			order.obj.bank_code=name2code[bi.bank];
		}
		dispatch(order.obj, function(err) {
			if (err) {
				if (!err.noretry) {
					add2Retry(order, 2);
					return order.err={text:err.title||'错误', url:makeUrl('../../hepay_error.html', {err:err.message})};
				}
				if (err.message=='余额不足') order.err={text:'失败', url:makeUrl('../../hepay_cs_check_balance.html', {orderid:orderid, msg:ret.rsp_msg})}
				order.err={text:'提交银行'};
			}
		});
	}
	(function () {
		var finishedOrder=new WeakMap();
		function _do() {
			// debugout('retry list', retry);
			for (var i in retry) {
				var item=retry[i];
				if (!item) continue;
				if (item.n>5) {
					item.order.err={text:'重试失败', url:makeUrl('../../hepay_error.html', {msg:'多次重试仍然失败，返回之后点击%20驳回'})}
					delete retry[i];
					return;
				}
				if (item.proc==1) {
					return getBank(item.order.obj, function(err, banks) {
						if (err) {
							if (!err.noretry) add2Retry(order,1);
							return item.order.err={text:err.title||'错误', url:makeUrl('../../hepay_error.html', {msg:err.message})}
						}
						if (banks.length>1) {
							return item.order.err={text:'选择银行', url:makeUrl('../../hepay_cs_sel_bank.html', {banks:JSON.stringify(banks),bankName:bankName, bankBranch:bankBranch, orderid:orderid})}
						}
						doDispatch(item.order, banks[0]);
					})
				} else doDispatch(item.order);
			}

			for (let i in dispOrders) {
				let order=dispOrders[i];
				if (!order) continue;
				if (!order.err) {
					if (order.userSpec) {
						db.knownCard.updateOne({_id:order.obj.account_no}, order.obj, {upsert:true},function(){});
					}
					if (finishedOrder.has(order)) {
						var c=finishedOrder.get(order);
						if (c>30) dispOrders[i]=undefined;
						else finishedOrder.set(order, c+1);
					} else finishedOrder.set(order, 0);
					continue;
				}
				if (order.err.text=='提交银行' || order.err.text=='银行处理中' || order.err.text=='查询中') {
					request.post('http://120.78.86.252:8962/pay_gate/services/order/daifuQuery', {body:makeSigned({order_id:i, merchant_id:merchant_id}), json:true}, function(err, header, body) {
						debugout('timely refresh daifu', err, body);
						if (err) return;
						if (!body) return;
						var ret=eval(body);
						if (ret.rsp_code!='00') {
							if (ret.rsp_msg=='订单不存在') {
								if (order.err.text!='查询中') order.err={text:'未处理'}
								return;
							}
							order.err={text:'代付没钱', url:makeUrl('../../hepay_cs_check_balance.html', {orderid:i, want:(order.obj.order_amt)/100, msg:ret.rsp_msg})}
							return;
						}
						switch (ret.state) {
							case '0':
							order.err=null;
							break;
							case '1':
							order.err={text:'代付失败', url:makeUrl('../../hepay_error.html', {msg:'银行代付失败，返回之后点击%20驳回'})};
							break;
							case '2':
							order.err={text:'银行处理中'};
							break;
						}
					})
				}
			}
		}
		setInterval(_do, 60*1000);
	})();

	function getBank(order, cb) {
		db.knownCard.find({_id:order.account_no}).toArray(function(err,  r) {
			if (!err && r.length>0) {
				return cb(null, [r[0]]);
			}
			request({uri:`http://cnaps.market.alicloudapi.com/lianzhuo/querybankaps?`+qs({card:order.account_no, key:order.bank_firm_name}), headers:{Authorization:'APPCODE '+ali_bank_key}}, function(err, header, body) {
				debugout(err, body);
				if (err) return cb(err);
				try {
					var bankinfo=JSON.parse(body);
				} catch(e) {
					return cb({title:'阿里银行接口没钱'});
				}
				if (bankinfo.resp.RespCode!='200') {
					if (bankinfo.resp.RespCode=='502') return cb({message:'找不到银行，如果不清楚支行全名时可以只输入xx支行<br>请在返回之后点击 驳回， 并通知代理修改银行信息之后再次提交', title:'银行信息错误', noretry:true});
					return cb({title:'获取银行信息失败', message:bankinfo.resp.RespMsg+' 请在返回后点击 驳回'});
				}
				if (bankinfo.data.record.length==1) {
					var o=clone(bankinfo.data.record[0]);
					db.knownCard.updateOne({_id:order.account_no}, o, {upsert:true},function(){});
				}
				cb(null, bankinfo.data.record);
			})
		})
	}
	function realDispatch(order, cb) {
		request.post({uri:'http://120.78.86.252:8962/pay_gate/services/order/daifu', body:order, json:true}, function(err, headers, body) {
			if (err) {
				err.title='网络故障'
				return cb(err);
			}
			try {
				var ret=eval(body);
			} catch(e) {
				return cb(e)
			}
			if (ret.rsp_code!='00') {
				debugout(ret, 'failed');
				return cb({title:'失败', message:ret.rsp_msg});
			}
			if (ret.state=='1') return cb({title:'失败', message:ret.rsp_msg, noretry:true});
			cb(null);
		});
	}
	function dispatch(order, cb) {
		(!order.sign) && makeSigned(order);
		debugout('dispatch', order);
		request.post('http://120.78.86.252:8962/pay_gate/services/order/daifuQuery', {body:makeSigned({order_id:order.order_id, merchant_id:merchant_id}), json:true}, function(err, header, body) {
			debugout('check order exists', err, body);
			if (err) return realDispatch(order, cb);
			if (!body) return realDispatch(order, cb);
			try {
				var ret=eval(body);
			} catch(e) {
				return realDispatch(order, cb);
			}
			if (ret.rsp_code!='00') {
				if (ret.rsp_msg=='订单不存在') return realDispatch(order, cb);
				return cb({title:'失败', message:ret.rsp_msg});
			}
			if (ret.state=='0') return cb(null, 'success');
			if (ret.state=='1') return cb({title:'失败', message:'处理失败，请驳回', noretry:true});
			if (ret.state=='2') return cb(null, '银行处理中');
		});
	}
	router.all('/dispatch', verifySign, httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', mobile:'string', callback:true}, 
	function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, mobile, callback) {
		try {
        if (!money || !isNumeric(money)) return callback('money必须是数字');
		if (Math.ceil(money*100)!=money*100) return callback('money 最多有两位小数');
		if(money>49999) return callback(null, {text:'超限额 退单', url:makeUrl('../../hepay_error_ex.html')});
		orderid+=dispatchOrderBias;
		var order=dispOrders[orderid];
		if (order && order.err.text!='查询中') return callback('orderid重复');
		order=dispOrders[orderid]={};
		order.order_id=orderid;
		order.err={text:'收到订单'}
		order.obj={
			order_id:orderid,
			order_amt:''+(money/*手续费*/)*100,
			account_no:bankCard,
			bank_name:bankName,
			account_name:bankOwner,
			mobile:mobile,
			merchant_id:merchant_id,
			bank_firm_name:bankBranch,
			type:'1',
			biz_code:'1000'
		}
		var req=this.req, res=this.res;
		getBank(order.obj, function(err, banks) {
			if (err) {
				if (!err.noretry) add2Retry(order,1);
				order.err={text:err.title||'接口错误', url:makeUrl('../../hepay_error.html', {msg:err.message})};
				return callback(null, {text:err.title||'接口错误', url:makeUrl('../../hepay_error.html', {msg:err.message})});
			}
			if (banks.length>1) {
				order.err={text:'选择银行', url:makeUrl('../../hepay_cs_sel_bank.html', {banks:JSON.stringify(banks), bankName:bankName, bankBranch:bankBranch, orderid:orderid})};
				return callback(null, order.err);
			}
			var bi=banks[0];
			order.obj.bank_firm_name=bi.lName;
			order.obj.city=bi.city;order.obj.province=bi.province;
			order.obj.bank_firm_no=bi.bankCode;
			order.obj.bank_name=bi.bank;
			order.obj.bank_code=name2code[bi.bank];
			if (!order.obj.bank_code) {
				order.err={text:'不支持的银行', url:makeUrl('../../hepay_error_bankname.html', {bank:bi.bank})};
				return callback(null, {text:'不支持的银行', url:makeUrl('../../hepay_error_bankname.html', {bank:bi.bank})});
			}
			dispatch(order.obj, function(err, state) {
				if (err) {
					if (err.message=='余额不足') {
						order.err={text:'代付没钱', url:makeUrl('../../hepay_cs_check_balance.html', {orderid:orderid, want:money, msg:err.message}), noretry:true};
						return callback(null, order.err);
					}
					if (err.message=='订单号重复') {
						order.err={text:'提交银行'};
						callback(null, {text:'提交银行'});
						return;
					}
					if (!err.noretry) add2Retry(order, 2);
					order.err={text:err.title||'下发错误', url:makeUrl('../../hepay_error.html', {msg:err.message})}
					return callback(null, {text:err.title||'下发错误', url:makeUrl('../../hepay_error.html', {msg:err.message})})
				}
				order.err={text:state||'提交银行'};
				callback(null, {text:state||'提交银行'});
			});
		})
	}catch(e) {debugout(e)}
	}));
	router.all('/dispatchStatus', verifySign, httpf({orderids:'array', callback:true}, function(orderids, callback) {
		var req=this.req;
		var ret={};
		orderids.forEach(function(orderid) {
			var orgOrderid=orderid;
			orderid+=dispatchOrderBias;
			var order=dispOrders[orderid];
			if (!order) {
				ret[orgOrderid]={text:'查询中'};
				dispOrders[orderid]={err:{text:'查询中'}, obj:{}};
				return;
			}
			if (!order.err) {
				ret[orgOrderid]={text:'success'};
				return;
			}
			if (order.err.url && order.err.url.indexOf('http')!=0) order.err.url=getHost(req)+order.err.url;
			ret[orgOrderid]=order.err;
		});
		callback(null, ret);
	}))
	router.all('/pay_with_bank', httpf({orderid:'string', bank:'?string', lName:'?string', bankCode:'?string', city:'?string', province:'?string', callback:true},
	function(orderid, bank, lName, bankCode, city, province, callback) {
		var order=dispOrders[orderid];
		if (!order) return callback('no such orderid');
		lName && (order.obj.bank_firm_name=lName);
		city && (order.obj.city=city);
		province && (order.obj.province=province);
		bankCode && (order.obj.bank_firm_no=bankCode);
		if (bank) {
			order.obj.bank_name=bank;
			order.obj.bank_code=name2code[bank];
		}
		order.userSpec=true;
		doDispatch(order.obj);
	}));
	var _count=0;
	router.all('/savemoney', httpf({money:'number', no_return:true} , function(money) {
		if (_count>=100) _count=0
		_count++;
		doPay.call(this, null, ''+new Date().getTime()+_count, money);
	}));
	router.all('/getBank', httpf({card:'?string', branch:'?string', callback:true}, function(card, branch, callback) {
		if (!card) return callback();
		getBank({account_no:card, bank_firm_name:branch||''}, callback);
	}))
	router.all('/getPrevBank', httpf({callback:true}, function(callback) {
		db.knownCard.find({_id:'adminCard'}).limit(1).toArray(callback);
	}))
	router.all('/withdraw', httpf({time:'string', sign:'string', card:'string', name:'string', bank:'string', branch:'string', callback:true},
	function(time, sign, card, name, bank, branch, callback) {
		if (md5(key+time)!=sign) return callback('sign err');

	}))
	router.all('/verifySign', verifySign, function(req, res) {
		res.send({result:'ok'});
	})
});

router.all('/balance', httpf({callback:true}, function(callback) {
	var url='http://120.78.86.252:8962/pay_gate/services/order/balanceQuery';
	async.map([1010,1011,1012, 1000],
	function(biz_code, cb) {
		request.post(url, {body:makeSigned({biz_code:''+biz_code, merchant_id:merchant_id}, 'biz_code'), json:true}, function(err, response, data) {
			if (err) return cb(err);
			if (data) {
				try{
					data=eval(data);
				}catch(e) {return cb(e)}
				cb(null, data);
			}
		})
	},
	function(err, r) {
		if (err) return callback(err);
		for (var i=0; i<r.length; i++) {
			var n=Number(r[i].balance)/100;
			r[i].balance=n;
			r[i].biz=({'1000':'微信h5', '1001':'微信主扫', '1003':'支付宝主扫','1006':'待付','1010':'支付宝wap','1011':'网银','1012':'QQ扫码'})[r[i].biz_code];
		}
		callback(null, r);
	});
}));


module.exports=router;