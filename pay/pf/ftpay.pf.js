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
	merchant_id='1416'; merchant_key='bb11a64f0899e4b6c1fdcc509a64e19f17d3da01';	// test version
	ali_bank_key='fa2b27966ef04e45817efae241e78e77';  // test version
} else {
	merchant_id='1416'; merchant_key='bb11a64f0899e4b6c1fdcc509a64e19f17d3da01'; // formal edition
	// merchant_id='227776058148130816'; merchant_key='34ca94d5e5b34abf97cb583e2c915cf9';	// test version
	ali_bank_key='f464a60834c944d4a8955432ff5d0b8c';     // formal edition
}
const dispatchOrderBias='';

function combineObj(o) {
	var r='';
	for (var k in o) {
		if (k=='notifyUrl' ||k=='returnUrl') r+=k+'='+encodeURIComponent(o[k])+'&';
		else r+=k+'='+o[k]+'&';
	}
	return r;
}
function signObj(o) {
	var o=sortObj(clone(o));
	['sign', 'showUrl', 'cardNo', 'bank'].forEach(function(key) {if (o[key]) delete o[key];});
	var str =combineObj(o)+'key='+merchant_key, s=md5(str);
	debugout('sign str', str, 'md5', s);
	return s;
}
function makeSigned(o) {
	o.sign=signObj(o);
	return o;
}
router.use(function(req, res, next) {
	if (req.headers['referer']) {
		var header=url.parse(req.headers['referer']);
	} else {
		var header=url.parse(req.originalUrl);
		header.protocol=req.protocol+':';
		header.host=req.headers['host'];
	}
	baseHeader=header;
	next();
})
router.all('/rc', function(req, res) {
	res.send('充值完成，请返回游戏');
});
function verifyNotifySign(req, res, next) {
	var params=merge(req.query, req.body);
	var sign=params.sign;
	if (!sign) return res.send({err:'no sign'}).end();
	delete params.sign;
	var str=qs(sortObj(params))+merchant_key, s=md5(str);
	if (s==sign) return next();
	var ret={err:'sign err'};
	if (argv.debugout) {
		ret.str=str;
		ret.wanted=s;
	}
	res.send(ret).end();
}
var baseHeader=null;
function baseUrl(req) {
	if (req.headers['referer']) {
		var header=url.parse(req.headers['referer']);
	} else {
		var header=url.parse(req.originalUrl);
		header.protocol=req.protocol+':';
		header.host=req.headers['host'];
	}
	header.search=header.path=undefined;

	return url.format(header);
}
function makeUrl(req, path, query) {
	if (!(req instanceof IncomingMessage)) {
		query=path;
		path=req;
		var header=baseHeader;
	} else {
		if (req.headers['referer']) {
			var header=url.parse(req.headers['referer']);
		} else {
			var header=url.parse(req.originalUrl);
			header.protocol=req.protocol+':';
			header.host=req.headers['host'];
		}
	}

	header.search=header.path=undefined;
	header.pathname=url.resolve(header.pathname, path);
	header.query=query;

	baseHeader=header;
	return url.format(header);
}
getDB(function(err, db) {
	if (err) return router.use(function(req,res) {
		res.send({err:err});
	});
	router.all('/pay', verifyNotifySign, httpf({sdorderno:'string', total_fee:'number', status:'string', callback:true}, function(orderid, amount, state, callback) {
		if (state!=1) return callback(null, httpf.text('ok'));
		var self=this;
		confirmOrder(orderid, amount, function(err) {
			try {
				if (err) {
					debugout('confirm order err', err);
					return callback(err);
				}
				callback(null, httpf.text('ok'));
			} catch(e) {
				debugout('confirmorder excp', e)
				callback(e)
			};
		});
	}));
	router.all('/doOrder', httpf({orderid:'string', money:'number', callback:true}, function(orderid, money, callback){
		let req=this.req;
		var _base=baseUrl(req);
		var p=makeSigned({
			orderid:orderid,
			userid:merchant_id, 
			total_fee:Math.floor(money*100), 
			body:'金币', 
			notifyUrl:makeUrl(req, 'pay'),
			returnUrl:makeUrl(req, 'rc'), 
			paytype:'alipaywap', 
			clientIp:req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']||req.headers['X-Real-IP']||req.headers['x-real-ip']||req.connection.remoteAddress, 
			showUrl:1});
			debugout(p);
		request.post({uri:'http://www.gfdhqn.cn/port/firstsubmit.php', form:p}, (err, header, body)=>{
			debugout(err, body);
			if (err) return callback(err);
			try{
				var ret=JSON.parse(body);
			}catch(e) {
				return callback(e);
			}
			if (ret.r!='1') return callback(ret.errMsg);
			callback(null, ret.data.url);
		});
	}));
	router.all('/order', intfCreateOrder(function (err, orderid, money){
		var req=this.req, res=this.res;
		if (err) return this.res.render('err', {err:err});
		this.res.render('order', {orderid:orderid, money:money})
	}));
	const name2code={
		'中国工商银行':'1001',
		'中国农业银行':'1002',
		'中国银行':'1003',
		'中国建设银行':'1004',
		'交通银行':'1005',
		'中信银行':'1006',
		'中国光大银行':'1007',
		'华夏银行':'1008',
		'中国民生银行':'1009',
		'广发银行':'1010',
		'平安银行':'1011',
		'招商银行':'1012',
		'兴业银行':'1013',
		'上海浦东发展银行':'1014',
		'北京银行':'1015',
		'天津银行':'1016',
		'天津银行':'1016',
		'河北银行':'1017',
		'邯郸市商业银行':'1018',
		'邢台银行':'1019',
		'张家口市商业银行':'1020',
		'承德银行':'1021',
		'沧州银行':'1022',
		'廊坊银行':'1023',
		'衡水银行股份有限公司':'1024',
		'晋商银行':'1025',
		'阳泉市商业银行股份有限公司':'1026',
		'晋城市商业银行':'1027',
		'内蒙古银行':'1028',
		'包商银行':'1029',
		'鄂尔多斯银行':'1030',
		'大连银行':'1031',
		'鞍山市商业银行':'1032',
		'锦州银行':'1033',
		'葫芦岛银行':'1034',
		'营口银行':'1035',
		'阜新银行':'1036',
		'吉林银行':'1037',
		'哈尔滨银行':'1038',
		'龙江银行':'1039',
		'上海银行':'1040',
		'南京银行':'1041',
		'江苏银行':'1042',
		'苏州银行':'1043',
		'江苏长江商业银行':'1044',
		'杭州银行':'1045',
		'宁波银行':'1046',
		'温州银行':'1047',
		'嘉兴银行':'1048',
		'湖州银行':'1049',
		'绍兴银行':'1050',
		'浙江稠州商业银行':'1051',
		'台州银行':'1052',
		'浙江泰隆商业银行':'1053',
		'浙江民泰商业银行':'1054',
		'福建海峡银行':'1055',
		'厦门银行':'1056',
		'南昌银行':'1057',
		'赣州银行':'1058',
		'上饶银行':'1059',
		'齐鲁银行':'1060',
		'青岛银行':'1061',
		'齐商银行':'1062',
		'东营市商业银行':'1063',
		'烟台银行':'1064',
		'潍坊银行':'1065',
		'济宁银行':'1066',
		'泰安市商业银行':'1067',
		'莱商银行':'1068',
		'威海市商业银行':'1069',
		'德州银行':'1070',
		'临商银行':'1071',
		'日照银行':'1072',
		'郑州银行':'1073',
		'开封市商业银行':'1074',
		'洛阳银行':'1075',
		'安阳银行股份有限公司':'1076',
		'许昌银行股份有限公司':'1077',
		'漯河市商业银行':'1078',
		'商丘市商业银行':'1079',
		'驻马店银行股份有限公司（不对外办理业务）':'1080',
		'南阳银行':'1081',
		'汉口银行':'1082',
		'湖北银行股份有限公司':'1083',
		'华融湘江银行股份有限公司':'1084',
		'长沙银行':'1085',
		'广州银行':'1086',
		'珠海华润银行':'1087',
		'广东华兴银行股份有限公司':'1088',
		'广东南粤银行':'1089',
		'东莞银行':'1090',
		'广西北部湾银行':'1091',
		'柳州银行':'1092',
		'桂林银行股份有限公司':'1093',
		'成都银行':'1094',
		'重庆银行':'1095',
		'自贡市商业银行':'1096',
		'攀枝花市商业银行':'1097',
		'德阳银行':'1098',
		'绵阳市商业银行':'1099',
		'贵阳银行':'1100',
		'富滇银行':'1101',
		'长安银行':'1102',
		'兰州银行':'1103',
		'青海银行':'1104',
		'宁夏银行':'1105',
		'乌鲁木齐市商业银行':'1106',
		'昆仑银行':'1107',
		'新疆汇和银行股份有限公司（清算行）':'1108',
		'江苏江阴农村商业银行股份有限公司':'1109',
		'昆山农村商业银行':'1110',
		'吴江农村商业银行':'1111',
		'常熟农村商业银行':'1112',
		'张家港农村商业银行':'1113',
		'广州农村商业银行':'1114',
		'顺德农村商业银行':'1115',
		'海口联合农村商业银行股份有限公司':'1116',
		'重庆农村商业银行':'1117',
		'恒丰银行':'1118',
		'浙商银行':'1119',
		'天津农商银行':'1120',
		'渤海银行':'1121',
		'徽商银行':'1122',
		'上海农商银行':'1123',
		'北京农村商业银行':'1124',
		'吉林农村信用社':'1125',
		'江苏省农村信用社联合社':'1126',
		'浙江省农村信用社':'1127',
		'鄞州银行':'1128',
		'安徽省农村信用社联合社':'1129',
		'福建省农村信用社':'1130',
		'山东省农联社':'1131',
		'湖北农信':'1132',
		'深圳农商行':'1133',
		'东莞农村商业银行':'1134',
		'广西农村信用社（合作银行）':'1135',
		'海南省农村信用社':'1136',
		'四川省农村信用社联合社':'1137',
		'云南省农村信用社':'1138',
		'陕西省农村信用社联合社资金清算中心':'1139',
		'黄河农村商业银行':'1140',
		'中国邮政储蓄银行':'1141',
		'东亚':'1142',
		'外换银行（中国）有限公司':'1143',
		'友利银行':'1144',
		'新韩银行中国':'1145',
		'企业银行':'1146',
		'韩亚银行':'1147',
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
					return order.err={text:err.title||'错误', url:`hepay_error.html?msg=${err.message}`};
				}
				if (err.message=='余额不足') order.err={text:'失败', url:`ftpay_check_balance.html?orderid=${orderid}&msg=${ret.rsp_msg}`}
				return;
			}
			order.err={text:'提交银行'};
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
					item.order.err={text:'重试失败', url:`hepay_error.html?msg=多次重试仍然失败，返回之后点击%20驳回`}
					delete retry[i];
					return;
				}
				if (item.proc==1) {
					return getBank(item.order.obj, function(err, banks) {
						if (err) {
							if (!err.noretry) add2Retry(order,1);
							return item.order.err={text:err.title||'错误', url:`hepay_error.html?msg=${err.message}`}
						}
						if (banks.length>1) {
							return item.order.err={text:'选择银行', url:`ftpay_sel_bank.html?banks=${JSON.stringify(banks)}&bankName=${bankName}&bankBranch=${bankBranch}&orderid=${orderid}`}
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
					var o={orderid:i, userid:merchant_id};
					o.sign=md5(o.orderid+o.userid+merchant_key);
					request.post('http://www.gfdhqn.cn/port/dfsearch.php', {form:o}, function(err, header, body) {
						debugout('timely refresh daifu', err, body);
						if (err) return;
						if (!body) return;
						try {
							var ret=JSON.parse(body);
						} catch(e) {
							return realDispatch(order, cb);
						}
						if (ret.r!='1') order.err={text:'失败', message:ret.rsp_msg, noretry:true};
						switch(ret.data.state) {
							case '0':
								order.err={text:'提交银行'};
								break;
							case '1':
								order.err=null;
								break;
							case '2':
								order.err={text:'失败', message:'处理失败，请驳回', noretry:true};
								break;
							case '3':
								order.err={text:'银行处理中'};	
								break;
						}
					});
			
					// request.post('http://120.78.86.252:8962/pay_gate/services/order/daifuQuery', {body:makeSigned({order_id:i, merchant_id:merchant_id}), json:true}, function(err, header, body) {
					// 	debugout('timely refresh daifu', err, body);
					// 	if (err) return;
					// 	if (!body) return;
					// 	var ret=eval(body);
					// 	if (ret.rsp_code!='00') {
					// 		if (ret.rsp_msg=='订单不存在') {
					// 			if (order.err.text!='查询中') order.err={text:'未处理'}
					// 			return;
					// 		}
					// 		order.err={text:'代付没钱', url:`ftpay_check_balance.html?orderid=${i}&want=${(order.obj.order_amt)/100}&msg=${ret.rsp_msg}`}
					// 		return;
					// 	}
					// 	switch (ret.state) {
					// 		case '0':
					// 		order.err=null;
					// 		break;
					// 		case '1':
					// 		order.err={text:'代付失败', url:`hepay_error.html?msg=银行代付失败，返回之后点击%20驳回`};
					// 		break;
					// 		case '2':
					// 		order.err={text:'银行处理中'};
					// 		break;
					// 	}
					// })
				}
			}
		}
		setInterval(_do, 60*1000);
	})();

	function getBank(order, cb) {
		db.knownCard.find({_id:order.baname}).toArray(function(err,  r) {
			if (!err && r.length>0) {
				return cb(null, [r[0]]);
			}
			request({uri:`http://cnaps.market.alicloudapi.com/lianzhuo/querybankaps?`+qs({card:order.baname, key:order.baaddr}), headers:{Authorization:'APPCODE '+ali_bank_key}}, function(err, header, body) {
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
					db.knownCard.updateOne({_id:order.baname}, o, {upsert:true},function(){});
				}
				cb(null, bankinfo.data.record);
			})
		})
	}
	function realDispatch(order, cb) {
		var o=order;
		o.sign=md5(encodeURIComponent(o.userid+o.dforder+o.df+o.money+o.realname+o.idcard+o.batype+o.baname+o.baaddr+o.channelid+merchant_key));
		debugout('dispatch with data', order);
		request.post({uri:'http://www.gfdhqn.cn/port/dfadd.php', form:order}, function(err, headers, body) {
			debugout('dfadd ret', body);
			if (err) {
				err.title='网络故障'
				return cb(err);
			}
			try {
				var ret=JSON.parse(body);
			} catch(e) {
				return cb(e)
			}
			if (ret.r!='1') {
				debugout(ret, 'failed');
				return cb({title:'失败', message:ret.errMsg});
			}
			// if (ret.state=='1') return cb({title:'失败', message:ret.rsp_msg, noretry:true});
			cb(null);
		});
	}
	function dispatch(order, cb) {
		(!order.sign) && makeSigned(order);
		debugout('dispatch', order);
		var o={orderid:order.dforder, userid:order.userid};
		o.sign=md5(o.orderid+o.userid+merchant_key);
		request.post('http://www.gfdhqn.cn/port/dfsearch.php', {form:o}, function(err, header, body) {
			debugout('check order exists', err, body);
			if (err) return realDispatch(order, cb);
			if (!body) return realDispatch(order, cb);
			try {
				var ret=JSON.parse(body);
			} catch(e) {
				return realDispatch(order, cb);
			}
			if (ret.r!='1') {
				if (ret.errMsg=='错误的代付订单') return realDispatch(order, cb);
				return cb({title:'失败', message:ret.rsp_msg, noretry:true});
			}
			if (ret.data.state=='0') return cb(null, '待处理');
			if (ret.data.state=='1') return cb(null, 'success');
			if (ret.data.state=='2') return cb({title:'失败', message:'处理失败，请驳回', noretry:true});
			if (ret.data.state=='3') return cb(null, '银行处理中');
		});
	}
	router.all('/dispatch', verifySign, httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', mobile:'string', callback:true}, 
	function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, mobile, callback) {
		try {
        if (!money || !isNumeric(money)) return callback('money必须是数字');
		if (Math.ceil(money)!=money) return callback('money 必须是整数');
		if(money<10) return callback(null, {text:'不足下限 退单', url:makeUrl('../../hepay_error.html', {err:'金额必须大于10'})});
		if(money>29999) return callback(null, {text:'超上限 退单', url:makeUrl('../../hepay_error.html', {err:'金额必须小于29999'})});
		orderid+=dispatchOrderBias;
		var order=dispOrders[orderid];
		if (order && order.err.text!='查询中') return callback('orderid重复');
		order=dispOrders[orderid]={};
		order.order_id=orderid;
		order.err={text:'收到订单'}
		order.obj={
			userid:merchant_id,
			dforder:orderid,
			df:'fukuan',
			money:money,
			baname:bankCard,
			realname:bankOwner,
			idcard:'444422200011301216',
			baaddr:bankBranch,
			phoneNo:mobile
		}
		if (bankOwner.indexOf('公司')>=0) order.obj.payee_acct_type=2;
		var req=this.req, res=this.res;
		async.parallel([queryBalance, getBank.bind(null, order.obj)], function(err, results) {
			if (err) {
				if (!err.noretry) add2Retry(order,1);
				order.err={text:err.title||'接口错误', url:makeUrl('../../hepay_error.html', {msg:err.message})};
				return callback(null, order.err);
			}
			var balance=results[0].data[0], banks=results[1];
			if (!balance || balance.unpaid<(money+2)) {
				return callback(null, {text:'代付没钱', url:makeUrl('../../ftpay_check_balance.html', {orderid:orderid, want:money}), noretry:true});		
			}
			order.obj.channelid=Number(balance.channelid);
			if (banks.length>1) {
				order.err={text:'选择银行', url:makeUrl('../../ftpay_sel_bank.html', {banks:JSON.stringify(banks), bankName:bankName, bankBranch:bankBranch, orderid:orderid})};
				return callback(null, order.err);
			}
			var bi=banks[0];
			order.obj.baaddr=bi.lName;
			order.obj.batype=name2code[bi.bank];
			if (!order.obj.batype) {
				order.err={text:'不支持的银行', url:makeUrl('../../ftpay_error_bankname.html', {bank:bi.bank})};
				return callback(null, order.err);
			}
			dispatch(order.obj, function(err, state) {
				if (err) {
					if (err.message=='余额不足') {
						order.err={text:'代付没钱', url:makeUrl('../../ftpay_check_balance.html', {orderid:orderid, want:money, msg:err.message}), noretry:true};
						return callback(null, order.err);
					}
					if (err.message=='订单号重复') {
						order.err={text:'提交银行'};
						callback(null, order.err);
						return;
					}
					if (!err.noretry) add2Retry(order, 2);
					order.err={text:err.title||'下发错误', url:makeUrl('../../hepay_error.html', {msg:err.message})}
					return callback(null, order.err)
				}
				order.err={text:state||'提交银行'};
				callback(null, order.err);
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
		lName && (order.obj.baaddr=lName);
		// city && (order.obj.city=city);
		// province && (order.obj.province=province);
		// bankCode && (order.obj.bank_firm_no=bankCode);
		if (bank) {
			order.obj.batype=name2code[bank];
		}
		order.userSpec=true;
		doDispatch(order);
		callback();
	}));
	var _count=0;
	router.all('/savemoney', httpf({money:'number', no_return:true} , function(money) {
		if (_count>=100) _count=0
		_count++;
		this.res.render('order', {orderid:''+new Date().getTime()+_count, money:money});
	}));
	router.all('/getBank', httpf({card:'?string', branch:'?string', callback:true}, function(card, branch, callback) {
		if (!card) return callback();
		getBank({baname:card, baaddr:branch||''}, callback);
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

function queryBalance(callback) {
	var url='http://www.gfdhqn.cn/port/dfbalance.php';
	var o={rand:(''+Math.random()).substr(0, 10), userid:merchant_id};
	o.sign=md5(o.userid+o.rand+merchant_key);
	request.post(url, {form:o}, function(err, response, data) {
		if (err) return callback(err);
		if (data) {
			try{
				data=JSON.parse(data);
			}catch(e) {return callback(e)}
			if (data.r!='1') return callback(data.errMsg);
			callback(null, data);
		}
	})
} 
router.all('/balance', httpf({callback:true}, queryBalance));


module.exports=router;