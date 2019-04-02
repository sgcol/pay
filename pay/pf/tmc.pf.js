var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);
var router = express.Router();
var qs=require('querystring').stringify, url=require('url'), clone=require('clone'), sortObj=require('sort-object'), md5=require('md5');
var httpf=require('httpf'), path=require('path'), merge=require('gy-merge');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var _=require('lodash'),async=require('async'), request=require('request');
const iconv = require("iconv-lite");

const privateKey=formatKey('MIICdgIBADANBgkqhkiG9w0BAQEFAASCAmAwggJcAgEAAoGBAKuaofBewIOJMCz3goaxZkSzqzzuwX9R2zk2b0FAX/zyiQ1sGsD1kul9hzdusSfta1rtwL7MpTrf1TB/K/3HZXejPyokGWwc9atVSumxrRxoWgJdoiYEieRSX+RUD+G515fDtowcr5ISL3tscdcnttJnHrhjU6hjvAflVha7FR+hAgMBAAECgYEAo9cjvkf5Lp0RLh2ytb8ykW2plKewf0s8L8fVOUupWeyHBhWtBYZyGhQLwdUht6lq0ooleQYSy79h4MfKzKZQLPFJpQ7GeILdQ+5R851OBFqtPibSmT7UXQO0xI/FLvk+wAdJuBQLX6xAoiVNS0rwWlXuyYv39CnQiWj62pXNp7ECQQDy8MrGl/yTphXmGkoQvz5zHisuyopqPoLdnts6JNLI0AXjSraWvtjEl/VH9H6x55JFDWiI7KIEeQ/lTLm8O08nAkEAtNQl456zEeMapfkF8lKe1bELWtQjXLSw6Jh7S4e6IJzEAtiqNrw5wTGsgsmz8L76dREqsWbPxU/RjV1qm87X9wJAJNT86T8BvCDiERDLSd60yR85zM5ITfNMQ+1hr18F1gwz2FHrfM9Sbfvb5BzdWHuTYYS25It7xNHV5x3Kyw7y4QJAEkE4cfobabrbfdXd29CraDcvRkQULc+v7Es4Zy+UgqZQw1jMFip6Sh6Ro8Jo/+zHq/nHrZELeIfOR88ebAw9kQJAS+WK4ZQWKX2hQ+nQ5tivXdClKH/pC68jQaemMO2GkSh8EX4Psih0kefwvihQNZ3u035o/jA6HsOzowZP/+Xyxw=='),
	publicKey=formatKey('MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSZZ8TpQHI9Ib4nUOSweNon6PvGhf7T3GMzjvfQFs41hIAhqZYDwC30xkfSklvoxydRtUoAWu0S3l/yleGHREA2avGeqgGCX17GirYO2+rfscrtBzwyEXDYyj35pXiws+PspAp55v9yh/WOygNpAHmytvQkELD8HnMlxuzvwP9RwIDAQAB', 'PUBLIC KEY');

function formatKey(key, type) {
	type=type||'PRIVATE KEY';
	const item = key.split('\n').map(val => val.trim());
	// 删除包含 `RSA PRIVATE KEY / PUBLIC KEY` 等字样的第一行
	if (item[0].includes(type)) {
		item.shift();
	}
	// 删除包含 `RSA PRIVATE KEY / PUBLIC KEY` 等字样的最后一行
	if (item[item.length - 1].includes(type)) {
		item.pop();
	}
	return `-----BEGIN ${type}-----\n${item.join('')}\n-----END ${type}-----`;
}
function sign(o) {
	for (var k in o) {
		if (o[k]=='' || o[k]==null) delete o[k];
	}
	const signStr = Object.keys(o).sort().map((key) => {
		let data = o[key];
        // if (Array.prototype.toString.call(data) !== '[object String]') {
        //     data = JSON.stringify(data);
        // }
        return `${key}=${iconv.encode(data, 'utf8')}`;
	}).join('&');
	const sign = crypto.createSign('RSA-SHA1')
		.update(signStr, 'utf8').sign(privateKey, 'base64');
	return Object.assign(o, { sign });
}
function verifySign(o) {
	// 服务端返回的签名
	const serverSign = o.sign;
	if (!serverSign) return false;
	delete o.sign;
	for (var k in o) {
		if (o[k]=='' || o[k]==null) delete o[k];
	}
	const validateStr=Object.keys(o).sort().map((key) => {
        let data = o[key];
        // if (Array.prototype.toString.call(data) !== '[object String]') {
        //     data = JSON.stringify(data);
        // }
        return `${key}=${iconv.encode(data, 'utf8')}`;
	}).join('&');
	const verifier = crypto.createVerify('RSA-SHA1');
	verifier.update(validateStr, 'utf8');
	return verifier.verify(publicKey, serverSign, 'base64');
}
function expressVerifySign(req, res, next) {
	var stdRet={return_code:'SUCCESS', trans_no:req.body.trans_no, tmc_amt:req.body.tmc_amt, account:req.body.receiver, time:Math.floor(new Date().getTime()/1000)};
	if (_.isEmpty(req.body)) return res.send(sign(Object.assign({result_code:'PARAM ERROR', result_msg:'没有收到参数(body里没有数据)'}, stdRet)));
	if (!verifySign(req.body)) {
		return res.send(sign(Object.assign({result_code:'SIGN ERROR', result_msg:'签名错误'}, stdRet)));
	}
	req.stdRet=stdRet;
	next();
}

const gameToken='35c2d4ae584a1295e15ba00517b172b40a8a3b03';
function signGamePack(o) {
	return Object.assign({sign:md5(qs(sortObj(o))+'&token='+gameToken)}, o);
}
router.all('/rc', function(req, res) {
	res.send('充值完成，请返回游戏');
});
getDB(function(err, db) {
	if (err) return router.use(function(req,res) {
		res.send({err:err});
	});
	router.all('/pong', httpf(function() {
		return {return_code:'SUCCESS'};
	}))
	router.all('/pay', expressVerifySign, httpf({trans_no:'string', tmc_amt:'number', receiver:'string', callback:true}, function(trans_no, tmc_amt, receiver, callback) {
		// trans to game
		var stdRet=this.req.stdRet;
		function signTmc(o) {
			return httpf.json(sign(Object.assign(o, stdRet)));
		}
		db.tmclog.insert(this.req.body, {w:1}, (err)=>{
			if (err) return callback(null, signTmc({result_code:'SYSTEMERROR', result_msg:err.message}));
			request.post('http://nexpro.co/index.php/bsyl/client/addgold', {form:signGamePack({userid:receiver, amount:(tmc_amount/10)})}, (err, header, body)=>{
				if (err) return callback(null, signTmc({result_code:'SYSTEMERROR', result_msg:err.message}));
				try{
					var ret=JSON.parse(body);
				} catch(e) {return callback(null, signTmc({result_code:'SYSTEMERROR', result_msg:e.message}));}
				if (ret.code!=0) return callback(null, signTmc({result_code:'SYSTEMERROR', result_msg:ret.msg}));
				callback(null, signTmc({result_code:'SUCCESS'}, stdRet));
			})
		});
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
		  <div class="container-fluid">
			  <div class="row" style="background-color:#9ec9ec">
					<div class="col-2"><a href="javascript:history.back()" style="font-size:30px; font-weight:bold; color:black; text-decoration:none;">&lt;</a></div>
					<div class="col-10"><span class="right" style="float:right; margin-right:10px; font-size:30px; color:#ef0606">${money}&nbsp;元</span></div>
			  </div>
			  <div class="row" style="margin-top:48px;">
				  <div class="col-1"></div>
				  <div class="col-10">
				  <span id="qr">请打开“时间链APP”，选择转账至 xxxxxx</span>
				 </div>
				 <div class="col-1"></div>
			  </div>
		  </div>
		</body>
		</html>
				`);
	}catch(e) {
		debugout(e);
		this.res.send(e.message);
	}
	}
	router.all('/internal_pay', intfCreateOrder(doPay))
	router.all('/dispatch', verifySign, httpf({orderid:'string', money:'number', alipay:'?string', wechat:'?string', bankName:'?string', bankBranch:'?string', bankCard:'?string', bankOwner:'string', mobile:'string', callback:true}, 
	function(orderid, money, alipay, wechat, bankName, bankBranch, bankCard, bankOwner, mobile, callback) {
		callback(null, {text:'不支持'});
	}));
	router.all('/dispatchStatus', verifySign, httpf({orderids:'array', callback:true}, function(orderids, callback) {
		callback(null, {text:'不支持'});
	}))
	router.all('/verifySign', verifySign, function(req, res) {
		res.send({result:'ok'});
	})
});


module.exports=router;

if (module==require.main) {
	console.log({form:signGamePack({userid:'101883', amount:1})});
	request.post('http://nexpro.co/index.php/bsyl/client/addgold', {form:signGamePack({userid:'101883', amount:1})}, (err, header, body)=>{
		console.log('101883, 1', JSON.parse(body));
	});
	request.post('http://nexpro.co/index.php/bsyl/client/addgold', {form:signGamePack({userid:'101', amount:1})}, (err, header, body)=>{
		console.log('101, 1', JSON.parse(body));
	});
	request.post('http://nexpro.co/index.php/bsyl/client/addgold', {form:signGamePack({userid:'101883', amount:0.01})}, (err, header, body)=>{
		console.log('101883, 0.01', JSON.parse(body));
	});
}