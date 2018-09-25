var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);;
var router = express.Router();
var qs=require('querystring').stringify, url=require('url'), clone=require('clone'), sortObj=require('sort-object'), md5=require('md5');
var httpf=require('httpf'), path=require('path'), merge=require('gy-merge');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var _=require('lodash'),async=require('async'), request=require('request');

const merchant_id='227776058148130816', merchant_key='34ca94d5e5b34abf97cb583e2c915cf9';
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
/************hepay spec */
function hepaySign(req, res, orderid, money, type, callback){
	// debugout(this.req.headers);
	if (req.headers['referer']) {
		var header=url.parse(req.headers['referer']);
		header.pathname=path.join(header.pathname, req.baseUrl, req.path);
	} else {
		var header=url.parse(req.originalUrl);
		header.protocol=req.protocol+':';
		header.host=req.headers['host'];
	}
	header.search=header.path=undefined;
	var supportedMethod=['1010','1000', '1013'];
	if (type<0 || type>=supportedMethod.length) type=0;
	var o={
		order_id:orderid,
		merchant_id:merchant_id,
		order_amt:''+money*100,
		return_url:url.format(merge.recursive(true, header, {pathname: url.resolve(header.pathname, 'rc') })),
		bg_url:url.format(merge.recursive(true, header, {pathname: url.resolve(header.pathname, 'pay') })),
		biz_code:supportedMethod[type]
	};
	o.sign=signObj(o);
	debugout(o);
	return o;
}
router.all('/rc', function(req, res) {
	res.send('充值完成，请返回游戏');
});
getDB(function(err, db) {
	if (err) return router.use(function(req,res) {
		res.send({err:err});
	});
	router.all('/pay', httpf({order_id:'string', order_amt:'number', state:'number', sign:'string', callback:true}, function(orderid, amount, state, sign, callback) {
		debugout(this.req.body, this.req.query);
		try {
			if (state!=0) return callback(null, httpf.text('ok'));
			var self=this;
			if (signObj(this.req.body)!=sign) return callback(null, httpf.text('sign err'));
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
	function doPay(err, orderid, money, prefer) {
		try {
		if (err) {
			debugout(err);
			return this.res.send({err:err});
		}
		var p=hepaySign(this.req, this.res, orderid, money, 0);
		var str="";
		for (var ele in p) {
			str+=`<input type="hidden" name="${ele}" value="${p[ele]}" />`;
		}
		this.res.send(`
		<!doctype html>
		<html lang="zh-cn">
		<head>
		  <meta charset="utf-8">
		  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
		  <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
		  <title>支付</title>
		</head>
		<body>
		  <!-- jQuery first, then Popper.js, then Bootstrap JS -->
		  <script src="https://code.jquery.com/jquery-3.2.1.min.js" crossorigin="anonymous"></script>
		  <script src="https://cdnjs.cloudflare.com/ajax/libs/popper.js/1.12.9/umd/popper.min.js" integrity="sha384-ApNbgh9B+Y1QKtv3Rn7W3mgPxhU9K/ScQsAP7hUibX39j7fakFPskvXusvfa0b4Q" crossorigin="anonymous"></script>
		  <script src="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/js/bootstrap.min.js" integrity="sha384-JZR6Spejh4U02d8jOt6vLEHfe/JQGiRRSQQxSfFWpi1MquVdAyjUar5+76PVCmYl" crossorigin="anonymous"></script>
		  <script src="/qrcode.min.js"></script>
		  <div class="container-fluid">
			  <div class="row" style="background-color:#9ec9ec">
					<div class="col-2"><a href="javascript:history.back()" style="font-size:30px; font-weight:bold; color:black; text-decoration:none;">&lt;</a></div>
					<div class="col-10"><span class="right" style="float:right; margin-right:10px; font-size:30px; color:#ef0606">${money}&nbsp;元</span></div>
			  </div>
			  <div class="row" style="margin-top:48px; display:${money>5000?'visible':'none'}">
			  <span style="width:100%; padding-left:40px; padding-right:40px; color:#ef0606; font-size:14px; background-color:#dbe3e8; text-align:center">
				  充值金额不能大于5000元，请返回重新输入。
			  </span>
			  <a href="javascript:history.back()" class="btn btn-lg btn-block btn-outline-primary" style="margin-top:40px">返回</a>
			  </div>
			  <div class="row" style="margin-top:48px; display:${money<=5000?'visible':'none'}">
				  <div class="col-1"></div>
				  <div class="col-10">
				  <div id="qrcode"></div>
				<form id="normal" action="http://120.78.86.252:8962/pay_gate/services/wap/pay" method="post" style="margin-top:100px;width:100%">
					${str}
					<input type="submit" class="btn btn-primary btn-lg btn-block" value="支付宝" />
					<button class="btn btn-primary btn-lg btn-block" disabled>微信</button>
					<a href="javascript:history.back()" class="btn btn-lg btn-block btn-outline-primary" style="margin-top:40px">返回</a>
				</form>
				 </div>
				 <div class="col-1"></div>
			  </div>
			  <div class="row" style="margin-top:34px; padding-left:40px; padding-right:40px; color:#ef0606; font-size:14px; background-color:#dbe3e8; text-align:center" >
					敬告：<li>各位亲们，支付可能遇到一些延时，最多可能需要30秒，如果支付宝没有及时打开请耐心等待。</li>
					<li>支付宝单笔金额小于5000元</li>
			  </div>
		  </div>
		</body>
		<script>
			var isMobile=( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) );
			if (!isMobile) {
				$('#normal').hide();
				$('#qrcode').show();
				new QRCode(document.getElementById("qrcode"), location.href);
			} else {
				$('#normal').show();
				$('#qrcode').hide();    
			}
		</script>
		</html>
				`);
	}catch(e) {
		debugout(e);
		this.res.send(e.message);
	}
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
					return order.err={text:err.title||'错误', url:`/hepay_error.html?msg=${err.message}`};
				}
				if (err.title=='失败') order.err={text:'失败', url:`/hepay_check_balance.html?orderid=${orderid}&msg=${ret.rsp_msg}`}
				order.err=null;
			}
		});
	}
	(function () {
		function _do() {
			for (var i in retry) {
				var item=retry[i];
				if (!item) continue;
				if (item.n>5) {
					item.order.err={text:'重试失败', url:`/hepay_error.html?msg=多次重试仍然失败，返回之后点击%20驳回`}
					delete retry[i];
					return;
				}
				if (item.proc==1) {
					return getBank(item.order.obj, function(err, banks) {
						if (err) {
							if (!err.noretry) add2Retry(order,1);
							return item.order.err={text:err.title||'错误', url:`/hepay_error.html?msg=${err.message}`}
						}
						if (banks.length>1) {
							return item.order.err={text:'选择银行', url:`/hepay_sel_bank.html?banks=${JSON.stringify(bankInfo.data.record)}&bankName=${bankName}&bankBranch=${bankBranch}&orderid=${orderid}`}
						}
						doDispatch(item.order, banks[0]);
					})
				} else doDispatch(item.order);
			}
		}
		// setInterval(_do, 60*1000);
	})();
	var ali_bank_key='f464a60834c944d4a8955432ff5d0b8c';
	// var ali_bank_key='fa2b27966ef04e45817efae241e78e77';
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
					return cb({title:'接口没钱'});
				}
				if (bankinfo.resp.RespCode!='200') {
					if (bankinfo.resp.RespCode=='502') return cb({message:'找不到银行，如果不清楚支行全名时可以只输入xx支行<br>请在返回之后点击 驳回， 并通知代理修改银行信息之后再次提交', title:'银行信息错误', noretry:true});
					return cb({title:'错误', message:bankinfo.resp.RespMsg})
				}
				if (bankinfo.data.record.length==1) {
					var o=clone(bankinfo.data.record[0]);
					db.knownCard.updateOne({_id:order.account_no}, o, {upsert:true},function(){});
				}
				cb(null, bankinfo.data.record);
			})
		})
	}
	function dispatch(order, cb) {
		(!order.sign) && makeSigned(order);
		debugout(order);
		request.post({uri:'http://120.78.86.252:8962/pay_gate/services/order/daifu', body:order, json:true}, function(err, headers, body) {
			debugout(err, body);
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
			cb(null);
		});
	}
	router.all('/dispatch', verifySign, httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', mobile:'string', callback:true}, 
	function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, mobile, callback) {
		try {
        if (!money || !isNumeric(money)) return callback('money必须是数字');
		if (Math.ceil(money*100)!=money*100) return callback('money 最多有两位小数');
		if(money>50000) return callback(null, {text:'超限额 退单', url:`${getHost(this.req)}/hepay_error_ex.html`});
		var order=dispOrders[orderid];
		if (order) return callback('orderid重复');
		order=dispOrders[orderid]={};
		order.order_id=orderid;
		order.err={text:'处理中'}
		order.obj={
			order_id:orderid,
			order_amt:''+(money+3/*手续费*/)*100,
			account_no:bankCard,
			bank_name:bankName,
			account_name:bankOwner,
			mobile:mobile,
			merchant_id:merchant_id,
			bank_firm_name:bankBranch,
			type:'1',
			biz_code:'1010'
		}
		var req=this.req, res=this.res;
		getBank(order.obj, function(err, banks) {
			if (err) {
				if (!err.noretry) add2Retry(order,1);
				order.err={text:err.title||'接口错误', url:`${getHost(req)}/hepay_error.html?msg=${err.message}`};
				return callback(null, {text:err.title||'接口错误', url:`${getHost(req)}/hepay_error.html?msg=${err.message}`});
			}
			if (banks.length>1) {
				return callback(null, {text:'选择银行', url:`${getHost(req)}/hepay_sel_bank.html?banks=${JSON.stringify(bankInfo.data.record)}&bankName=${bankName}&bankBranch=${bankBranch}&orderid=${orderid}`});
			}
			var bi=banks[0];
			order.obj.bank_firm_name=bi.lName;
			order.obj.city=bi.city;order.obj.province=bi.province;
			order.obj.bank_firm_no=bi.bankCode;
			order.obj.bank_name=bi.bank;
			order.obj.bank_code=name2code[bi.bank];
			dispatch(order.obj, function(err) {
				if (err) {
					if (err.title=='失败') return callback(null, {a:1, text:'代付没钱', url:`${getHost(req)}/hepay_check_balance.html?orderid=${orderid}&want=${money}&msg=${err.message}`});
					if (!err.noretry) add2Retry(order, 2);
					order.err={text:err.title||'下发错误', url:`${getHost(req)}/hepay_error.html?msg=${err.message}`}
					return callback(null, {text:err.title||'下发错误', url:`${getHost(req)}/hepay_error.html?msg=${err.message}`})
				}
				callback(null, {text:'处理中'});
			});
		})
	}catch(e) {debugout(e)}
	}));
	router.all('/dispatchStatus', verifySign, httpf({orderids:'array', callback:true}, function(orderids, callback) {
		var req=this.req;
		var ret={};
		orderids.forEach(function(orderid) {
			var order=dispOrders[orderid];
			if (!order) {
				ret[orderid]={text:'不存在'};
				return;
			}
			if (!order.err) {
				ret[orderid]={text:'success'};
				return;
			}
			if (order.err.url && order.err.url.indexOf('http')!=0) order.err.url=getHost(req)+order.err.url;
			ret[orderid]=order.err;
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
		doDispatch(order.obj);
	}));
	var _count=0;
	router.all('/savemoney', httpf({money:'number', no_return:true} , function(money) {
		if (_count>=100) _count=0
		_count++;
		doPay.call(this, null, ''+new Date().getTime()+_count, money);
	}));
});

router.all('/balance', httpf({callback:true}, function(callback) {
	var url='http://120.78.86.252:8962/pay_gate/services/order/balanceQuery';
	async.map([1010,1011,1012],
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
			r[i].biz=({'1001':'微信主扫', '1003':'支付宝主扫','1006':'待付','1010':'支付宝wap','1011':'网银','1012':'QQ扫码'})[r[i].biz_code];
		}
		callback(null, r);
	});
}));
router.all('/payback',function(req, res) {
	res.send({err:'not impl'});
})

module.exports=router;